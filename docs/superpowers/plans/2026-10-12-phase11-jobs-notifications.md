# Phase 11 — Scheduled Jobs & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add idempotent `node-cron` jobs (quarterly roster/membership audit, graduation access-review reminders) and real bot-delivered notifications (FR26) + the repeated-registration-failure alert (FR27) via a `notifications` outbox.

**Architecture:** The API persists notifications and job-run records; `node-cron` runs jobs in-process under a Postgres advisory lock + a `job_runs` gate. The bot (outbound-only) leases notifications via `/internal/notifications/claim`, DMs the recipient, and confirms.

**Tech Stack:** TypeScript, Express, pg (raw SQL), zod, `node-cron`, Vitest + supertest, Telegraf, pino. Workspaces: `packages/shared`, `apps/api`, `apps/bot`.

**Spec:** `docs/superpowers/specs/2026-10-12-phase11-jobs-notifications-design.md`

## Global Constraints

- **No commits.** A standing directive forbids committing without an explicit ask. Ignore any "Commit" step's git commands; leave work uncommitted. (Flag in the final report.)
- **TDD:** write the failing test first, run it, implement, run to green.
- Node ≥20; `pg` raw SQL; no ORM. Queue reads follow the `FOR UPDATE SKIP LOCKED` claim pattern in `apps/api/src/repositories/member-removals.repository.ts`.
- New API env vars must have defaults (unit tests run without them): `JOBS_ENABLED=true`, `JOBS_TIMEZONE=UTC`, `AUDIT_JOB_CRON='0 6 1 1,4,7,10 *'`, `ACCESS_REVIEW_REMINDER_CRON='0 6 * * 1'`, `JOB_RUN_STALE_MINUTES=30`, `NOTIFICATION_MAX_ATTEMPTS=5`, `NOTIFICATION_BACKOFF_BASE_SECONDS=60`, `NOTIFICATION_LEASE_SECONDS=120`, `NOTIFICATION_BATCH_SIZE=10`.
- Bot env default: `BOT_NOTIFICATION_BATCH_SIZE=10`.
- Notification payloads carry ids/counts/roles only — **no PII** (no `full_name`, `email`, `telegram_username`, `registration_id`). Terminal DM-failure logs include role + user id only.
- `audit_logs` is immutable at the DB level; tests clean up with `TRUNCATE` (never DELETE/UPDATE).
- Rebuild shared after editing it: `npm run build --workspace=packages/shared`.
- Commands: from repo root `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`; integration `npm run test:integration --workspace=apps/api`; single int file (workdir `apps/api`) `npx vitest run -c vitest.integration.config.ts src/<path>`; single unit file (workdir `apps/api`/`apps/bot`) `npx vitest run src/<file>`.
- Integration needs Postgres (`apps/api/.env`: `DATABASE_URL=postgresql://postgres:codex4587@localhost:5432/dylet_db`).

---

## Task 1: Shared types, schemas, constants

**Files:**
- Modify: `packages/shared/src/types/enums.ts`
- Modify: `packages/shared/src/types/entities.ts`
- Modify: `packages/shared/src/types/internal.ts`
- Create: `packages/shared/src/constants/notifications.ts`
- Create: `packages/shared/src/schemas/notifications.ts`
- Modify: `packages/shared/src/constants/audit.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas/notifications.test.ts`

