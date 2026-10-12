# Th.D. Scholars Repository

Private Telegram bot and Mini App that gates access to Dylet International Bible Institute's (DIBI) Doctor of Theology program materials behind automated roster verification, with role-based management for Scholars, Faculty, Registrars, and Admins.

Replaces a manual, Google Form-based approval process with a database-backed system: students register through a Telegram Mini App, their enrollment is checked against the official roster, and channel access is approved or declined automatically — with a full audit trail.

## What it does

- **Verifies and onboards Scholars** — registration form inside Telegram, checked against the roster, auto-approves or declines the channel join request.
- **Gates content by role** — Faculty post lectures/seminars/resources; Scholars browse a searchable, tagged content index; Registrars manage enrollment status; Admins control everything.
- **Keeps an audit trail** — every privileged action (approval, decline, role change, removal) is logged.
- **Handles large media sensibly** — big video files route to cloud storage instead of bloating the Telegram channel.
- **Runs scheduled jobs and notifies people** — a quarterly roster audit and a weekly access-review reminder run in-process (claimed once per period in `job_runs`), and role changes, removals, audit flags, and repeated-failure alerts reach the right users by DM.

## Tech stack

| Layer       | Tech                                      |
| ----------- | ----------------------------------------- |
| Backend API | Node.js, Express, TypeScript              |
| Database    | PostgreSQL (raw `pg`, no ORM)             |
| Bot         | Telegraf                                  |
| Mini App    | React, TypeScript, Telegram Mini Apps SDK |
| UI          | shadcn/ui, Tailwind CSS, Framer Motion    |
| Storage     | Google Drive API (large files)            |

## Project structure

This is a monorepo (npm/pnpm workspaces):

```
apps/
├── api/        # Express + TS backend — single source of truth, owns the database
├── bot/        # Telegraf bot — thin client over the API
└── miniapp/    # React + TS Telegram Mini App — the UI
packages/
└── shared/     # Shared types, constants, and zod schemas across all three apps
docs/
└── context/    # Full project context pack (architecture, schema, API reference, etc.)
```

See [`docs/context/file-structure.md`](docs/context/file-structure.md) for the complete breakdown.

## Documentation

This repo ships with a full context pack under [`docs/context/`](docs/context/), written for both human contributors and AI coding agents:

| Doc                                                       | Covers                                                   |
| --------------------------------------------------------- | -------------------------------------------------------- |
| [`project-overview.md`](docs/context/project-overview.md) | What this is, why it exists, scope and non-goals         |
| [`architecture.md`](docs/context/architecture.md)         | How the bot, Mini App, API, and database fit together    |
| [`file-structure.md`](docs/context/file-structure.md)     | Where everything lives                                   |
| [`database-schema.md`](docs/context/database-schema.md)   | Tables, relationships, migration conventions             |
| [`api-reference.md`](docs/context/api-reference.md)       | Every endpoint, auth, request/response shape             |
| [`code-standards.md`](docs/context/code-standards.md)     | Naming, conventions, testing expectations                |
| [`security.md`](docs/context/security.md)                 | RBAC, auth, secrets, data protection                     |
| [`ui-context.md`](docs/context/ui-context.md)             | Design system, color tokens, component/motion guidelines |
| [`workflows.md`](docs/context/workflows.md)               | Step-by-step user journeys for every role                |
| [`developer-map.md`](docs/context/developer-map.md)       | Routing guide — which doc to read for a given task       |

**Start with `developer-map.md`** if you're picking up a task and aren't sure where to look first.

## Getting started

```bash
# install dependencies across all workspaces
npm install

# build the shared package first — api, bot, and miniapp all depend on it
npm run build --workspace=packages/shared

# copy env templates and fill in real values
cp apps/api/.env.example apps/api/.env
cp apps/bot/.env.example apps/bot/.env
cp apps/miniapp/.env.example apps/miniapp/.env

# run database migrations
npm run migrate --workspace=apps/api

# start each app (separate terminals, or a process manager)
npm run dev --workspace=apps/api
npm run dev --workspace=apps/bot
npm run dev --workspace=apps/miniapp
```

### Required environment variables

