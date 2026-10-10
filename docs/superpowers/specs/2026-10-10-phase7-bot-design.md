# Phase 7: Bot Service — Design

Date: 2026-10-10
Status: Approved (proceed-to-implement; decisions per §12)
Consumers: `apps/bot` (Telegraf), `apps/api` (one new `/internal` endpoint), docs under `docs/context`.
Source of truth: `docs/context/architecture.md` §2, `docs/context/workflows.md` #1, `docs/context/security.md`, `docs/context/code-standards.md`, `docs/context/file-structure.md`.

## 1. Overview

Stand up the **Bot Service** (`apps/bot`) as a thin Telegraf client over the API. Scope for this phase:

1. Telegraf bot skeleton — assembling the bot, command registration, logging/error middleware, graceful shutdown.
2. **Polling in dev, webhook-ready in prod**, selected by a `BOT_MODE` env flag (default derived from `NODE_ENV`).
3. Three commands: `/start` (explains verification, inline button deep-linking to the Mini App registration URL), `/help`, `/mystatus` (calls the API).
4. Message copy in `templates/` — welcome/help/status now; **approval/decline copy authored and stored now** for a later phase that wires the join-request flow.
5. An **API client wrapper** in `services/` using `X-Internal-Token` (`API_INTERNAL_TOKEN`).
6. One new API endpoint — `GET /internal/users/:telegramId/status` — so `/mystatus` can read a user's status without `initData`.
7. Vitest unit tests for templates, the API client, and commands.

**Zero RBAC logic in the bot** (`security.md`): the bot never inspects roles; it asks the API and renders what it is told.

`chat_join_request` handling, `approveChatJoinRequest`/`declineChatJoinRequest`, channel content posting, invite links, `/internal/join-requests/:id/complete`, `/internal/content/:id/confirm`, and the Mini App are **out of scope** (§13).

## 2. Architecture

```
Telegram update
  → telegraf middleware (logging, error)
  → command (/start | /help | /mystatus)
      ├── render templates/<name>  → ctx.reply(text[, keyboard])
      └── (/mystatus) → services/api-client.getUserStatus(telegramId)
                        (HTTP GET + X-Internal-Token)
                        → templates/mystatus  → ctx.reply(text)
```

The bot is a separate process from the API (`architecture.md` §Deployment shape). It holds only a bot token and the internal service token; it never touches Postgres and never makes an authorization decision.

### `apps/bot` layout (per `file-structure.md`)
```
src/
├── commands/
│   ├── start.ts          # /start
│   ├── help.ts           # /help
│   └── mystatus.ts       # /mystatus (calls the API)
├── handlers/             # reserved for chat_join_request (empty this phase)
├── templates/
│   ├── start.ts          # welcome copy + inline keyboard
│   ├── help.ts
│   ├── mystatus.ts
│   ├── approval.ts       # authored now, wired later
│   ├── decline.ts        # authored now, wired later
│   └── index.ts
├── services/
│   └── api-client.ts     # internal-token HTTP wrapper
├── middleware/
│   ├── logging.ts        # per-update structured log
│   └── error.ts          # bot.catch() handler
├── config/
│   └── env.ts            # zod-validated env (mirrors apps/api/config/env.ts)
├── bot.ts                # assembles the Telegraf instance + registers commands
└── index.ts              # entrypoint: polling (dev) or webhook (prod)
```

## 3. API addition — `GET /internal/users/:telegramId/status`

The bot authenticates with the internal token (not `initData`), so `/mystatus` needs an internal read.

- **Auth:** `X-Internal-Token` (existing `internalServiceToken` middleware; sets `req.service = 'bot'`).
- **Path param:** `telegramId` must be digits (`/^\d+$/`) → else `400 VALIDATION_ERROR`.
- **Response:** `200 { user: User, roster: RosterEntry | null }` — identical shape to `GET /api/me` so the bot renders one status template for both.
- **Errors:** `400 VALIDATION_ERROR` (non-numeric id), `404 NOT_FOUND` (no `users` row for that `telegram_id`).
- **No side effects, no audit log** (read-only).

### Components
- `apps/api/src/repositories/users.repository.ts` — add `getUserByTelegramId(telegramId: number, db = pool): Promise<User | null>` (`SELECT … WHERE telegram_id = $1::bigint`, reuse `mapUserRow`).
- `apps/api/src/controllers/internal-status-controller.ts` — `getUserStatus(req, res)`: parse/validate the param, call `getUserByTelegramId`, `404 NOT_FOUND` when absent, else `getRosterByUserId(user.id)` and reply `{ user, roster }`.
- `apps/api/src/routes/internal-routes.ts` — `router.get('/users/:telegramId/status', asyncHandler(getUserStatus))`.
- Tests: unit controller test (`internal-status-controller.test.ts`, repos mocked) + integration (`internal-status.int.test.ts` via supertest hitting `/internal/users/:telegramId/status` with the test token: 200 shape, 400 non-numeric, 404 unknown, 401 without token).
- `docs/context/api-reference.md` — document the endpoint under the internal section.