**Interfaces (produces):**
```ts
// enums.ts
export type NotificationStatus = 'pending' | 'processing' | 'sent' | 'failed';
export type JobRunStatus = 'started' | 'completed' | 'failed';
export type NotificationEvent =
  | 'role_changed' | 'member_removal_requested' | 'audit_flagged'
  | 'access_review_reminder' | 'repeated_registration_failure';
// entities.ts
export interface Notification {
  id: string; recipientUserId: string; event: NotificationEvent;
  payload: Record<string, unknown>; dedupeKey: string; status: NotificationStatus;
  attempts: number; nextAttemptAt: string | null; claimedAt: string | null;
  sentAt: string | null; lastError: string | null; createdAt: string;
}
export interface JobRun {
  id: string; job: string; runKey: string; status: JobRunStatus;
  details: Record<string, unknown> | null; lastError: string | null;
  startedAt: string; finishedAt: string | null;
}
// internal.ts
export interface NotificationTask {
  id: string; userId: string; telegramId: number; event: NotificationEvent;
  payload: Record<string, unknown>; attempts: number; recipientRole: Role;
}
export interface ClaimNotificationsResponse { items: NotificationTask[]; }
export interface NotificationConfirmInput { outcome: 'sent' | 'failed'; terminal?: boolean; error?: string; }
// constants/notifications.ts
export const NOTIFICATION_EVENTS = ['role_changed','member_removal_requested','audit_flagged','access_review_reminder','repeated_registration_failure'] as const;
export const JOB_NAMES = { QUARTERLY_AUDIT: 'quarterly_audit', ACCESS_REVIEW_REMINDER: 'access_review_reminder' } as const;
// constants/audit.ts (add)
QUARTERLY_ROSTER_AUDIT: 'quarterly_roster_audit';         // AUDIT_ACTIONS
JOBS: 'jobs';                                              // AUDIT_TARGET_TYPES
// schemas/notifications.ts
export const notificationClaimSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });
export const notificationConfirmSchema = z.object({
  outcome: z.enum(['sent','failed']),
  terminal: z.boolean().optional(),
  error: z.string().trim().min(1).max(1000).optional(),
}).refine((v) => v.outcome === 'sent' || !!v.error, { message: 'error is required when outcome is failed' });
```

- [ ] **Step 1: Write the failing test** `packages/shared/src/schemas/notifications.test.ts`
  - rejects `{ outcome: 'failed' }` without `error`;
  - accepts `{ outcome: 'sent' }` and `{ outcome: 'failed', error: 'x', terminal: true }`;
  - `NOTIFICATION_EVENTS` contains exactly the five events.
- [ ] **Step 2: Run** `npx vitest run src/schemas/notifications.test.ts` (workdir `packages/shared`) → FAIL (module missing).
- [ ] **Step 3:** Add the enums/types/constants/schemas above; add `QUARTERLY_ROSTER_AUDIT` + `JOBS` to `constants/audit.ts`; export the two new modules from `index.ts`.
- [ ] **Step 4: Run** the test → PASS; then `npm run build --workspace=packages/shared` → clean.

---

## Task 2: Migration `0011_jobs_notifications.sql`

**Files:**
- Create: `apps/api/src/db/migrations/0011_jobs_notifications.sql`
- Test: `apps/api/src/db/migrations/jobs-notifications.int.test.ts`

**Interfaces (produces):** `notifications` + `job_runs` tables per spec §3.

- [ ] **Step 1: Write the failing test** — assert both tables exist; `notifications_dedupe_unique` is unique on `(recipient_user_id, dedupe_key)`; queue/processing partial indexes exist; `job_runs_key_unique` is unique on `(job, run_key)`; the `event` CHECK rejects an unknown event; the `status` CHECKs reject bad values.
- [ ] **Step 2: Run** `npx vitest run -c vitest.integration.config.ts src/db/migrations/jobs-notifications.int.test.ts` → FAIL.
- [ ] **Step 3:** Write migration `0011_jobs_notifications.sql` exactly per spec §3.1/§3.2 (uuid pk `gen_random_uuid()`, FKs, CHECKs, the three notification indexes, the two job_runs indexes).
- [ ] **Step 4: Run** the test → PASS (migration runner applies `0011`).

---

## Task 3: Repositories — `notifications`, `job-runs`

**Files:**
- Create: `apps/api/src/repositories/notifications.repository.ts`
- Create: `apps/api/src/repositories/job-runs.repository.ts`
- Test: `apps/api/src/repositories/notifications.int.test.ts`
- Test: `apps/api/src/repositories/job-runs.int.test.ts`

