# Architecture

## System components

```
                         ┌─────────────────────────┐
                         │      Telegram Platform    │
                         │  (Channel, Bot API, Mini  │
                         │   App host, Join Requests) │
                         └───────────┬───────────────┘
                                     │
                 ┌───────────────────┼────────────────────┐
                 │                   │                    │
        ┌────────▼───────┐  ┌────────▼────────┐  ┌────────▼────────┐
        │   Bot Service    │  │   Mini App (FE)  │  │  Channel (content│
        │   (Telegraf)     │  │  React + TS      │  │   delivery)      │
        └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘
                 │                     │ initData (HMAC-verified)
                 │                     │
                 └──────────┬──────────┘
                            │ REST (JSON over HTTPS)
                   ┌────────▼─────────┐
                   │     API Service    │
                   │ Node + Express+TS  │
                   │ (controllers/      │
                   │  services/         │
                   │  repositories)     │
                   └────────┬───────────┘
                            │
                   ┌────────▼─────────┐
                   │   PostgreSQL       │
                   │  (raw `pg`, no ORM)│
                   └────────────────────┘
                            │
                   ┌────────▼─────────┐
                   │  Cloud Storage     │
                   │ (Google Drive API  │
                   │  for large video)  │
                   └────────────────────┘
```

## Components in detail

### 1. API Service (`apps/api`)
The single source of truth. Owns the database, enforces RBAC, exposes a REST API consumed by both the Bot and the Mini App. Neither the bot nor the Mini App talk to Postgres directly — everything routes through this service.

### 2. Bot Service (`apps/bot`)
A Telegraf-based process that:
- Handles `/start` and onboarding prompts.
- Listens for `chat_join_request` events and calls the API to decide approve/decline.
- Calls Telegram's `approveChatJoinRequest` / `declineChatJoinRequest`.
- Posts formatted content messages to the channel on behalf of Faculty (triggered by the API after a Mini App submission).
- Sends notifications (approval, decline, role change, etc.).
- Runs a **membership-sync loop** (default every 15 min, throttled to ~20 `getChatMember` calls/sec) that asks the API for a bounded set of known `telegram_id`s to re-check and pushes the observed snapshot back (`PUT /internal/members/snapshot`). The Telegram Bot API cannot enumerate chat members, so the API cannot refresh membership on its own.
- Runs a **member-removal loop** that leases queued removals and performs `banChatMember` → `unbanChatMember({ only_if_banned: true })` (a "user not in chat" error counts as success), then confirms the outcome.
- Runs a **notification delivery loop (Phase 11)** that leases `notifications` rows, DMs the recipient, and confirms — the same outbound-only, leased-outbox pattern as join requests and content.

All five bot loops (join-request delivery, content delivery, membership sync, member removal, notifications) are independent: each wraps its own tick in a `try/catch` so one loop's failure is logged and never stops the others.

The bot is a **thin client** over the API — it should contain minimal business logic itself; verification rules, RBAC, and roster logic live in the API service so both the bot and the Mini App stay consistent.

### 3. Mini App (`apps/miniapp`)
A React + TypeScript single-page app, rendered inside Telegram's in-app browser via the Telegram Mini Apps SDK. Authenticates using Telegram's `initData`, which the API verifies via HMAC using the bot token. The Mini App is the primary interface for:
- Scholars: registration form, content browsing/search, own status.
- Faculty: content upload/posting.
- Registrar: roster management.
- Admin: everything, plus role assignment, audit logs, system configuration.

### 4. Database (PostgreSQL)
Single Postgres instance, raw `pg` driver, no ORM. See `database-schema.md` for full schema. Migrations are plain SQL files, versioned and applied in order (see `file-structure.md` for the migrations directory).

### 5. Cloud Storage
Large files (above the configurable Drive threshold) are streamed by the API to a Google Shared Drive (service account) and the bot posts the share link to the channel instead of a raw Telegram upload. Smaller files are uploaded to Telegram through the Bot Service. The Mini App never talks to Drive directly.

