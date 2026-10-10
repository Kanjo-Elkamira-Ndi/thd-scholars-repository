# Phase 6: Roster & Registration — Design

Date: 2026-10-10
Status: Approved (proceed-to-implement; decisions per §13)
Consumers: `apps/api` (Express), `packages/shared` (types/schemas), docs under `docs/context`.
Source of truth: `docs/context/workflows.md` #1/#2, `docs/context/api-reference.md`, `docs/context/database-schema.md`.

## 1. Overview

Implement registration and roster management from `workflows.md` #1 and #2:

1. `POST /api/registrations` — validate the payload against the **configurable** registration-ID pattern (`settings.registrationIdPattern`), match `roster` by `registration_id`, decide **approved / declined** with a reason, and write `join_requests` + `audit_logs` **in one transaction** (plus the roster↔user link and profile stamp on approval).
2. `GET /api/roster` — search / filter / paginate (Registrar, Admin).
3. `POST /api/roster` — pre-load an expected student record (Registrar, Admin).
4. `PATCH /api/roster/:id` — update a record; a **status** change logs old/new to `audit_logs`; `graduated`/`withdrawn` sets an **access-review flag** and **never auto-removes**.
5. Per-`telegram_id` rate limit on registrations.
6. Repeated-failure **detection hook** (notification wiring deferred to a later phase).
7. Integration tests on a test database for match / no-match / inactive / audit-log atomicity.

Bot Service calls (`approveChatJoinRequest`/`declineChatJoinRequest`), the `/internal/*` handlers, invite-link issuance, `GET /api/members`, and the settings endpoints are **out of scope** (§14).

## 2. Decision model (workflow #1)

The roster lookup is by `registration_id` (unique). The decision is a pure function of the lookup:

| Condition | Decision | Reason |
|---|---|---|
| matched, `status = 'active'` | `approved` | — (`null`) |
| matched, `status = 'pending'` | `declined` | `Roster record is not active (status: pending)` |
| matched, `status = 'graduated'` | `declined` | `Roster record is not active (status: graduated)` |
| matched, `status = 'withdrawn'` | `declined` | `Roster record is not active (status: withdrawn)` |
| no match | `declined` | `No matching roster entry found` |

A pre-loaded roster row defaults to `status='pending'` (migration `0001` default); per workflow #1 only an `active` record approves, so a Registrar must promote a pre-loaded record to `active`. This is explicit and tested.

Every submission inserts a new `join_requests` row (one row per attempt = the audit event) — decisions are never "deduped" at this layer. `decided_by` is `null` (system-initiated; the schema documents `null` as system); `decided_at = now()`.

## 3. Persistence & migration (additive)

### New migration `0007_roster_access_review.sql`
```sql
ALTER TABLE roster
  ADD COLUMN access_review_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN access_review_flagged_at timestamptz;

CREATE INDEX idx_join_requests_user_created ON join_requests (user_id, created_at);
```