**Interfaces (produces):**
```ts
// notifications.repository.ts
insertNotification(input: { recipientUserId: string; event: NotificationEvent; payload: Record<string, unknown>; dedupeKey: string }, db?): Promise<Notification | null> // null when dedupe conflict
findRecipientUserIds(roles: Role[], db?): Promise<string[]>
claimNotifications(input: { limit: number; leaseSeconds: number }, db?): Promise<NotificationTask[]>
getNotification(id, db?): Promise<Notification | null>
markNotificationSent(id, db?): Promise<void>
rescheduleNotification(id, { error, nextAttemptAt }, db?): Promise<void>
markNotificationFailed(id, { error }, db?): Promise<void>
// job-runs.repository.ts
claimJobRun(input: { job: string; runKey: string; staleMinutes: number }, db?): Promise<{ id: string } | null> // null = skip
completeJobRun(id, details: Record<string, unknown> | null, db?): Promise<void>
failJobRun(id, { error , details }, db?): Promise<void>
```
`insertNotification` = `INSERT ... ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING RETURNING ...` (returns null on conflict).
`claimJobRun` = the single atomic upsert in spec §4.1 step 2 (`RETURNING id`).
`claimNotifications` = un-lease stale `processing` (`claimed_at < now() - make_interval(secs => $1)`) back to `pending`; then `UPDATE ... SET status='processing', claimed_at=now(), attempts=attempts+1 WHERE id IN (SELECT id ... WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1) RETURNING id`; join `users` for `telegram_id` + `role`.

- [ ] **Step 1: Write failing tests.**
  - notifications: dedupe conflict returns null; a batch of 5 recipients sharing one dedupe key inserts 5 rows then re-insert inserts 0; claim increments attempts and leases; sender-side `markNotificationSent` sets `sent_at`; `rescheduleNotification` returns it to `pending` with a future `next_attempt_at`; `markNotificationFailed` sets `failed`.
  - job-runs: first `claimJobRun` inserts `started` and returns an id; a second claim while fresh returns null; after `completeJobRun` returns null; a `failed` run is retaken; a `started` row older than the window is retaken.
- [ ] **Step 2: Run** both int tests → FAIL.
- [ ] **Step 3:** Implement both repositories (raw SQL, `Db = pool` default, `mapX` row mappers like `member-removals.repository.ts`).
- [ ] **Step 4: Run** → PASS.

---

## Task 4: Notification writers — `notifications.service.ts`

**Files:**
- Modify: `apps/api/src/services/notifications.service.ts`
- Modify: `apps/api/src/services/members.service.ts:187` (pass `client` to `notify`)
- Modify: `apps/api/src/services/admin-users.service.ts:47` (enqueue inside the transaction)
- Test: `apps/api/src/services/notifications.service.int.test.ts`

**Interfaces (produces):**
```ts
enqueueNotification(input: { recipientUserId: string; event: NotificationEvent; payload?: Record<string, unknown>; dedupeKey: string }, db?: Db): Promise<void>
notify(userId: string, event: NotificationEvent, payload?: Record<string, unknown>, db?: Db): Promise<void> // dedupeKey = randomUUID()
notifyRoleChanged(userId: string, from: Role, to: Role, db?: Db): Promise<void> // dedupeKey = randomUUID()
notifyRepeatedRegistrationFailure(input: { userId: string; telegramId: number; failureCount: number }): Promise<number> // recipients notified
```
`notifyRepeatedRegistrationFailure` resolves all `admin` + `registrar` ids, then enqueues one
`repeated_registration_failure` row per recipient with shared
`dedupeKey = 'repeated_failure:{userId}:{floor(Date.now()/1000 / WINDOW)}'`, `payload = { failureCount }`.
`changeUserRole` calls `notifyRoleChanged(targetId, target.role, role, client)` immediately after the
audit insert (same transaction). `members.service` calls `notify(target.id, 'member_removal_requested', { initiatedByRole }, client)`.