### 6. Background Jobs (in-process, API)
The API runs a small in-process scheduler (`apps/api/src/jobs/`, `node-cron`) for periodic work — `quarterly_audit` and `access_review_reminder`. `JOBS_ENABLED` toggles it (off under `NODE_ENV=test`), and a dev entrypoint (`npm run run:job -- <job> [--force]`) runs any job through the same `runJob` path for local use. See `security.md` for the lock/claim guarantees.

## Data flow: Registration (the critical path)
1. User opens the bot → taps a deep link into the Mini App registration form.
2. Mini App submits the form to `POST /api/registrations` with Telegram `initData` attached.
3. API verifies `initData` (HMAC), validates the Registration ID format, checks it against `roster`.
4. API writes a `join_requests` row with the decision.
5. API calls back to the Bot Service (internal call or shared queue) to execute `approveChatJoinRequest` / `declineChatJoinRequest`.
6. Bot sends the user the approval/decline message.
7. API logs the action to `audit_logs`.

## Data flow: Content posting (Phase 9 — implemented)
1. Faculty opens Mini App → Content → New Post, fills in metadata and either uploads a file or pastes a Drive link.
2. **Size routing happens at the API, not the Mini App.** A file at or below the Drive threshold (`maxUploadSizeBytes`) is staged on disk and uploaded through the Bot Service to Telegram (Telegram caps a single bot upload at 50 MB). A file above the threshold is streamed resumably by the API to a Google **Shared Drive**, and only the share link is stored — this is the path for large media; there is no "direct-to-Telegram 2 GB upload". Anything above `maxContentUploadBytes` is rejected.
3. The API writes the `content_posts` row with `pending_action = 'publish'` (`201`, immediate — no external call in the request path).
4. The Bot Service outbox loop leases the task, posts the formatted message, and confirms; the API stores `telegram_message_id`. Undelivered posts are retried with backoff and marked failed after a cap.

## Data flow: Notifications & background jobs (Phase 11 — implemented)
1. A domain action emits one of five notification events. Admin/Registrar events (`audit_flagged`, `access_review_reminder`, `repeated_registration_failure`) fan out to all matching users; each recipient gets a concrete `notifications` row.
2. `role_changed` is enqueued inside the same transaction as the role change; `repeated_registration_failure` is best-effort after the registration commits.
3. The Bot Service notification loop leases pending rows (`POST /internal/notifications/claim`), renders the event template, DMs the user, and confirms (`POST /internal/notifications/:id/confirm`). Transient failures back off; terminal failures (bot blocked / unreachable) fail immediately.
4. The API scheduler (in-process `node-cron`, gated by `JOBS_ENABLED`) runs `quarterly_audit` (default quarterly) and `access_review_reminder` (default weekly). Each run is claimed atomically in `job_runs` by `(job, run_key)` under a per-job advisory lock, so replicas and restarts cannot double-run a completed period. A `npm run run:job -- <job> [--force]` dev script invokes the same `runJob` path and refuses to run when `NODE_ENV=production`.

## Why a shared API instead of the bot and Mini App each owning logic
Two independent implementations of "is this user allowed to do X" is how RBAC bugs happen. The API is the only place authorization decisions are made; both the bot and the Mini App are callers, not deciders. See `security.md`.

## Deployment shape
- API: single Node process (can be containerized), webhook-mode-compatible.
- Bot: can run in the same process as the API or as a separate process — recommendation is **separate process**, communicating with the API over HTTP (or an internal queue later if volume demands it), so a bot crash doesn't take the API down and vice versa.
- Mini App: static build served over HTTPS (required by Telegram for Mini Apps), can be hosted on the same server or a static host (e.g., Vercel, Netlify, or your existing deployment pattern).
- Database: managed Postgres instance or self-hosted, reachable only from the API service.

## Environments
- `local` — local Postgres, bot in polling mode, Mini App against local API.
- `staging` (optional but recommended before director-facing rollout) — webhook mode, staging bot token, separate database.
- `production` — webhook mode, production bot token, production database, backups enabled.
