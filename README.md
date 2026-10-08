# Th.D. Scholars Repository

Private Telegram bot and Mini App that gates access to Dylet International Bible Institute's (DIBI) Doctor of Theology program materials behind automated roster verification, with role-based management for Scholars, Faculty, Registrars, and Admins.

Replaces a manual, Google Form-based approval process with a database-backed system: students register through a Telegram Mini App, their enrollment is checked against the official roster, and channel access is approved or declined automatically — with a full audit trail.

## What it does

- **Verifies and onboards Scholars** — registration form inside Telegram, checked against the roster, auto-approves or declines the channel join request.
- **Gates content by role** — Faculty post lectures/seminars/resources; Scholars browse a searchable, tagged content index; Registrars manage enrollment status; Admins control everything.
- **Keeps an audit trail** — every privileged action (approval, decline, role change, removal) is logged.
- **Handles large media sensibly** — big video files route to cloud storage instead of bloating the Telegram channel.

## Tech stack

| Layer | Tech |
|---|---|
| Backend API | Node.js, Express, TypeScript |
| Database | PostgreSQL (raw `pg`, no ORM) |
| Bot | Telegraf |
| Mini App | React, TypeScript, Telegram Mini Apps SDK |
| UI | shadcn/ui, Tailwind CSS, Framer Motion |
| Storage | Google Drive API (large files) |

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

| Doc | Covers |
|---|---|
| [`project-overview.md`](docs/context/project-overview.md) | What this is, why it exists, scope and non-goals |
| [`architecture.md`](docs/context/architecture.md) | How the bot, Mini App, API, and database fit together |
| [`file-structure.md`](docs/context/file-structure.md) | Where everything lives |
| [`database-schema.md`](docs/context/database-schema.md) | Tables, relationships, migration conventions |
| [`api-reference.md`](docs/context/api-reference.md) | Every endpoint, auth, request/response shape |
| [`code-standards.md`](docs/context/code-standards.md) | Naming, conventions, testing expectations |
| [`security.md`](docs/context/security.md) | RBAC, auth, secrets, data protection |
| [`ui-context.md`](docs/context/ui-context.md) | Design system, color tokens, component/motion guidelines |
| [`workflows.md`](docs/context/workflows.md) | Step-by-step user journeys for every role |
| [`developer-map.md`](docs/context/developer-map.md) | Routing guide — which doc to read for a given task |

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

# run database migrations
npm run migrate --workspace=apps/api

# start each app (separate terminals, or a process manager)
npm run dev --workspace=apps/api
npm run dev --workspace=apps/bot
npm run dev --workspace=apps/miniapp
```

### Required environment variables

| App | Variable | Purpose |
|---|---|---|
| `api` | `DATABASE_URL` | PostgreSQL connection string |
| `api` | `BOT_TOKEN` | Used to verify Telegram `initData` (HMAC) |
| `api` | `INTERNAL_SERVICE_TOKEN` | Shared secret for bot → API internal calls |
| `api` | `DRIVE_API_KEY` | Google Drive service account access |
| `bot` | `BOT_TOKEN` | Telegram Bot API token |
| `bot` | `API_BASE_URL` | Where the bot reaches the API service |

Full details in each app's `.env.example`.

## Deployment notes

- `apps/miniapp` must be served over **HTTPS** — Telegram will not load a Mini App over plain HTTP.
- `apps/bot` needs its own HTTPS endpoint if running in webhook mode (recommended for production over polling).
- `packages/shared` must be built **before** any of the three apps in CI/deploy — they all depend on it.
- Database migrations in `apps/api/src/db/migrations/` must be applied as an explicit deploy step — nothing runs them automatically.

## Status

🚧 **In active development.** Phase 1 (manual Google Form registration) is live. This repository implements Phase 2: the automated bot + Mini App system.

## License

Internal project — Dylet International Bible Institute. Not currently licensed for external reuse.