- [ ] **Step 1: Write failing tests.**
  - repeated failure with 3 admins + 2 registrars → 5 `notifications` rows (one each); a second identical call → 0 new rows.
  - `notifyRoleChanged` twice for the same user → 2 rows (random dedupe keys).
  - payload for every row has no `full_name`/`email`/`telegram_username`/`registration_id` keys.
  - `enqueueNotification` for an unknown event is rejected by the DB CHECK (documents the boundary).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Implement the service; update the two call sites.
- [ ] **Step 4: Run** → PASS.

---

## Task 5: Extract `computeRosterAudit`

**Files:**
- Create: `apps/api/src/services/roster-audit.service.ts`
- Modify: `apps/api/src/services/members.service.ts:84-131`
- Test: `apps/api/src/services/roster-audit.service.int.test.ts`

**Interfaces (produces):**
```ts
computeRosterAudit(db?: Db): Promise<RosterAuditEntry[]> // no req/user/role dependency
```

- [ ] **Step 1: Write the failing test** — seed roster+`channel_membership` rows producing each of the three issues; assert `computeRosterAudit()` returns the same entries as `GET /api/roster/audit` (call `listRosterAudit`, which must delegate).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Move the `listRosterAudit` query + issue-classification into `computeRosterAudit(db = pool)`; make `members.service.listRosterAudit = () => computeRosterAudit()`.
- [ ] **Step 4: Run** the new test **and** `apps/api/src/controllers/admin.int.test.ts` (roster-audit case) → PASS both.

---

## Task 6: Delivery service + internal endpoints

**Files:**
- Create: `apps/api/src/services/notification-delivery.service.ts`
- Create: `apps/api/src/controllers/internal-notifications-controller.ts`
- Modify: `apps/api/src/routes/internal-routes.ts`
- Test: `apps/api/src/controllers/internal-notifications.int.test.ts`

**Interfaces (produces):**
```ts
claimNotifications(limit: number): Promise<ClaimNotificationsResponse>
completeNotification(input: { id: string } & NotificationConfirmInput): Promise<{ status: NotificationStatus }>
postClaimNotifications(req, res)   // POST /internal/notifications/claim  { limit? }
postConfirmNotification(req, res)  // POST /internal/notifications/:id/confirm
```
`completeNotification` mirrors `member-delivery.completeMemberRemoval`: `sent` → `markNotificationSent`;
terminal or `attempts >= NOTIFICATION_MAX_ATTEMPTS` → `markNotificationFailed`; else back off via
`computeBackoffSeconds(attempts, NOTIFICATION_BACKOFF_BASE_SECONDS)`.

- [ ] **Step 1: Write the failing test** — with the internal token: claim returns pending rows with `recipientRole` + `telegramId`; missing/invalid token → 401; confirm `sent` → 200 `{status:'sent'}`; confirm failed on attempt 1 → `{status:'pending'}` with future `next_attempt_at`; confirm failed `terminal:true` → `{status:'failed'}`; invalid uuid → 400.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Implement service + controller (reuse `env.NOTIFICATION_BATCH_SIZE` as the default limit + `UUID_PATTERN` guard); mount the two routes.
- [ ] **Step 4: Run** → PASS.

---

## Task 7: Job run-key helpers — `jobs/keys.ts`

**Files:**
- Create: `apps/api/src/jobs/keys.ts`
- Test: `apps/api/src/jobs/keys.test.ts`

**Interfaces (produces):**
```ts
quarterKey(date: Date, timeZone: string): string       // '{YYYY}-Q{q}'
isoWeekKey(date: Date, timeZone: string): string       // '{ISOyear}-W{ww}'
```

