# Deploy Runbook

Operational guide for deploying the THD Scholars Repository. Three services plus a
static frontend:

| Service | Package | Runtime | Serves |
|---|---|---|---|
| API | `apps/api` | Node 20+ | Express on `PORT` (default 3000), mounted at `/api` and `/internal` |
| Bot | `apps/bot` | Node 20+ | Telegraf webhook listener on `BOT_WEBHOOK_PORT` (prod) or long polling (dev) |
| Mini App | `apps/miniapp` | static files | Vite build output (`apps/miniapp/dist`), served by nginx or any static host |
| Shared | `packages/shared` | build-time only | Types/schemas/constants consumed from `dist/` by all three |

## 1. Build order

`@thd/shared` is consumed from its `dist/` (no path aliases), so it **must** be built first.
From the repo root:

```bash
npm ci
npm run build:shared          # packages/shared → dist/
npm run build --workspaces    # api (tsc + copy migrations), bot (tsc), miniapp (vite build)
```

A single `npm run build` at the root does exactly this (`build:shared && build --workspaces`).

- API build output: `apps/api/dist` (migrations are copied alongside by `scripts/copy-migrations.ts`).
- Bot build output: `apps/bot/dist`, started with `node dist/index.js`.
- Mini App build output: `apps/miniapp/dist` — pure static assets, deploy to the host
  that terminates the Mini App's HTTPS URL (must be the `t.me` Mini App domain).

## 2. Database & migrations

PostgreSQL 14+ (16 recommended). One database shared by the API (the Bot never touches
the database — it goes through `/internal/*` only).

```bash
# Point the API at the target database first (DATABASE_URL in apps/api/.env), then:
npm run migrate --workspace=@thd/api
```

- `npm run migrate` rebuilds the API and runs `dist/db/migrate.js`, which applies every
  pending file in `src/db/migrations/` in order and records them in `schema_migrations`.
  Migrations are **immutable** once shipped — never edit an applied file; add a new one.
- Run migrations **before** restarting the new API version (old code tolerates new
  schema additions; the reverse is not guaranteed).
- Back up before deploying a release that contains migrations. Migration `0010` installs
  an append-only trigger on `audit_logs` (UPDATE/DELETE are rejected at the DB level).
- `TRUNCATE`/`DROP` statements in the test harness (`src/db/testing/`) only ever target
  a database whose name ends in `_test` and refuse anything else.

## 3. Environment variables

Each app loads `.env` from its own directory in development; in production set these in
the process manager / container environment (never commit `.env`). Every variable below
has a safe default only where marked *(default)* — everything else is **required** and the
app refuses to boot without it.

### API (`apps/api`)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | **Required.** `postgresql://user:pass@host:5432/dbname` |
| `API_INTERNAL_TOKEN` | **Required.** Shared secret for `/internal/*`; generate a long random value; must match the Bot's copy |
| `MINIAPP_ORIGIN` | **Required.** Exact HTTPS origin of the Mini App (CORS allow-list) |
| `BOT_TOKEN` | **Required.** Same token the Bot uses (initData HMAC verification) |
| `TRUST_PROXY` | Hop count in front of the API (`1` behind nginx/pm2). Ensures rate limiting and logs see the real client IP *(default `0`)* |
| `PORT` | *(default `3000`)* |
| `NODE_ENV` | `production` in deployed environments — disables mock auth, enables info-level logging |
| `TELEGRAM_AUTH_MAX_AGE_SECONDS` | initData staleness window *(default `86400`)* |
| `AUTH_MOCK_ENABLED` | Must stay `false`/unset in production (`env.ts` refuses to boot otherwise) |
| `CONTENT_STAGING_DIR` | Persistent volume shared across API replicas — files staged for Telegram delivery must survive restarts *(default `.staging/content`)* |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID` | Optional; unset = Drive routing disabled, Telegram-only |
| `JOBS_ENABLED`, `JOBS_TIMEZONE`, `AUDIT_JOB_CRON`, `ACCESS_REVIEW_REMINDER_CRON`, `JOB_RUN_STALE_MINUTES` | Background scheduler *(defaults: `true`, `UTC`, `0 6 1 1,4,7,10 *`, `0 6 * * 1`, `30`)* |
| Rate-limit / backoff knobs | `REGISTRATION_RATE_LIMIT_*`, `REPEATED_REGISTRATION_FAILURE_*`, `JOIN_REQUEST_DELIVERY_*`, `CONTENT_DELIVERY_*`, `MEMBER_REMOVAL_*`, `NOTIFICATION_*` — all optional with defaults in `.env.example` |

### Bot (`apps/bot`)

| Variable | Notes |
|---|---|
| `BOT_TOKEN` | **Required.** From @BotFather |
| `API_BASE_URL` | **Required.** Base URL of the API **including `/api`**, e.g. `https://api.example.com/api` |
| `API_INTERNAL_TOKEN` | **Required.** Must match the API's copy exactly |
| `MINIAPP_URL` | **Required.** Mini App deep-link URL used in `/start` and invite messages |
| `BOT_CHANNEL_ID` | **Required.** Channel id (`-100…`) or `@username` |
| `BOT_MODE` | `webhook` (production) or `polling` (dev). Defaults from `NODE_ENV` *(default: `webhook` when `NODE_ENV=production`)* |
| `BOT_WEBHOOK_DOMAIN` | Required in webhook mode. Public **HTTPS** domain, e.g. `https://bot.example.com` |
| `BOT_WEBHOOK_PATH` | Webhook path the Bot listens on *(default `/telegram/webhook`)* |
| `BOT_WEBHOOK_SECRET` | Required in webhook mode. Telegram sends it as `X-Telegram-Bot-Api-Secret-Token`; the Bot rejects mismatches |
| `BOT_WEBHOOK_PORT` | *(default `8080`)* |
| Loop cadence knobs | `BOT_OUTBOX_POLL_INTERVAL_MS`, `BOT_OUTBOX_BATCH_SIZE`, `BOT_CONTENT_BATCH_SIZE`, `BOT_MEMBERSHIP_SYNC_*`, `BOT_MEMBER_REMOVAL_BATCH_SIZE`, `BOT_NOTIFICATION_BATCH_SIZE`, `API_TIMEOUT_MS` — optional, defaults in `.env.example` |