| App   | Variable                 | Purpose                                    |
| ----- | ------------------------ | ------------------------------------------ |
| `api` | `DATABASE_URL`              | PostgreSQL connection string               |
| `api` | `API_INTERNAL_TOKEN`        | Shared secret for bot → API internal calls |
| `api` | `MINIAPP_ORIGIN`            | Allowed CORS origin for the Mini App       |
| `api` | `PORT`                      | HTTP port the API listens on (default 3000)|
| `api` | `NODE_ENV`                  | `development` \| `test` \| `production`    |
| `api` | `BOT_TOKEN`                 | Telegram bot token — HMAC key verifying Mini App `initData` |
| `api` | `TELEGRAM_AUTH_MAX_AGE_SECONDS` | Accepted age of `initData` before it is rejected (default `86400`) |
| `api` | `AUTH_MOCK_ENABLED`         | `true` enables the dev-only `X-Mock-User` auth path (refused in production) |
| `api` | `REGISTRATION_RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window for `POST /api/registrations`, per `telegram_id` (default `900`) |
| `api` | `REGISTRATION_RATE_LIMIT_MAX` | Max registration attempts per window (default `5`) |
| `api` | `REPEATED_REGISTRATION_FAILURE_THRESHOLD` | Declines within the window before the repeated-failure hook fires (default `3`) |
| `api` | `REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS` | Window for counting repeated declines (default `86400`) |
| `api` | `JOIN_REQUEST_DELIVERY_MAX_ATTEMPTS` | Delivery retries before a join request is marked failed (default `5`) |
| `api` | `JOIN_REQUEST_DELIVERY_BACKOFF_BASE_SECONDS` | Exponential-backoff base for delivery retries (default `60`) |
| `api` | `JOIN_REQUEST_DELIVERY_LEASE_SECONDS` | Processing lease before a claim is reclaimed (default `120`) |
| `api` | `JOIN_REQUEST_DELIVERY_BATCH_SIZE` | Max tasks returned per claim when no `limit` is sent (default `10`) |
| `api` | `CONTENT_STAGING_DIR` | Persistent dir for files routed to Telegram (default `.staging/content`) |
| `api` | `CONTENT_DELIVERY_MAX_ATTEMPTS` | Content publish/delete retries before a post is marked failed (default `5`) |
| `api` | `CONTENT_DELIVERY_BACKOFF_BASE_SECONDS` | Exponential-backoff base for content delivery retries (default `60`) |
| `api` | `CONTENT_DELIVERY_LEASE_SECONDS` | Processing lease before a content claim is reclaimed (default `120`) |
| `api` | `CONTENT_DELIVERY_BATCH_SIZE` | Max content tasks returned per claim (default `10`) |
| `api` | `MEMBER_REMOVAL_MAX_ATTEMPTS` | Removal retries before a member removal is marked failed (default `5`) |
| `api` | `MEMBER_REMOVAL_BACKOFF_BASE_SECONDS` | Exponential-backoff base for member-removal retries (default `60`) |
| `api` | `MEMBER_REMOVAL_LEASE_SECONDS` | Processing lease before a removal claim is reclaimed (default `120`) |
| `api` | `MEMBER_REMOVAL_MAX_BATCH` | Max removals returned per claim (default `100`) |
| `api` | `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account JSON used to upload large files to a Shared Drive (optional; unset disables Drive routing) |
| `api` | `GOOGLE_DRIVE_FOLDER_ID` | Destination Shared Drive folder id (optional) |
| `api` | `JOBS_ENABLED` | Enables the in-process job scheduler (default `true`; forced off under `NODE_ENV=test`) |
| `api` | `JOBS_TIMEZONE` | Timezone for quarter/week keys (default `UTC`) |
| `api` | `AUDIT_JOB_CRON` | Quarterly-audit cron (default `0 6 1 1,4,7,10 *`) |
| `api` | `ACCESS_REVIEW_REMINDER_CRON` | Access-review-reminder cron (default `0 6 * * 1`, Mondays) |
| `api` | `JOB_RUN_STALE_MINUTES` | Minutes before a `started` job run is considered stale and retaken (default `30`) |
| `api` | `NOTIFICATION_MAX_ATTEMPTS` | Notification delivery retries before a row is marked failed (default `5`) |
| `api` | `NOTIFICATION_BACKOFF_BASE_SECONDS` | Exponential-backoff base for notification retries (default `60`) |
| `api` | `NOTIFICATION_LEASE_SECONDS` | Processing lease before a notification claim is reclaimed (default `120`) |
| `api` | `NOTIFICATION_BATCH_SIZE` | Max notifications returned per claim (default `10`) |
| `bot` | `BOT_TOKEN`                 | Telegram Bot API token                     |
| `bot` | `API_BASE_URL`              | Where the bot reaches the API service      |
| `bot` | `BOT_NOTIFICATION_BATCH_SIZE` | Max notifications delivered per poll (default `10`) |
| `miniapp` | `VITE_API_BASE_URL`     | API base including `/api` (defaults to same-origin `/api`) |
| `miniapp` | `VITE_MOCK_USER`        | Dev-only JSON identity (`{"id":1}`) used when not running inside Telegram |

`BOT_TOKEN` is now required by the API as well — it is the HMAC key the API uses to verify Telegram `initData`. Drive routing needs `GOOGLE_SERVICE_ACCOUNT_JSON` **and** `GOOGLE_DRIVE_FOLDER_ID`: the service account must have access to a Shared Drive, and `CONTENT_STAGING_DIR` must be a persistent volume shared across API replicas.