- [ ] **Step 1: Write failing tests** — `quarterKey(new Date('2026-01-01T00:00:00Z'),'UTC') === '2026-Q1'`; `quarterKey(new Date('2026-10-12T00:00:00Z'),'UTC') === '2026-Q4'`; `isoWeekKey(new Date('2025-12-29T12:00:00Z'),'UTC') === '2026-W01'`; `isoWeekKey(new Date('2026-01-04T12:00:00Z'),'UTC') === '2026-W01'`; `isoWeekKey(new Date('2026-01-05T12:00:00Z'),'UTC') === '2026-W02'`; a `Asia/Tokyo` case where the local date differs from UTC.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Implement with `Intl.DateTimeFormat` parts for `timeZone`, then the ISO-8601 week algorithm.
- [ ] **Step 4: Run** → PASS.

---

## Task 8: `runJob` gate + advisory lock — `jobs/run-job.ts`

**Files:**
- Create: `apps/api/src/jobs/run-job.ts`
- Test: `apps/api/src/jobs/run-job.int.test.ts`

**Interfaces (produces):**
```ts
runJob<R>(name: string, runKey: string, fn: () => Promise<R>, opts?: { staleMinutes?: number }): Promise<{ ran: boolean; result?: R }>
```

- [ ] **Step 1: Write failing tests** — first run executes `fn` and writes `completed` with details; an immediate second run with the same key does **not** call `fn`; a pre-seeded `started` row (fresh) blocks, but one older than `staleMinutes` is taken over; a pre-seeded `failed` row is retaken; when `fn` throws the run is `failed` and a **subsequent** `runJob` can acquire the lock (proving it was released) and, with a fresh `failed` row, runs again. Assert no lingering row in `pg_locks` (`locktype='advisory'`) after each call.
- [ ] **Step 2: Run** `npx vitest run -c vitest.integration.config.ts src/jobs/run-job.int.test.ts` → FAIL.
- [ ] **Step 3:** Implement per spec §4.1: `pool.connect()`; `SELECT pg_try_advisory_lock(hashtext($1))`; `claimJobRun`; try/catch → `complete`/`fail`; `finally { SELECT pg_advisory_unlock(hashtext($1)); client.release(); }`.
- [ ] **Step 4: Run** → PASS.

---

## Task 9: The two jobs

**Files:**
- Create: `apps/api/src/jobs/quarterly-audit.job.ts`
- Create: `apps/api/src/jobs/access-review-reminder.job.ts`
- Test: `apps/api/src/jobs/quarterly-audit.job.int.test.ts`
- Test: `apps/api/src/jobs/access-review-reminder.job.int.test.ts`

**Interfaces (produces):**
```ts
runQuarterlyAudit(now?: Date): Promise<{ total: number; counts: Record<RosterAuditIssue, number> }>
runAccessReviewReminder(now?: Date): Promise<{ pending: number }>
```
`runQuarterlyAudit`: `computeRosterAudit()` → insert one `audit_logs` row (`quarterly_roster_audit` / `jobs`)
→ `enqueueNotification` `audit_flagged` to each Admin with `dedupeKey = 'quarterly_audit:{quarterKey(now,tz)}'`.
`runAccessReviewReminder`: list pending roster ids; if >0 enqueue `access_review_reminder`
(`payload = { count }`) to each Admin with `dedupeKey = 'access_review_reminder:{isoWeekKey(now,tz)}'`.

- [ ] **Step 1: Write failing tests** — seed mismatches + 3 admins; `runJob('quarterly_audit', key, () => runQuarterlyAudit())` twice → exactly one `audit_logs` row and 3 notifications; a second quarter key adds one more audit row. Reminder: seed 2 pending reviews + 3 admins; run twice in one ISO week → 3 notifications; next week → 3 more.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Implement both jobs.
- [ ] **Step 4: Run** → PASS.

---

## Task 10: Scheduler, env, lifecycle, dependency

**Files:**
- Create: `apps/api/src/jobs/scheduler.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json` (add `node-cron`, `@types/node-cron`)
- Modify: `apps/api/.env.example`
- Test: `apps/api/src/jobs/scheduler.test.ts`

