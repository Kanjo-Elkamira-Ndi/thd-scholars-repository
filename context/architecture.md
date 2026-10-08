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
Large video files are uploaded from the Mini App directly to Google Drive (service account) above a configurable size threshold; the bot posts the Drive link + thumbnail to the channel instead of a raw Telegram upload. Smaller files may be posted directly to Telegram.

## Data flow: Registration (the critical path)
1. User opens the bot → taps a deep link into the Mini App registration form.
2. Mini App submits the form to `POST /api/registrations` with Telegram `initData` attached.
3. API verifies `initData` (HMAC), validates the Registration ID format, checks it against `roster`.
4. API writes a `join_requests` row with the decision.
5. API calls back to the Bot Service (internal call or shared queue) to execute `approveChatJoinRequest` / `declineChatJoinRequest`.
6. Bot sends the user the approval/decline message.
7. API logs the action to `audit_logs`.

## Data flow: Content posting
1. Faculty opens Mini App → Content → New Post, fills in metadata and uploads a file.
2. If file exceeds the size threshold, Mini App uploads directly to Drive and sends the resulting link to the API; otherwise the file itself is sent to the API, which hands it to the bot for a direct Telegram upload.
3. API writes a `content_posts` row.
4. API triggers the Bot Service to post the formatted message to the channel using the templates in `workflows.md`.
5. Bot returns the `telegram_message_id`, which the API stores against the `content_posts` row for future edit/removal.

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
