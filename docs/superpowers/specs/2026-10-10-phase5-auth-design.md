# Phase 5: Auth (Security.md) — Design

Date: 2026-10-10
Status: Approved with amendments
Consumers: `apps/api` (Express), `packages/shared` (types), docs under `docs/context`.

## 1. Overview

Implement the authentication layer described in `docs/context/security.md`:

1. Verify Telegram Mini App `initData` HMAC signature server-side using `BOT_TOKEN`.
2. Reject stale `auth_date` (window configurable, plus a hard +60 s future skew check).
3. Upsert the user on every authenticated contact; role defaults to `scholar` (DB default).
4. `requireRole(...roles)` authorization guard.
5. Internal service token middleware for `/internal/*`.
6. `GET /api/me`.
7. Dev-only mock auth (explicit opt-in, never in production).
8. Vitest unit tests per the approved list.

Phase 6 is out of scope.

## 2. Environment variables (`apps/api/src/config/env.ts`)

Add to `EnvSchema` (zod-validated at startup):

| Variable | Type | Default | Notes |
|---|---|---|---|
| `BOT_TOKEN` | `string` min 1 | — (required) | HMAC secret for `initData`; also used by the dev signing script. |
| `TELEGRAM_AUTH_MAX_AGE_SECONDS` | `number`, int, positive | `86400` | Staleness window for `auth_date`. |
| `AUTH_MOCK_ENABLED` | `boolean` from `true`/`false` | `false` | See §7. |

- Boolean parsing uses `z.string().optional().default('false').transform(v => v === 'true')` — never `z.coerce.boolean()` (which would map any non-empty string to `true`).
- **Startup guard (amendment 3):** the schema `.superRefine`s `data` so that `AUTH_MOCK_ENABLED === true && NODE_ENV === 'production'` produces a validation error. `parseEnv()` throws and the process refuses to boot.
- Update `apps/api/.env.example`, the README env table, and `docs/context/security.md` (add the window env var, the mock flag contract, and the 60 s future-skew rule).

## 3. `initData` verification — pure module `apps/api/src/auth/telegram-init-data.ts`

No Express imports; fully unit-testable.

**Algorithm (amendment 4):**
- Input: raw `initData` string, `botToken`, `maxAgeSeconds`.
- URL-decode, split on `&`, split each pair on first `=`.
- `hash` must be present and hex; else `UNAUTHORIZED`.
- Data-check-string: all fields **except `hash`** (keep `signature` if present), sorted by key, joined `key=value` with `\n`.
- `secret_key = HMAC-SHA256(key="WebAppData", message=botToken)`.
- `calculated = hex(HMAC-SHA256(key=secret_key, message=data_check_string))`.
- Compare with the provided `hash` using a **length-guarded** constant-time compare (amendment 1):
  - `safeEqualHex(a, b)`: decode both hex → Buffer; if lengths differ return `false` (→ `UNAUTHORIZED`, never a throw → never 500); else `crypto.timingSafeEqual`.
- `auth_date` (seconds): reject if `now - auth_date > maxAgeSeconds` (expired) **or** `auth_date - now > 60` (too far in the future, amendment 4).
- `user` field: required JSON object. Validate/parse with zod: `{ id: number, username?: string, first_name?: string, last_name?: string }`. Missing/invalid `user` → `UNAUTHORIZED` (amendment 7).
- Returns `{ telegramId: number, username: string | null, fullName: string }`.

**Errors:** always `AppError('UNAUTHORIZED', message, 401)` with a distinct `message` per failure mode: `invalid initData format` / `initData signature mismatch` / `initData expired` / `initData from the future` / `initData missing user`. Never log the payload.

**Export also `signInitData(input, botToken, nowSeconds?)`** — a signing helper used by the vitest tests and the dev Postman script (`scripts/make-init-data.ts`). It builds the same data-check-string and applies the same HMAC. Test/dev only; not reachable from any request path.

## 4. Types & Express augmentation (`apps/api/src/types/express.d.ts`)

- `req.user?: User` — the shared `User` entity (`packages/shared`), populated by `authUser` after upsert.
- `req.service?: 'bot'` — set by the internal-token middleware.

## 5. Repository layer — `apps/api/src/repositories/` (amendment 5)

Location matches `docs/context/file-structure.md` (`repositories/`, one file per resource). **Not** `db/repositories/`.

### `users.repository.ts`
- `upsertByTelegram({ telegramId, username, fullName }): Promise<User>`
  - SQL (amendment 2): on conflict, update **only** `telegram_username`, and **only when it changed**;
    `full_name` is never overwritten and **`role` is never written** (always the DB default `'scholar'` on insert):
    ```sql
    INSERT INTO users (telegram_id, telegram_username, full_name)
    VALUES ($1::bigint, $2, $3)
    ON CONFLICT (telegram_id) DO UPDATE
      SET telegram_username = EXCLUDED.telegram_username,
          updated_at = now()
      WHERE EXCLUDED.telegram_username IS DISTINCT FROM users.telegram_username
    RETURNING id, telegram_id, telegram_username, full_name, email, role, created_at, updated_at;
    ```
  - Because update is gated by `WHERE`, an unchanged `telegram_username` performs no write; the existing row is still returned.