## 4. API client — `services/api-client.ts`

A single typed wrapper, built once (`code-standards.md` frontend rule applied to the bot).

```ts
export interface BotApiClient {
  getUserStatus(telegramId: number): Promise<UserStatusResponse>;
}
// UserStatusResponse = { user: User; roster: RosterEntry | null } (from @thd/shared)
```

- `createApiClient({ baseUrl, token, timeoutMs })` returns a `BotApiClient`.
- Uses global `fetch` with `X-Internal-Token: <token>` and `AbortSignal.timeout(timeoutMs)`.
- Success → parsed JSON. Non-2xx → throw `BotApiError { status: number; code?: string; message: string }` (reads the API's `{ error: { code, message } }` body when present). Timeout/network → `BotApiError` with `code: 'NETWORK_ERROR'`.
- No retries, no RBAC, no caching in this phase.

## 5. Templates — `templates/`

Pure functions returning message strings (and, for `start`, a Telegraf inline keyboard). No `ctx`, no I/O → trivially unit-testable.

- `start.ts`: `renderStart()` → approved welcome copy + inline keyboard `[[{ text: 'Open Registration', url: MINIAPP_URL }]]`.
- `help.ts`: `renderHelp()`.
- `mystatus.ts`: `renderStatus({ user, roster })` and `renderNotRegistered()` (used on a `404`).
- `approval.ts`: `renderApproval({ name })` — authored now, unused until the join-request phase.
- `decline.ts`: `renderDecline({ reason })` — authored now, unused until the join-request phase.
- `index.ts`: re-exports.

### Approved copy (locked)

**start** (button "Open Registration" → `MINIAPP_URL`):
> 👋 Welcome to the Th.D. Scholars Bot.
>
> This bot is the gateway to the DIBI Th.D. community.
>
> How to get access:
> 1. Tap **Open Registration** below.
> 2. Complete the form with your DIBI Registration ID.
> 3. We match it against the Registrar's roster.
> 4. If your record is active, your channel join request is approved automatically.
>
> Use /help if you get stuck, or /mystatus to check your verification.

**help**:
> Th.D. Scholars Bot — Help
>
> • /start — Welcome and how to register
> • /mystatus — Check your verification status
> • /help — This message
>
> Verification happens in the Mini App. If your registration was declined, check with the Registrar that your DIBI Registration ID is correct and that your roster record is active.

**approval** (authored, wired later):
> ✅ Welcome, {name}!
>
> Your registration was approved and you've been added to the Th.D. community channel. You now have access to all cohort materials.
>
> Open the Mini App anytime to browse content and check your status.

**decline** (authored, wired later):
> ❌ We couldn't verify your registration.
>
> Reason: {reason}
>
> This usually means your DIBI Registration ID wasn't found on the Registrar's roster, or your record isn't active. Please double-check your details and try again, or contact the Registrar if you believe this is an error.

**mystatus** (`renderStatus`):
> Your status
>
> Name: {fullName}
> Role: {role}
> Registration: {registrationId or "—"}
> Roster status: {status or "not matched yet"}
> Access review: pending   *(only rendered when `roster.accessReviewPending` is true)*

**mystatus** (no user, `renderNotRegistered()`):
> You're not registered yet.
>
> Tap /start to begin, then open the Mini App and complete the registration form.

## 6. Commands — `commands/`

Thin handlers (`code-standards.md` bot rule): call a template and/or the API client, reply, done.

- `start.ts`: `ctx.reply(renderStart(), renderStartKeyboard())`.
- `help.ts`: `ctx.reply(renderHelp())`.
- `mystatus.ts`: `ctx.from?.id` missing → no-op log; else `try getUserStatus(id)` → `renderStatus`, catch `BotApiError` with `status === 404` → `renderNotRegistered()`, other errors rethrow to the error middleware.
- Registration helper `registerCommands(bot, deps)` is called from `bot.ts`; each command receives `{ api }` (the client) via closure, so commands are unit-testable with a fake client and a fake `ctx`.

## 7. Middleware — `middleware/`

- `logging.ts`: pattern middleware. For each update, log `{ updateId, updateType, telegramId?, durationMs }` at `info` via the shared logger. Never logs tokens, `initData`, email, or full names (`security.md`).
- `error.ts`: `bot.catch(err, ctx)` — log the error, `ctx.reply('Something went wrong. Please try again in a moment.')`. A failed reply is swallowed so it cannot crash the process.

## 8. Config & environments — `config/env.ts`

Zod schema mirroring `apps/api/src/config/env.ts` (fails fast with a readable message; loads `apps/bot/.env` via `dotenv`).

| Variable | Type | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | `development\|test\|production` | `development` | |
| `BOT_TOKEN` | string, min 1 | — | required |
| `API_BASE_URL` | URL | `http://localhost:3000` | |
| `API_INTERNAL_TOKEN` | string, min 1 | — | required; matches the API's value |
| `MINIAPP_URL` | string, min 1 | — | required; `/start` button target |
| `BOT_MODE` | `polling\|webhook` | `polling` in dev/test, `webhook` in production | |
| `BOT_WEBHOOK_DOMAIN` | URL | — | required when `BOT_MODE=webhook` |
| `BOT_WEBHOOK_PATH` | string | `/telegram/webhook` | |
| `BOT_WEBHOOK_SECRET` | string, min 1 | — | required when `BOT_MODE=webhook` |
| `BOT_WEBHOOK_PORT` | int | `8080` | listen port in webhook mode |
| `API_TIMEOUT_MS` | int, positive | `5000` | API client timeout |

`superRefine`: if `BOT_MODE=webhook`, `BOT_WEBHOOK_DOMAIN` and `BOT_WEBHOOK_SECRET` must be set.

## 9. Entrypoint — `bot.ts` / `index.ts`

- `bot.ts`: `createBot({ token, api })` → `new Telegraf(token)`, attach `logging` middleware, `bot.catch(errorMiddleware)`, `registerCommands`, return the instance.
- `index.ts`:
  - Build env + logger + API client + bot.
  - `bot.telegram.setMyCommands([{ command: 'start', … }, { command: 'help', … }, { command: 'mystatus', … }])`.
  - `polling`: `await bot.launch()`.
  - `webhook`: `await bot.launch({ webhook: { domain, path, secretToken, port } })`.
  - Log the mode on startup; `SIGINT`/`SIGTERM` → `bot.stop()` then exit.

## 10. Tests (Vitest in `apps/bot`)

- `templates/*.test.ts` — exact copy assertions (guards against silent wording drift), button URL from `MINIAPP_URL`, `renderStatus` with/without roster and with the access-review flag, `renderNotRegistered`.
- `services/api-client.test.ts` — mocks global `fetch`: sends `X-Internal-Token` and the right URL; returns parsed `{ user, roster }`; throws `BotApiError` on non-2xx (with API error code) and on timeout/network.
- `commands/*.test.ts` — fake `ctx` + fake client: `/start` replies with the button; `/mystatus` replies with status, and `renderNotRegistered` on a `404`; `/help` replies.
- `config/env.test.ts` — required-field failures and the webhook `superRefine` (parse the schema directly against fixtures).
- No live-Telegram integration test.

Add Vitest to `apps/bot` (`vitest.config.ts`, `test` script) so `npm test` at the root picks it up.

## 11. Files added / changed

**Added (`apps/bot`)**
- `src/config/env.ts`, `src/bot.ts`
- `src/services/api-client.ts`
- `src/templates/{start,help,mystatus,approval,decline,index}.ts`
- `src/commands/{start,help,mystatus}.ts`
- `src/middleware/{logging,error}.ts`
- `src/utils/logger.ts`
- `vitest.config.ts`
- colocated `*.test.ts`

**Added (`apps/api`)**
- `src/controllers/internal-status-controller.ts` (+ test)
- `src/services/internal-status.int.test.ts` (or under the existing integration layout)

**Changed**
- `apps/bot/src/index.ts`, `apps/bot/package.json`, `apps/bot/.env.example`, `apps/bot/tsconfig.json` (if needed)
- `apps/api/src/repositories/users.repository.ts`, `apps/api/src/routes/internal-routes.ts`
- docs: `api-reference.md`, `security.md` (note the internal status endpoint is read-only), `README.md` (bot run + env table), `workflows.md` (note `/start` deep-links to the Mini App)

## 12. Decisions taken (from the approved design)

1. `/mystatus` reads via a new internal endpoint `GET /internal/users/:telegramId/status`; bot never queries the DB or checks roles.
2. `BOT_MODE` selects polling (dev) vs webhook (prod); webhook config mandatory in webhook mode.
3. Approval/decline copy is authored now but not wired until the join-request phase.
4. Vitest unit tests for templates, API client, and commands; no live-Telegram test.
5. New deps: `telegraf@^4.16.3`, `dotenv`, `pino`, `pino-pretty`; dev `vitest`.

## 13. Out of scope (will not build)

`chat_join_request` handling and `approveChatJoinRequest`/`declineChatJoinRequest`; channel content posting; `/internal/join-requests/:id/complete`; `/internal/content/:id/confirm`; invite links; `GET /api/members`; settings endpoints; the Mini App frontend; deployment. Phase 8 must not start.