**Interfaces (produces):**
```ts
startJobs(): Promise<void>   // no-op when !env.JOBS_ENABLED || NODE_ENV==='test'; schedules crons + catch-up
stopJobs(): void
```
Env additions (all defaulted): `JOBS_ENABLED` (bool, default true), `JOBS_TIMEZONE`, `AUDIT_JOB_CRON`,
`ACCESS_REVIEW_REMINDER_CRON`, `JOB_RUN_STALE_MINUTES`, `NOTIFICATION_MAX_ATTEMPTS`,
`NOTIFICATION_BACKOFF_BASE_SECONDS`, `NOTIFICATION_LEASE_SECONDS`, `NOTIFICATION_BATCH_SIZE`.

- [ ] **Step 1: Write the failing test** — with `JOBS_ENABLED` false, `startJobs()` schedules nothing and runs no catch-up; a spy on `runJob` confirms catch-up calls the current quarter key and current week key.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** `npm i node-cron --workspace=apps/api && npm i -D @types/node-cron --workspace=apps/api`; add env keys; implement `startJobs`/`stopJobs`; wire into `server.ts` (start after `listen`; `SIGTERM`/`SIGINT` → `stopJobs()` + `server.close()`).
- [ ] **Step 4: Run** `npm run typecheck` + the test → PASS.

---

## Task 11: Dev job entrypoint

**Files:**
- Create: `apps/api/scripts/run-job.ts`
- Modify: `apps/api/package.json` (`"run:job": "tsx scripts/run-job.ts"`)
- Test: `apps/api/src/jobs/run-job-script.test.ts` (unit-test the arg parser)

**Interfaces (produces):**
```ts
parseJobArgs(argv: string[]): { job: 'quarterly_audit' | 'access_review_reminder'; force: boolean }
```
`run:job` refuses when `NODE_ENV==='production'`; `--force` appends `:{epochMs}` to the run key.

- [ ] **Step 1: Write the failing test** — `parseJobArgs(['quarterly_audit','--force'])` → `{ job:'quarterly_audit', force:true }`; unknown job throws; production guard throws.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Implement the script (calls `runJob` with the current key, `--force` suffix) + the `npm` script.
- [ ] **Step 4: Run** → PASS; `NODE_ENV=production npx tsx scripts/run-job.ts quarterly_audit` → refuses.

---

## Task 11b: `changeUserRole` rollback test

**Files:**
- Test: `apps/api/src/services/admin-users.service.int.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — spy the notification insert to throw once; expect `changeUserRole` to reject; assert the role is unchanged, no new `audit_logs` row, and no `notifications` row (proves enqueue shares the transaction).
- [ ] **Step 2: Run** → FAIL (currently `notify` is outside the tx / log-only).
- [ ] **Step 3:** Confirm Task 4's in-transaction wiring makes it pass; no extra code expected.
- [ ] **Step 4: Run** → PASS.

---

## Task 12: Bot `isBotBlocked` + templates

**Files:**
- Modify: `apps/bot/src/utils/telegram-errors.ts`
- Create: `apps/bot/src/templates/notification.ts`
- Modify: `apps/bot/src/templates/index.ts`
- Test: `apps/bot/src/utils/telegram-errors.test.ts`
- Test: `apps/bot/src/templates/templates.test.ts`

**Interfaces (produces):**
```ts
isBotBlocked(err: unknown): boolean
escapeHtml(value: string): string
ROLE_LABELS: Record<Role, string>            // admin→Administrator, registrar→Registrar, faculty→Faculty, scholar→Scholar
renderNotification(task: Pick<NotificationTask, 'event' | 'payload'>): string
```
`isBotBlocked` markers: `bot was blocked by the user`, `user is deactivated`, `chat not found`,
`can't initiate conversation`, `bot was kicked`. `renderNotification` escapes every interpolation,
maps roles through `ROLE_LABELS` (unknown → `Member`), and returns plain text (caller sends `parse_mode:'HTML'`).