Running the Mini App locally outside Telegram: set `AUTH_MOCK_ENABLED=true` in `apps/api/.env`, `MINIAPP_ORIGIN=http://localhost:5173`, and put a matching identity in `apps/miniapp/.env` (`VITE_MOCK_USER={"id":1}`). The Mini App sends no `initData` in that case, so the API falls back to the mocked user.

Full details in each app's `.env.example`.

### Bot Service (`apps/bot`)

Runs as a separate process from the API. It holds only the bot token and the internal service token — it never queries Postgres and never makes an authorization decision; it renders what the API returns.

| Variable             | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `BOT_TOKEN`          | Telegram Bot API token (from @BotFather)                                |
| `API_BASE_URL`       | Base URL of the API service (default `http://localhost:3000`)           |
| `API_INTERNAL_TOKEN` | Internal service token — **must match the API's `API_INTERNAL_TOKEN`**  |
| `MINIAPP_URL`        | Deep-link target for the `/start` "Open Registration" button            |
| `BOT_CHANNEL_ID`     | Channel id or `@username` for join-request delivery and invite links    |
| `BOT_OUTBOX_POLL_INTERVAL_MS` | Join-request delivery poll cadence in ms (default `5000`)      |
| `BOT_OUTBOX_BATCH_SIZE` | Max join-request delivery tasks per poll (default `10`)              |
| `BOT_CONTENT_BATCH_SIZE` | Max content publish/delete tasks per poll (default `10`)           |
| `BOT_MEMBER_REMOVAL_BATCH_SIZE` | Max member-removal tasks per poll (default `10`)             |
| `BOT_NOTIFICATION_BATCH_SIZE` | Max notification DMs per poll (default `10`)                   |
| `BOT_MEMBERSHIP_SYNC_INTERVAL_MS` | Membership reconciliation cadence in ms (default `900000` = 15 min) |
| `BOT_MEMBERSHIP_SYNC_RATE_PER_SEC` | Max `getChatMember` calls per second (default `20`)            |
| `BOT_MODE`           | `polling` (dev) or `webhook` (prod); defaults from `NODE_ENV` when unset |
| `BOT_WEBHOOK_DOMAIN` | Public HTTPS origin — required when `BOT_MODE=webhook`                  |
| `BOT_WEBHOOK_PATH`   | Webhook path (default `/telegram/webhook`)                              |
| `BOT_WEBHOOK_SECRET` | Webhook secret token — required when `BOT_MODE=webhook`                 |
| `BOT_WEBHOOK_PORT`   | Webhook listen port (default `8080`)                                    |
| `API_TIMEOUT_MS`     | API request timeout in ms (default `5000`)                              |
| `NODE_ENV`           | `development` \| `test` \| `production`                                 |

```bash
# run the bot (polling in development)
npm run dev --workspace=apps/bot
```

Production uses webhook mode (`BOT_MODE=webhook` with `BOT_WEBHOOK_DOMAIN` and `BOT_WEBHOOK_SECRET` set), behind an HTTPS endpoint.

### Dev helpers (API)

```bash
# seed one dev user per role (scholar/faculty/registrar/admin) — refuses in production
npm run seed --workspace=apps/api

# print a signed `Authorization: tma <initData>` header for a seeded role
npm run make:init-data --workspace=apps/api -- --role=admin

# run a background job through the same path as the scheduler (e.g. quarterly_audit)
npm run run:job --workspace=apps/api -- quarterly_audit
npm run run:job --workspace=apps/api -- access_review_reminder --force

# run the test suite (vitest) across workspaces
npm test

# run the API integration suite against a disposable `_test` database
npm run test:integration --workspace=apps/api
```

## Deployment notes

- `apps/miniapp` must be served over **HTTPS** — Telegram will not load a Mini App over plain HTTP.
- `apps/bot` needs its own HTTPS endpoint if running in webhook mode (recommended for production over polling).
- `packages/shared` must be built **before** any of the three apps in CI/deploy — they all depend on it.
- Database migrations in `apps/api/src/db/migrations/` must be applied as an explicit deploy step — nothing runs them automatically.
- Notification DMs only reach users who have started the bot. Every Admin and Registrar must press **Start** on the bot (otherwise their notification rows fail terminally and are logged, not retried forever).
- The job scheduler runs in-process in the API. Run a single API replica with `JOBS_ENABLED=true` (or rely on the per-run advisory lock/`job_runs` claim) so periodic jobs do not run concurrently across replicas.

## Status

🚧 **In active development.** Phase 1 (manual Google Form registration) is live. This repository implements Phase 2: the automated bot + Mini App system.

## License

Internal project — Dylet International Bible Institute. Not currently licensed for external reuse.