- `mapUserRow(row): User` — repository-boundary mapping: `telegram_id::numeric → Number(...)`, `role` validated against the shared `ROLE_VALUES`, timestamps → ISO strings. Ownership of "pg gives `bigint` as string" stops here (amendment 2).

### `roster.repository.ts`
- `getByUserId(userId): Promise<RosterEntry | null>` — `SELECT … FROM roster WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`. Maps to the shared `RosterEntry`.

## 6. Middleware (`apps/api/src/middleware/`)

### `auth.ts` — `authUser`
- If `env.AUTH_MOCK_ENABLED && env.NODE_ENV !== 'production'` and header `X-Mock-User` is present:
  - Marked clearly in code: `/* MOCK AUTH — dev/test only. Never enabled in production (env.ts refuses). */`
  - Parse header JSON with a **strict** zod schema (amendment 3): `{ id: number (int, positive), username?, firstName?, lastName? }`. `.strict()` — any extra key (notably `role`, `email`) → `UNAUTHORIZED`.
  - `logger.warn({ telegramId }, 'MOCK AUTH used')`.
  - Upsert, attach `req.user`, continue.
- Else:
  - `Authorization` header must match scheme `tma <initData>` (case-insensitive scheme). Missing header, wrong scheme, or empty `initData` → `UNAUTHORIZED` (amendment 7).
  - `verifyTelegramInitData(...)`, upsert, attach `req.user`, continue.
- Any `AppError` from above propagates via `next(err)` to the existing `errorHandler` (401 JSON). Non-`AppError` from verification is impossible by construction (length guards); if one ever escapes it is a code bug surfaced by tests.

### `require-role.ts` — `requireRole(...roles: Role[])`
- `req.user` missing → `AppError('UNAUTHORIZED', 'Authentication required', 401)`.
- `!roles.includes(req.user.role)` → `AppError('FORBIDDEN', 'Insufficient permissions', 403)`.
- Otherwise `next()`.

### `internal-token.ts` — `internalServiceToken`
- `X-Internal-Token` must equal `env.API_INTERNAL_TOKEN`, compared with the same **length-guarded** `timingSafeEqual` helper (amendment 1): wrong-length → `UNAUTHORIZED`, never a throw.
- On success `req.service = 'bot'`, `next()`.
- Exported for reuse with tests.

### Shared helper — `auth/constant-time.ts`
- `safeEqualHex(a, b)` and `safeEqualBuffers(a, b)`: decode/convert inputs and return `false` on length mismatch (never throw); otherwise compare with `crypto.timingSafeEqual`. Single source of truth for the "never throw on length mismatch" rule, used by both initData verification and the internal token compare.

## 7. Mock auth contract (amendment 3)

- Enabled only when `AUTH_MOCK_ENABLED=true` **and** `NODE_ENV !== 'production'` (env.ts makes the combination with `production` a boot error).
- Header `X-Mock-User` carries identity only: `{ "id": 4444444444, "username": "dev_admin", "firstName": "Dev", "lastName": "Admin" }`.
- **Never** accepts `role` (or any other authz field). Roles come exclusively from the DB row via upsert (so seeded per-role fixtures work: see §9).
- All other request processing (rate limit, helmet, CORS, error handler) is unchanged.

## 8. Routes, controller, app wiring

- `controllers/me-controller.ts` — `getMe(req, res)`: `res.status(200).json({ user: req.user, roster: await rosterRepository.getByUserId(req.user.id) })` (roster nullable).
- `routes/auth-routes.ts` — `router.get('/me', getMe)`.
- `routes/internal-routes.ts` — empty `Router` (placeholder for the bot endpoints; proves the transport).
- `app.ts` wiring:
  - `app.use('/api', healthRoutes)` (unchanged, public)
  - `app.use('/api', authUser, authRoutes)`
  - `app.use('/internal', internalServiceToken, internalRoutes)`
  - 404 + `errorHandler` remain last.
- Response shapes match `api-reference.md`: `GET /api/me` → `{ user: User, roster: RosterEntry | null }`.

## 9. Dev scripts (amendment 6)

### `apps/api/src/db/seeds/seed-users.ts` — `npm run seed --workspace=apps/api`
- **Refuses to run when `NODE_ENV === 'production'`** (throws before any write).
- Upserts one fixed fixture per role (fixed telegram IDs, so mock auth + `/me` can exercise every role):
  | Role | telegram_id | username |
  |---|---|---|
  | `scholar` | `1111111111` | `dev_scholar` |
  | `faculty` | `2222222222` | `dev_faculty` |
  | `registrar` | `3333333333` | `dev_registrar` |
  | `admin` | `4444444444` | `dev_admin` |