- [ ] **Step 1: Write failing tests** — `isBotBlocked` true/false for each marker; `renderNotification` for `role_changed` contains `Administrator` and escapes a payload value containing `<b>&`; an unknown role renders `Member`; no event leaks a raw `<`/`&`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Implement `isBotBlocked`, `templates/notification.ts`, export it.
- [ ] **Step 4: Run** → PASS.

---

## Task 12b: Bot api-client + notification loop

**Files:**
- Modify: `apps/bot/src/services/api-client.ts`
- Create: `apps/bot/src/services/notification-delivery.ts`
- Modify: `apps/bot/src/config/env.ts`
- Modify: `apps/bot/src/index.ts`
- Modify: `apps/bot/src/services/loops.test.ts`
- Test: `apps/bot/src/services/api-client.test.ts`
- Test: `apps/bot/src/services/notification-delivery.test.ts`

**Interfaces (produces):**
```ts
// api-client.ts (BotApiClient)
claimNotifications(limit?: number): Promise<NotificationTask[]>
completeNotification(id: string, input: NotificationConfirmInput): Promise<{ status: NotificationStatus }>
// notification-delivery.ts
deliverNotificationTask(task: NotificationTask, deps): Promise<void>
runNotificationTick(deps): Promise<void>
startNotificationLoop(deps): void
stopNotificationLoop(): void
```
`deliverNotificationTask`: `telegram.sendMessage(task.telegramId, renderNotification(task), { parse_mode:'HTML' })`
→ `completeNotification(id, { outcome:'sent' })`; `catch` → if `isBotBlocked(err)` `logger.warn({ role: task.recipientRole, userId: task.userId }, 'notification DM undeliverable')` + `completeNotification(id, { outcome:'failed', terminal:true })`; else `logger.error` + `completeNotification(id, { outcome:'failed', error })`. Loop mirrors `delivery.ts` (timer, `running` flag, per-tick try/catch).

- [ ] **Step 1: Write failing tests** — api-client calls the right paths/methods with `limit`; `deliverNotificationTask` on success confirms `sent`; blocked error confirms `terminal:true` and logs `warn`; other error confirms retryable `failed`; `runNotificationTick` claims a batch and delivers all; `loops.test.ts` gains a fifth loop that isolates a rejecting tick.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** Implement; add `notificationBatchSize` (env `BOT_NOTIFICATION_BATCH_SIZE`) to bot env; wire `startNotificationLoop` + `stopNotificationLoop` into `index.ts`.
- [ ] **Step 4: Run** → PASS.

---

## Task 13: Documentation + full verification gate

**Files:**
- Modify: `docs/context/api-reference.md`, `docs/context/database-schema.md`, `docs/context/workflows.md`, `docs/context/security.md`, `docs/context/architecture.md`, `README.md`, `apps/bot/.env.example`

- [ ] **Step 1:** Document the two internal endpoints (`api-reference.md`); `notifications` + `job_runs` + migration `0011` (`database-schema.md`); workflows #3 (quarterly job), #7 (role-change notifies), #9 (FR27 real), plus the FR26 coverage note (no `registration_received`) (`workflows.md`); no-PII payloads + DM-failure semantics + advisory-lock/idempotency (`security.md`); jobs + fifth bot loop + deploy note to press Start (`architecture.md`); env tables + `run:job` (`README.md`); bot env (`apps/bot/.env.example`).
- [ ] **Step 2: Verify (all must be green):**
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run test:integration --workspace=apps/api`
  - `npm run build`
- [ ] **Step 3:** Re-read the spec §11 and record deviations for the final report.

---

## Self-review checklist (for the executor)
- Every spec §3/§4/§6/§7 deliverable maps to a task above (Task 1→§3 types; 2→§3 tables; 3–4 →§6.1; 5 → §5; 6 → §6.2/6.3; 7–10 → §4; 11 → §4.6; 11b → §6.1 transactionality; 12/12b → §7; 13 → §10b).
- No implementation step is a placeholder; each names exact files + the test that proves it.
- Do not commit at any step.