- `access_review_pending = true` means "a human must confirm this removal" (workflow #4); set when status moves to `graduated`/`withdrawn`, cleared when it returns to `active`, otherwise left unchanged.
- `access_review_flagged_at` records when the flag was set (nullable; cleared alongside the flag).
- No data migration needed (new columns have defaults).
- `database-schema.md` is updated to document the two columns and the new index.

## 3a. Shared types (`packages/shared`)

- `RosterEntry` gains `accessReviewPending: boolean` and `accessReviewFlaggedAt: string | null` (additive).
- New `rosterQuerySchema` (coerces query strings): `status?`, `cohortYear?`, `search?`, `page` (default 1), `pageSize` (default 20, max 100) → `RosterQuery`.
- New `RegistrationResult` interface `{ decision: 'approved' | 'declined'; reason: string | null }`.

Existing `rosterCreateSchema`/`createRosterCreateSchema(pattern)`, `rosterUpdateSchema`, and `createRegistrationPayloadSchema(pattern)` are reused as-is.

## 4. Repository layer (`apps/api/src/repositories/`)

All write functions accept an optional `db` (a `Pool | PoolClient`) defaulting to the shared `pool`, so they compose inside a transaction. snake_case→camelCase mapping and `bigint→Number` conversion happen at this boundary, never above it.

### `db/transaction.ts`
- `withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>` — `connect` → `BEGIN` → `fn(client)` → `COMMIT`; on throw `ROLLBACK` then rethrow; always `release()`.
- `Db = Pool | PoolClient` type exported for repository signatures.

### `settings.repository.ts`
- `getSetting<T>(key, db?): Promise<T | null>` — `SELECT value FROM settings WHERE key = $1`.
- `getRegistrationIdPattern(db?): Promise<string>` — `getSetting<string>('registrationIdPattern')`, throwing `INTERNAL_ERROR` if missing.

### `join-requests.repository.ts`
- `insertJoinRequest({ userId, status, decidedBy, reason }, db?): Promise<JoinRequest>`.
- `countRecentDeclines(userId, since: Date, db?): Promise<number>` — `COUNT(*)` where `status='declined'` and `created_at >= since`.

### `audit-logs.repository.ts`
- `insertAuditLog({ actorUserId, action, targetType, targetId, details }, db?): Promise<AuditLog>`.

### `roster.repository.ts` (extended)
- Existing `getRosterByUserId` kept; row mapping extended with the two new columns.
- `findByRegistrationId(registrationId, db?)`, `getRosterById(id, db?)`.
- `setRosterUserId(rosterId, userId, db?)` — link the user after an approved match.
- `createRosterEntry({ registrationId, cohortYear, programTrack, supervisorName }, db?)`.
- `updateRosterEntry(id, patch, db?)` — patch includes the access-review columns; returns the updated row or `null`.
- `listRoster({ status, cohortYear, search, page, pageSize }, db?)` → `{ items: RosterEntry[]; total: number }`. `search` is a case-insensitive partial match on `registration_id` **or** the linked `users.full_name` (`LEFT JOIN users`); LIKE metacharacters in input are escaped. `LIMIT/OFFSET` paginate; a matching `COUNT(*)` returns `total`.

### `users.repository.ts` (extended)
- `updateUserProfile(userId, { fullName, email, telegramUsername }, db?)` — sets the user-asserted profile on a successful registration. Distinct from `upsertByTelegram`, which never overwrites `full_name` and never writes `role`; this function is only ever called by the registration service, and never writes `role`.

## 5. Service layer (`apps/api/src/services/`, no `express` imports)

### `registration.service.ts`
`submitRegistration({ user, payload }): Promise<RegistrationResult>`
1. Read the pattern (`settings.getRegistrationIdPattern`).
2. Build `createRegistrationPayloadSchema(pattern)` and `safeParse(payload)`; on failure throw `AppError('VALIDATION_ERROR', 'Validation failed', 400, flattened)`.
3. `withTransaction`:
   - `findByRegistrationId(registrationId, client)`.
   - decide (`approved` iff matched and `active`) + reason (§2).
   - `insertJoinRequest({ userId: user.id, status: decision, decidedBy: null, reason }, client)`.
   - if `approved`: link `roster.user_id` when null (`setRosterUserId`) and stamp the profile (`updateUserProfile`).
   - `insertAuditLog({ actorUserId: null, action: decision === 'approved' ? 'approve_join_request' : 'decline_join_request', targetType: 'join_requests', targetId: joinRequest.id, details: { registrationId, matched, rosterStatus, reason } }, client)`.
4. On `declined` (after commit): `countRecentDeclines(user.id, now - window)`; if `>= threshold` call `notifyRepeatedRegistrationFailure({ userId, telegramId, failureCount })` (fire-and-forget; never affects the response).
5. Return `{ decision, reason }`.

**Atomicity contract:** the `join_requests` insert, the `audit_logs` insert, the roster link, and the profile stamp all share one transaction. If any write fails the whole registration rolls back.

### `roster.service.ts`
- `listRoster(query): Promise<{ items; total; page; pageSize }>`.
- `createRosterEntry({ actorUserId, input })` — validate via `createRosterCreateSchema(pattern)`; insert; write `audit_logs` (`create_roster_entry`, target `roster`) in one transaction; return the entry. `CONFLICT` on duplicate `registration_id` → `AppError('CONFLICT', …, 409)`.
- `updateRosterEntry({ actorUserId, id, patch })`:
  - validate via `rosterUpdateSchema`; fetch existing → `NOT_FOUND` if absent.
  - if `status` provided: `flagged = status ∈ {graduated, withdrawn}`; `access_review_pending = flagged ? true : (status === 'active' ? false : existing)`; `access_review_flagged_at` set/cleared to match.
  - `withTransaction`: `updateRosterEntry` + `insertAuditLog`. When status changed, action `update_roster_status` and `details = { from, to, accessReviewPending }` (**old/new**); otherwise action `update_roster_entry` with `details = { fields: [...] }`.
  - Never deletes or kicks (no membership call here).

### `notifications.service.ts`
- `notifyRepeatedRegistrationFailure({ userId, telegramId, failureCount })` — **stub**: structured `logger.warn` marked "notification wiring pending (FR27)". Injectable/`vi.mock`-able; the only side effect is a log line.

## 6. HTTP layer

### Rate limiter — `middleware/registration-rate-limit.ts`
`express-rate-limit` keyed on `req.user.telegramId` (no IP keying, so no IPv6/`ipKeyGenerator` validation), `windowMs = REGISTRATION_RATE_LIMIT_WINDOW_SECONDS * 1000`, `max = REGISTRATION_RATE_LIMIT_MAX`, JSON 429 `{ error: { code: 'RATE_LIMITED', … } }`.

### Controllers
- `controllers/registrations-controller.ts` — `postRegistration`: requires `req.user`; `res.status(201).json(result)`.
- `controllers/roster-controller.ts` — `getRoster` (`{ items, total, page, pageSize }`), `postRoster` (`201 { rosterEntry }`), `patchRoster` (`200 { rosterEntry }`). Path `:id` validated as UUID → `VALIDATION_ERROR` on malformed.

### Routes & wiring (`app.ts`)
- `routes/registrations-routes.ts`: `POST /registrations` (`authUser` + rate limiter).
- `routes/roster-routes.ts`: `GET|POST /roster`, `PATCH /roster/:id`, each behind `authUser` **and** `requireRole('registrar', 'admin')`.
- `app.ts`: `app.use('/api', authUser, registrationsRoutes)` and `app.use('/api', authUser, rosterRoutes)` after `healthRoutes`/`authRoutes`, before the 404 handler. `authUser` runs before the limiter so `req.user` is set.

## 7. Environment variables (new; `config/env.ts`)

| Variable | Type | Default |
|---|---|---|
| `REGISTRATION_RATE_LIMIT_WINDOW_SECONDS` | int, positive | `900` |
| `REGISTRATION_RATE_LIMIT_MAX` | int, positive | `5` |
| `REPEATED_REGISTRATION_FAILURE_THRESHOLD` | int, positive | `3` |
| `REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS` | int, positive | `86400` |

Added to `.env.example` and the README env table. The integration test config raises the rate-limit max so the rate limiter never interferes with the suite.

## 7a. Error codes
`VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409, duplicate `registration_id`), `RATE_LIMITED` (429) — all handled by the existing `errorHandler`.

## 8. Tests

Unit (DB-free, colocated `*.test.ts`):
- `registration.service.test.ts` — decision matrix + reasons; `join_requests` and `audit_logs` invoked with the right args; notifier called once at/over threshold, not below; profile stamp only on approval (repositories `vi.mock`ed).
- `roster.service.test.ts` — status→flag transitions (`active→graduated` sets, `graduated→active` clears), audit old/new payload, `NOT_FOUND`.
- `registration-rate-limit.test.ts` — 429 after `max` requests for one `telegramId`; independent counters per `telegramId`.

Integration (real test DB, `*.int.test.ts`, run via `npm run test:integration`):
- `registration.int.test.ts` — **match** (`active` → approved, `roster.user_id` linked, `users.email` stamped, `join_requests` + `audit_logs` rows), **no-match** (declined + reason), **inactive** (`pending`, `graduated`, `withdrawn` → declined with status reason), and no writes on a validation failure.
- `roster.int.test.ts` — create, list (search by registration id and by linked name, status/cohort filters, pagination), patch status writes old/new audit and sets/clears the flag; duplicate `registration_id` → 409.
- `atomicity.int.test.ts` — a `withTransaction` block that inserts a `join_request`, inserts an audit log, then throws leaves **no** `join_requests` row (rollback proof); a successful block leaves both.

### Test DB strategy
- `vitest.integration.config.ts` is separate; the default `vitest.config.ts` **excludes** `**/*.int.test.ts`, so `npm test` stays DB-free.
- `src/db/testing/test-database.ts` derives the test DB URL from `DATABASE_URL` in `apps/api/.env` by suffixing `_test` (no hardcoded credentials), plus `ensureTestDatabase()` (`CREATE DATABASE` if missing), `migrateTestDatabase()` (applies all migrations), and `resetTestDatabase()` (TRUNCATEs domain tables; `settings` is preserved).
- A guard refuses to run if the derived database name does not end in `_test` (never drops/truncates a non-test DB).
- `globalSetup` (`src/db/testing/global-setup.ts`) ensures + migrates the test DB once; each suite `resetTestDatabase()` in `beforeEach`.
- `apps/api/package.json` script `test:integration` (`vitest run -c vitest.integration.config.ts`).

## 9. Files added / changed

**Added**
- `apps/api/src/db/transaction.ts`
- `apps/api/src/repositories/{settings,join-requests,audit-logs}.repository.ts`
- `apps/api/src/services/{registration,roster,notifications}.service.ts`
- `apps/api/src/middleware/registration-rate-limit.ts`
- `apps/api/src/controllers/{registrations,roster}-controller.ts`
- `apps/api/src/routes/{registrations,roster}-routes.ts`
- `apps/api/src/db/migrations/0007_roster_access_review.sql`
- `apps/api/src/db/testing/{test-database,global-setup}.ts`
- colocated `*.test.ts` and `*.int.test.ts`
- `apps/api/vitest.integration.config.ts`

**Changed**
- `apps/api/src/repositories/{roster,users}.repository.ts` (extended, `db` param)
- `apps/api/src/config/env.ts`, `apps/api/.env.example`, `apps/api/vitest.config.ts`, `apps/api/package.json`
- `apps/api/src/app.ts` (mount routes)
- `packages/shared/src/{types/entities.ts,schemas/roster.ts,schemas/registration.ts}` (and `index.ts` re-exports if needed)
- docs: `database-schema.md`, `api-reference.md`, `file-structure.md`, `README.md`

## 10. Data flow (registration)

```
POST /api/registrations
  → authUser (req.user)
  → registrationRateLimiter (key: telegramId)
  → postRegistration
      → submitRegistration
          → settings.getRegistrationIdPattern
          → createRegistrationPayloadSchema(pattern).safeParse
          → withTransaction:
                findByRegistrationId
                decide
                insertJoinRequest
                (approved) setRosterUserId + updateUserProfile
                insertAuditLog
      → (declined) countRecentDeclines → notifyRepeatedRegistrationFailure
  ← 201 { decision, reason }
```

## 11. Security alignment (`security.md`)
- Every roster endpoint is behind `requireRole('registrar','admin')`; registrations require only an authenticated user.
- Per-`telegram_id` rate limiting on registrations addresses the registration abuse baseline.
- `audit_logs` are written in the same transaction as the primary write and are append-only (no update/delete path exists).
- Registration ID is validated against the **settings** pattern, never a hardcoded literal.
- No PII (email, full name) is logged at `info`+; only ids.

## 12. Open questions resolved
- Pre-loaded `pending` records decline on match until set `active` (literal workflow #1) — §2.
- Profile stamping happens **only on approval** (users.email is "nullable until registration completes") — §5.
- `access_review_pending` is a persisted column (a derived-only flag could not back the Workflow 4 list view) — §3.

## 13. Decisions taken (from the approved design)
1. Strict `status='active'` → approved.
2. Stamp `users.full_name` + `email` (+ `telegram_username`) on approval only; never `role`.
3. Persisted access-review flag via additive migration `0007`.
4. Thresholds/limits are env-configured; the settings pattern is DB-configured.
5. Bot call, `/internal` handlers, invite links, `GET /api/members`, settings API: later phases.

## 14. Out of scope (will not build)
Content endpoints, membership endpoints, the settings endpoints, audit-log viewer, dashboard stats, the Bot Service, the Mini App frontend, deployment. Phase 7 must not start.