- Uses its **own** INSERT (not `upsertByTelegram`, which must never write `role`) so fixture roles are set explicitly:
  `INSERT INTO users (telegram_id, telegram_username, full_name, role) VALUES … ON CONFLICT (telegram_id) DO UPDATE SET telegram_username = EXCLUDED.telegram_username, role = EXCLUDED.role`.
- Run via `tsx` (db/seeds/ is inside `src`, so it type-checks in `npm run build` too).

### `apps/api/scripts/make-init-data.ts` — `npm run make:init-data --workspace=apps/api`
- Dev-only; refuses in production.
- Reads `BOT_TOKEN` from the api `.env`, accepts `--telegram-id` (defaults to the admin fixture id), prints a complete, correctly signed `initData` string ready to paste into Postman's `Authorization: tma <initData>` header.
- Uses the shared `signInitData` helper so the dev script, tests, and verifier can never drift.

## 10. npm scripts & Vitest setup

`apps/api/package.json`:
- devDeps: `vitest`.
- scripts: `test` (`vitest run`), `test:watch` (`vitest`), `seed` (`tsx src/db/seeds/seed-users.ts`), `make:init-data` (`tsx scripts/make-init-data.ts`).
- Root `package.json`: `test` → `npm run test --workspaces --if-present`.
- `vitest.config.ts` in `apps/api`: `test.env` defaults so module-load env validation is deterministic (`BOT_TOKEN`, `API_INTERNAL_TOKEN`, `MINIAPP_ORIGIN`, `DATABASE_URL` dummy `.test`, `NODE_ENV: 'test'`, `AUTH_MOCK_ENABLED: 'false'`). `pool.ts` holds a dummy `DATABASE_URL` so its import-time guard never fires; **the `pg.Pool` is lazy and never connects unless a query runs, and unit tests never run a query**.

## 11. Tests (Vitest — amendment 7)

Database is never touched: middleware tests stub the repository with `vi.mock('../../repositories/users.repository', …)`, so the success paths are tested without a live DB and each middleware failure path is exercised without hitting `pool`.

`auth/telegram-init-data.test.ts`:
1. Valid signed `initData` → returns verified identity.
2. Tampered (user value edited) → 401/signature mismatch.
3. Expired (`auth_date` older than window) → 401/expired.
4. Future `auth_date` (>60 s ahead) → 401/future.
5. Wrong-length `hash` → 401 (never a throw/500).
6. Missing `hash` → 401.
7. Missing `user` → 401.
8. `signature`-and-hash payload: `signature` preserved in the check string (amendment 4 regression).

`middleware/auth.test.ts` (mock-auth + header cases, repository stubbed):
1. `X-Mock-User` present but `AUTH_MOCK_ENABLED=false` → treated as absent → 401 (upsert never called).
2. Missing `Authorization` → 401 (upsert never called).
3. Non-`tma` scheme (`Bearer …`) → 401.
4. `X-Mock-User` with a `role` key (`.strict()`) → 401 (role never accepted).
5. Mock enabled + valid `X-Mock-User` → `req.user` attached with the role the **stubbed** upsert returned.

`middleware/require-role.test.ts`:
- No `req.user` → 401.
- Each role outcome: `admin` passes `requireRole('admin')`; `scholar` denied on `admin`/`registrar`/`faculty` routes → 403; `registrar` allowed on `registrar` route but denied on `faculty` route → 403; `faculty` symmetrical.

`middleware/internal-token.test.ts`:
- Correct token → `req.service === 'bot'`, next called.
- Wrong token → 401.
- Wrong-length token → 401 (never 500).

`config/env.test.ts`:
- `AUTH_MOCK_ENABLED=true` + `NODE_ENV=production` → `parseEnv` throws.

> Unit-test environment note: `apps/api/.env` is loaded by `config/env.ts` at import; vitest `test.env` values win over the file only if the file is not loaded (the module does `dotenv.config()` which does **not** override already-set vars). To keep tests hermetic, the vitest env is set *before* module load and dotenv's `config` leaves existing vars untouched, so the constants above are authoritative under test.

## 12. Docs to touch (never Phase 6 content)

- `docs/context/file-structure.md`: add `auth/` (init-data verifier + tests) under `apps/api/src`, keep `repositories/` (now with `users.repository.ts`, `roster.repository.ts`), add `db/seeds/seed-users.ts` and note the two dev scripts. **Specs/plans live outside `docs/context/`** (amendment 8).
- `docs/context/security.md`: document `TELEGRAM_AUTH_MAX_AGE_SECONDS`, the 60 s future skew, the mock-auth contract, and the internal token handler reference.
- `docs/context/api-reference.md`: add the dev mock header note under Auth & Identity; already documents `/internal/*` and `GET /api/me`.
- `README.md`: add `BOT_TOKEN`, `TELEGRAM_AUTH_MAX_AGE_SECONDS`, `AUTH_MOCK_ENABLED` rows to the API env table (re-adding `BOT_TOKEN`, which was deferred at merge time).

## 13. Out of scope (will not build)

Registration/roster/content endpoints, audit logging, `POST /internal/*` bodies, the Bot service, Mini App frontend, deployment. Phase 6 (undefined) must not start.