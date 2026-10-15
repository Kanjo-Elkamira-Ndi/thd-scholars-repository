# Security

## Authentication

### Mini App → API
The Mini App never has its own login form. It authenticates using Telegram's `initData`, a signed string Telegram injects into the Mini App at launch, containing the user's Telegram identity.
- The API **must** verify `initData`'s HMAC signature server-side on every request, using the bot token as the secret. Never trust an unverified `initData` payload.
- `initData` includes an `auth_date`; reject requests where this is older than the staleness window (configurable via `TELEGRAM_AUTH_MAX_AGE_SECONDS`, default 24 hours) to limit replay risk. Requests whose `auth_date` is more than 60 seconds in the future are also rejected.
- The verified `telegram_id` from `initData` is the only source of truth for "who is making this request" — never accept a user ID passed in the request body as identity.

### Bot Service → API
Internal-only endpoints (`/internal/*`) are authenticated with a static internal service token (`X-Internal-Token`), set via environment variable, rotated periodically. These endpoints are never exposed to the public internet without this check.

The bot's `/mystatus` command reads `GET /internal/users/:telegramId/status` — a read-only endpoint (no side effects, no audit log) that returns the same `{ user, roster }` shape as `GET /api/me`. It is behind `X-Internal-Token`; the bot never queries the database or checks roles itself.

**Join-request delivery (Phase 8).** The approval/decline decision is persisted on the `join_requests` row and executed by the bot, which polls `POST /internal/join-requests/claim` (leases work), performs the Telegram action, and reports back via `POST /internal/join-requests/:id/complete`. The bot is outbound-only — the API never calls into it — so a bot outage cannot lose a decision; the row waits, and undelivered rows are retried with exponential backoff and marked `failed` (with an `audit_logs` row) after a configurable cap.

Approval has two shapes: a channel `chat_join_request` is approved in place (`approveChatJoinRequest`); a Mini App-only registration (no prior channel request) is granted access with a **single-use, time-limited invite link** (`createChatInviteLink` with `member_limit: 1` and `expire_date` from `settings.inviteLinkExpirySeconds`). A DM that fails after an approve/decline is logged and non-fatal (the Telegram action already happened); a DM that fails while delivering an invite link is treated as a failure — the just-created link is revoked (`revokeChatInviteLink`) and the attempt is retried, so an unclaimed single-use link is never left live. Re-executing a stale task is idempotent: an already-member requester whose request has vanished is recorded as delivered without issuing a second link.

### Dev-only mock authentication
For local development and automated tests only: setting `AUTH_MOCK_ENABLED=true` lets a request identify itself with an `X-Mock-User` header instead of a signed `initData`. `env.ts` refuses to boot with `AUTH_MOCK_ENABLED=true` when `NODE_ENV=production`, so this path can never be enabled in production. The header is parsed with a strict schema (`{ id, username?, firstName?, lastName? }`) that rejects any `role` or `email` key — identity can be mocked, but authorization always comes from the database. The mock path is clearly marked in `src/middleware/auth.ts` and logs a warning when used. When the flag is off, the `X-Mock-User` header is ignored entirely.

**Join-request delivery (Phase 8).** The approval/decline decision is persisted on the `join_requests` row and executed by the bot, which polls `POST /internal/join-requests/claim` (leases work), performs the Telegram action, and reports back via `POST /internal/join-requests/:id/complete`. The bot is outbound-only — the API never calls into it — so a bot outage cannot lose a decision; the row waits, and undelivered rows are retried with exponential backoff and marked `failed` (with an `audit_logs` row) after a configurable cap.

