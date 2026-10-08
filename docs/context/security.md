# Security

## Authentication

### Mini App → API
The Mini App never has its own login form. It authenticates using Telegram's `initData`, a signed string Telegram injects into the Mini App at launch, containing the user's Telegram identity.
- The API **must** verify `initData`'s HMAC signature server-side on every request, using the bot token as the secret. Never trust an unverified `initData` payload.
- `initData` includes an `auth_date`; reject requests where this is older than a short window (recommend 24 hours max, shorter if feasible) to limit replay risk.
- The verified `telegram_id` from `initData` is the only source of truth for "who is making this request" — never accept a user ID passed in the request body as identity.

### Bot Service → API
Internal-only endpoints (`/internal/*`) are authenticated with a static internal service token (`X-Internal-Token`), set via environment variable, rotated periodically. These endpoints are never exposed to the public internet without this check.

## Authorization (RBAC)

- **Enforced server-side, on every request, at the API layer.** The Mini App hiding a button for a Scholar is a UX nicety, not a security control. Every controller must check the authenticated user's role before executing a privileged action.
- Role hierarchy for privilege purposes: `admin` > `registrar` / `faculty` (parallel, not ordered relative to each other) > `scholar`.
- **Admin** holds every privilege. **Registrar** and **Faculty** have non-overlapping privilege sets (roster vs. content) — a Registrar is not implicitly allowed to post content, and Faculty is not implicitly allowed to edit roster status.
- Ownership checks matter even within a role: Faculty can edit/delete only `content_posts` where `posted_by` matches their `user_id`, enforced in the service layer, not just filtered out of a list view.
- The boundary for member removal: Admin can remove anyone. Registrar may trigger removal **only** for roster entries they themselves flagged as graduated/withdrawn and that have been confirmed (see `workflows.md` — the system does not auto-kick without this confirmation step).

## Data protection

- **Personal data** (`full_name`, `email`, `registration_id`) in `roster` and `users` is visible only to Registrar and Admin roles via the API; Scholar-facing endpoints never return another user's personal data, only aggregate/public content metadata.
- **Encryption at rest:** the database should run with disk-level encryption at the hosting provider level at minimum; if the hosting provider doesn't provide this by default, it needs to be enabled explicitly before go-live.
- **Encryption in transit:** HTTPS required everywhere — the Mini App will not load over plain HTTP inside Telegram, so this is enforced by the platform itself for that leg; the API-to-database connection should also use TLS if the database is not on the same private network.
- **Audit logs are append-only.** No endpoint should ever update or delete an `audit_logs` row. If an action needs correcting, a new log entry documents the correction — the original stays.

## Secrets management

- `BOT_TOKEN`, `DATABASE_URL`, `DRIVE_API_KEY`, `INTERNAL_SERVICE_TOKEN`, and any other credential live in environment variables only, loaded via `.env` locally (git-ignored) and the hosting platform's secret manager in deployed environments.
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