### Mini App (`apps/miniapp`)

All `VITE_*` values are **build-time** — set them before `vite build`, not after.

| Variable | Notes |
|---|---|
| `VITE_API_BASE_URL` | Public API base **including `/api`**, e.g. `https://api.example.com/api`. Defaults to same-origin `/api` if unset |
| `VITE_CHANNEL_ID` | Numeric `-100…` channel id for "Open in channel" deep links. Omit for a public `@name` channel |
| `VITE_REGISTRAR_CONTACT` | Contact shown on a declined registration (`@handle`, `mailto:`, `tel:`). Omit to hide |
| `VITE_MOCK_USER` | Dev only — leave empty in production builds |

## 4. HTTPS / reverse proxy

**HTTPS is mandatory everywhere.**

- **Mini App:** Telegram refuses to open a Mini App over plain HTTP. Serve
  `apps/miniapp/dist` from the domain registered as the Mini App URL in @BotFather, with a
  valid TLS certificate (e.g. nginx + certbot). The API can be same-origin under
  `/api` on this domain (simplest: proxy `/api` and `/internal` to the API service), or on
  its own subdomain with `MINIAPP_ORIGIN` set to the Mini App origin.
- **API:** terminate TLS at nginx (or your load balancer) and proxy to the Node process.
  Set `TRUST_PROXY=1` (hop count) so Express trusts `X-Forwarded-For` — otherwise the
  global rate limiter buckets every client behind the proxy as one. The reverse proxy must
  allow large request bodies for content uploads: `client_max_body_size` above
  `maxContentUploadBytes` and generous proxy read timeouts.
- **Bot webhook:** `BOT_WEBHOOK_DOMAIN` must be **HTTPS** — Telegram only delivers
  webhooks to TLS endpoints with a valid certificate (no self-signed). Proxy the
  `BOT_WEBHOOK_PATH` (default `/telegram/webhook`) to `BOT_WEBHOOK_PORT`. Telegram's IP
  ranges must be able to reach it; no auth middleware on that path beyond the built-in
  secret-token check.

Example nginx sketch (adjust domains/ports):

```nginx
server {
  listen 443 ssl;
  server_name miniapp.example.com;
  # ... ssl_certificate / ssl_certificate_key ...

  root /srv/thd/miniapp/dist;
  try_files $uri /index.html;

  location /api/      { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /internal/ { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
}

server {
  listen 443 ssl;
  server_name bot.example.com;
  # ... ssl_certificate / ssl_certificate_key ...

  location /telegram/webhook {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## 5. Process management

### pm2 (single host)

```bash
# API — runs migrations first, then starts
npm run migrate --workspace=@thd/api
pm2 start apps/api/dist/server.js --name thd-api
pm2 start apps/bot/dist/index.js --name thd-bot
pm2 save && pm2 startup   # restart on reboot
```

Serve the Mini App build output from nginx (section 4); pm2 is not needed for static files.

### Docker (outline)

- **API image:** build from the repo root (needs `packages/shared/dist` and
  `apps/api/dist` + the migrations directory that `copy-migrations.ts` places next to the
  build output). Run `node apps/api/dist/server.js`; run migrations as a separate
  one-shot step (`node apps/api/dist/db/migrate.js`) before rolling the new containers —
  never run migrations concurrently with serving traffic.
- **Bot image:** build `packages/shared` + `apps/bot`, run `node apps/bot/dist/index.js`.
- **Mini App:** `vite build`, then copy `dist/` into an nginx image.
- Mount `CONTENT_STAGING_DIR` as a persistent volume **shared by all API replicas** — a
  file staged on one replica is downloaded from another during delivery.
- Give the API container the proxy hop count (`TRUST_PROXY=1` behind the Docker/nginx
  proxy).

## 6. Post-deploy checklist

1. `GET /api/health` returns `{ "status": "ok" }` over HTTPS.
2. Every **Admin and Registrar presses Start** on the bot — the bot can only DM users who
   have started it; a recipient who has not is recorded as a terminal notification
   failure rather than retried forever.
3. Mini App opens inside Telegram over HTTPS and can load data (check `VITE_API_BASE_URL`).
4. Webhook mode: `getWebhookInfo` on the Bot API shows the expected HTTPS URL with no
   `pending_update_count` backlog; secret-token mismatches show up as 403s in the Bot log.
5. Background jobs: `JOBS_ENABLED=true` on exactly the API instances that should run the
   scheduler; a Postgres advisory lock serializes runs across replicas, so multiple
   instances are safe, but one is enough.
6. Logs: confirm structured JSON output and that no `telegramId`/initData/token values
   appear (see `docs/context/security.md` — logs carry user UUIDs, never Telegram ids).