### Content delivery (Phase 9)
The content module reuses the same outbound-only, leased-outbox pattern and adds the following controls.
- **Drive destination.** Large uploads go to a Google **Shared Drive** (not a personal My Drive) via a service account; the destination folder id is `GOOGLE_DRIVE_FOLDER_ID`. Uploads are resumable with `supportsAllDrives=true`. Files are shared **anyone-with-link, reader** (accepted risk: possession of the link grants read access, but the link is only ever sent to the private channel, never published) and `copyRequiresWriterPermission=true` is set to discourage redistribution.
- **Drive link integrity:** an inbound `driveLink` must be `https` and its hostname must be `drive.google.com` or `docs.google.com`; anything else is `400 VALIDATION_ERROR`.
- **Upload hygiene:** multer disk storage; staged files carry UUID names; both the declared MIME and the magic-byte-detected MIME must be in the format whitelist; temp files are unlinked on every terminal path; a missing staged file is a terminal delivery failure. `GET /api/content` `search` escapes `%`, `_`, and `\` before an `ILIKE`.
- **Caption safety:** user-entered titles are HTML-escaped and hashtags are drawn only from the shared whitelists; captions are truncated to the Telegram limit. Media is sent with the specific Telegram method only for allow-listed MIME types (`audio/*` for mp3/m4a, `video/mp4` for video), otherwise as a document.
- **Deploy notes:** the reverse proxy must allow large request bodies (`client_max_body_size` above `maxContentUploadBytes`) with generous timeouts, and `CONTENT_STAGING_DIR` must be a persistent volume shared across API replicas (a file staged on one replica is downloaded from another).

## Authorization (RBAC)

- **Enforced server-side, on every request, at the API layer.** The Mini App hiding a button for a Scholar is a UX nicety, not a security control. Every controller must check the authenticated user's role before executing a privileged action.
- Role hierarchy for privilege purposes: `admin` > `registrar` / `faculty` (parallel, not ordered relative to each other) > `scholar`.
- **Admin** holds every privilege. **Registrar** and **Faculty** have non-overlapping privilege sets (roster vs. content) — a Registrar is not implicitly allowed to post content, and Faculty is not implicitly allowed to edit roster status.
- Ownership checks matter even within a role: Faculty can edit/delete only `content_posts` where `posted_by` matches their `user_id`, enforced in the service layer, not just filtered out of a list view.
- **Verified-member gate:** `GET /api/content` requires Faculty, Registrar, or Admin, or a Scholar with an `active` roster entry. The roster status is re-queried per request (not cached in the session token), so a Scholar whose status changes loses/regains access immediately; a Scholar without an active entry gets `403 NOT_VERIFIED`.
- The boundary for member removal: Admin can remove anyone. Registrar may trigger removal **only** for roster entries they themselves flagged as graduated/withdrawn and that have been confirmed (see `workflows.md` — the system does not auto-kick without this confirmation step).
- **Membership snapshot staleness:** `channel_membership` is populated by the bot's sync loop, so `GET /api/members` and `GET /api/roster/audit` reflect the *last observed* state, not necessarily the live one. The audit surfaces `membership_unknown` for users with no snapshot rather than treating "unknown" as "not a member", so a stale/empty snapshot can never be read as a clean bill of health.
- **Roster-audit scope:** the audit is driven strictly from `roster` rows. Staff (e.g. a Faculty member) who belong to the channel but have no roster row are never listed for removal — the audit only ever proposes action on enrolled scholars.
- **Admin surfaces are dual-gated.** The Mini App routes `/admin`, `/admin/users`, `/admin/members`, `/admin/audit`, `/admin/settings` carry a `roles: ['admin']` route guard (a UX gate, not a control), and every endpoint behind them (`GET /api/users`, `PATCH /api/users/:id/role`, `GET /api/audit-logs`, `GET/PATCH /api/settings`, `GET /api/members`, `POST /api/members/:userId/remove`) independently requires the `admin` role. Registrar-only flows stay on the roster routes — an Admin gate is never downgraded to "registrar or admin" for convenience.
- **The dashboard's variant is decided by the server from the database role.** `GET /api/dashboard` reads no role query/body/header hint, so a forged hint cannot expose another role's payload; the roster is re-read per call so a revoked/demoted role takes effect without a token change.

## Data protection

- **Personal data** (`full_name`, `email`, `registration_id`) in `roster` and `users` is visible only to Registrar and Admin roles via the API; Scholar-facing endpoints never return another user's personal data, only aggregate/public content metadata.
- **Encryption at rest:** the database should run with disk-level encryption at the hosting provider level at minimum; if the hosting provider doesn't provide this by default, it needs to be enabled explicitly before go-live.
- **Encryption in transit:** HTTPS required everywhere — the Mini App will not load over plain HTTP inside Telegram, so this is enforced by the platform itself for that leg; the API-to-database connection should also use TLS if the database is not on the same private network.
- **Audit logs are append-only.** No endpoint ever updates or deletes an `audit_logs` row; migration `0010` installs a database trigger that rejects `UPDATE`/`DELETE` outright, so immutability is enforced below the application layer too. If an action needs correcting, a new log entry documents the correction — the original stays.
- **Notifications carry no personal data.** Notification payloads and logs hold ids, roles, and counts only — never `full_name`, `email`, `registration_id`, or message bodies. Templates are rendered from a fixed set of event types with whitelisted role names, and every interpolation is HTML-escaped before being sent with `parse_mode: HTML`, so a hostile payload value cannot inject markup. A terminal delivery failure (bot blocked, chat not found, user deactivated) is logged at `warn` with only the recipient's role and user id.
- **Dashboard activity is minimised at the source.** `GET /api/dashboard`'s `recentActivity` is trimmed server-side to `{ action, actorUserId, targetType, createdAt }` — `details` (which holds titles and changed-field text) never reaches the client, and raw `telegram_id`/`full_name` are never rendered from a dashboard payload (actors show as `shortActor`: display name only, never `@username`, phone, or registration id). The Mini App also keeps privacy-sensitive values out of URLs and `localStorage`: deep links carry only safe filters (`discipline`, `format`, `deliveryStatus`, `mine`, `tab`), and detail routes use opaque UUIDs.

## Notification delivery (Phase 11)

The notification outbox reuses the outbound-only, leased-outbox pattern: the API enqueues a concrete `notifications` row per recipient inside (or immediately after) the triggering transaction, and the bot leases rows (`POST /internal/notifications/claim`), sends the DM, and confirms (`POST /internal/notifications/:id/confirm`) — the API never calls the bot. Because a bot can only DM a user who has started it, every Admin and Registrar must press **Start** on the bot; deploy docs call this out, and a recipient who has not is recorded as a terminal failure rather than retried forever. Recipient fan-out (all Admins / all Admins + Registrars) is resolved to concrete user ids at enqueue time; a unique index on `(recipient_user_id, dedupe_key)` guarantees each recipient gets at most one copy of a given event, while a fresh random `dedupe_key` keeps genuinely distinct events separate.

## Background jobs (Phase 11)

`quarterly_audit` and `access_review_reminder` run from an in-process scheduler (`node-cron`) gated by `JOBS_ENABLED` (forced off under `NODE_ENV=test`). Each run is claimed atomically in `job_runs` under a unique `(job, run_key)` — a run that already completed is never repeated, and a run is only retaken when the previous one failed or its lease exceeded `JOB_RUN_STALE_MINUTES`. A Postgres advisory lock (per job) serializes runs across replicas; the lock is released on every exit path, including thrown errors. On SIGTERM/SIGINT the scheduler stops its tasks and releases locks. The jobs call only the shared, request-independent `computeRosterAudit`/count helpers and the notification service — they never depend on an authenticated user.

## Secrets management

- `BOT_TOKEN`, `DATABASE_URL`, `DRIVE_API_KEY`, `API_INTERNAL_TOKEN`, and any other credential live in environment variables only, loaded via `.env` locally (git-ignored) and the hosting platform's secret manager in deployed environments.
- Never commit `.env` files. Each app ships an `.env.example` with placeholder values and comments, not real secrets.
- Rotate the internal service token and any API keys if a developer with access leaves the project or a leak is suspected.

## Input validation

- Every mutating endpoint validates its request body against a `zod` schema from `packages/shared/src/schemas` before touching the database. Reject early, reject with a clear error code — never let malformed input reach a repository function.
- `registration_id` format is validated against the configurable regex stored in system settings (`GET/PATCH /api/settings`), not hardcoded, since the Admin must be able to adjust the ID pattern without a code deploy.
- File uploads (content posts) are checked for MIME type and size before processing; the size threshold for "goes to Drive instead of Telegram" is also configurable, not hardcoded.

## Rate limiting & abuse prevention

- Registration endpoint (`POST /api/registrations`) should be rate-limited per `telegram_id` to prevent rapid repeated submission attempts — this also feeds FR27 (repeated-failure notification to Admin/Registrar) from the requirements.
- General API rate limiting (e.g., per-IP or per-user token bucket) is a reasonable baseline across all endpoints even without a specific abuse pattern observed yet.

## What must never happen (hard rules for AI agents working on this codebase)

- Never bypass `initData` verification "temporarily for testing" in a code path that could ship to production — use a separate mocked auth path gated by `NODE_ENV !== 'production'`, clearly marked, and never merged enabled-by-default.
- Never let the Mini App call the database directly, even for "simple" reads — always through the API.
- Never log full `initData`, tokens, or full `registration_id`/email values in plaintext application logs at `info` level or above — log identifiers (user UUID) instead; use structured logging and keep PII out of logs that might be shipped to a third-party log aggregator.
- Never add a new privileged endpoint without an explicit role check at the top of its controller or middleware chain — this should be enforced by a lint rule or code review checklist, not memory.
