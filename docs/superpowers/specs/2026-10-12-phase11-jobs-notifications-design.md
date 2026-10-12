# Phase 11 — Scheduled Jobs & Notifications — Design Spec

Date: 2026-10-12
Status: Approved (with amendments), implementing
Depends on: Phases 5–10 (auth, roster/registration, bot outbox, join-request pipeline, content module, admin endpoints)

## 1. Goal

Add (a) an in-process scheduler (`node-cron`) for the quarterly roster/membership audit and the
graduation access-review reminders, and (b) real bot-delivered notifications (FR26) plus the
repeated-registration-failure alert (FR27). Jobs are idempotent and log their outcomes; the API
never calls the bot, so notifications leave via an outbox the bot leases and confirms.

Out of scope: Mini App UI; notification inbox/read-state UI; retention/purge; anything that starts
Phase 12.

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| D1 | Notification delivery uses a `notifications` outbox table + a bot loop (`/internal/notifications/claim` → DM → `/internal/notifications/:id/confirm`). Same pattern as join-requests / content / member-removals. |
| D2 | The quarterly audit job is read-only over roster/membership: it writes one summary `audit_logs` row and notifies Admins. It never sets `access_review_pending` and never removes anyone — a human confirms every removal (FR20). |
| D3 | Idempotency = `job_runs` gate + notification dedupe key + a Postgres advisory lock. |
| D4 | The bot's existing join-request delivery DMs (approve/decline, invite link) stay as they are. The generic notification service only adds the *new* events (role change, member-removal-requested, audit flag, access-review reminder, repeated failure). |
| D5 | **No `registration_received` event.** The synchronous approve/decline delivery DM already acknowledges a registration. FR26 coverage is recorded in `workflows.md`. |
| D6 | Repeated-failure alerts go to **all Admins + all Registrars**; audit flags and access-review reminders go to **all Admins**. |
| D7 | Non-deduped events carry a random unique `dedupe_key`; the unique constraint is `(recipient_user_id, dedupe_key)` so one event reaches every recipient exactly once. |
| D8 | A job gate skips a run only when it is `completed`, or `started` and **fresh**. A `failed` run, or a `started` run older than `JOB_RUN_STALE_MINUTES`, is retaken atomically. |
| D9 | The advisory lock is released on every path, including when the job body throws. |
| D10 | Quarter/week run keys are computed in `JOBS_TIMEZONE` using the ISO week-numbering year. |
| D11 | Terminal DM failures (bot blocked, chat not found, can't initiate) are terminal immediately, logged at `warn` with role + user id only (no PII). |
| D12 | Templates HTML-escape interpolated values and use a whitelisted role-label map. |

## 3. Data model (migration `0011_jobs_notifications.sql`)

### 3.1 `notifications` (outbox)
```
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
event             text NOT NULL CHECK (event IN (
                    'role_changed','member_removal_requested','audit_flagged',
                    'access_review_reminder','repeated_registration_failure'))
payload           jsonb NOT NULL DEFAULT '{}'::jsonb   -- ids/counts/roles only; no PII
dedupe_key        text NOT NULL
status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','sent','failed'))
attempts          integer NOT NULL DEFAULT 0
next_attempt_at   timestamptz
claimed_at        timestamptz
sent_at           timestamptz
last_error        text
created_at        timestamptz NOT NULL DEFAULT now()

CREATE UNIQUE INDEX notifications_dedupe_unique ON notifications (recipient_user_id, dedupe_key);
CREATE INDEX notifications_queue        ON notifications (next_attempt_at) WHERE status = 'pending';
CREATE INDEX notifications_processing   ON notifications (claimed_at)      WHERE status = 'processing';
CREATE INDEX notifications_recipient    ON notifications (recipient_user_id);
```
Insert uses `INSERT ... ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING`, so re-enqueuing the
same logical event for the same recipient is a no-op.

### 3.2 `job_runs`
```
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
job         text NOT NULL
run_key     text NOT NULL
status      text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','failed'))
details     jsonb
last_error  text
started_at  timestamptz NOT NULL DEFAULT now()
finished_at timestamptz

CREATE UNIQUE INDEX job_runs_key_unique ON job_runs (job, run_key);
```

## 4. Job runtime (`apps/api/src/jobs/`)

### 4.1 `runJob(name, runKey, fn, { staleMinutes })`
1. Pin a pool client; `pg_try_advisory_lock(hashtext(name))`. If not acquired → another replica is
   running this job; skip.
2. Claim the run atomically (single statement):
   ```sql
   INSERT INTO job_runs (job, run_key, status) VALUES ($1,$2,'started')
   ON CONFLICT (job, run_key) DO UPDATE
     SET status='started', started_at=now(), finished_at=NULL, details=NULL, last_error=NULL
     WHERE job_runs.status = 'failed'
        OR (job_runs.status = 'started'
            AND job_runs.started_at < now() - make_interval(mins => $3))
   RETURNING id;
   ```
   No row → already `completed`, or `started` and fresh → skip.
3. `await fn()` → `completed` (+`details`). On throw → `failed` (+`last_error`), rethrow to caller
   (scheduler catches). **`finally`: `pg_advisory_unlock` and release the client** on every path.

### 4.2 `quarterly-audit.job.ts`
`runQuarterlyAudit(now)` → `computeRosterAudit()` (shared, §5) → one `audit_logs` row
(`action: 'quarterly_roster_audit'`, `target_type: 'jobs'`, `actor_user_id: null`,
`details: { counts: { active_not_member, inactive_still_member, membership_unknown }, total }`) →
enqueue `audit_flagged` to all Admins, `dedupe_key = 'quarterly_audit:{YYYY}-Q{n}'`.
`run_key = 'quarterly_audit:{YYYY}-Q{n}'`.

### 4.3 `access-review-reminder.job.ts`
`runAccessReviewReminder(now)` → list roster ids with `access_review_pending = true`; if none, write
no notification. Else enqueue `access_review_reminder` to all Admins with
`dedupe_key = 'access_review_reminder:{ISO-week-key}'`, `payload = { count }`.
`run_key = 'access_review_reminder:{ISO-week-key}'` — weekly, so a still-open item re-nudges once a
week without daily spam.

### 4.4 `keys.ts`
- `quarterKey(date, tz)` → `'{YYYY}-Q{q}'` using the calendar year/quarter in `tz`.
- `isoWeekKey(date, tz)` → `'{ISO-year}-W{ww}'`, ISO-8601 week numbering (weeks start Monday; week 1
  contains the first Thursday) computed from the `tz`-local calendar date. Test: `2025-12-29` (UTC)
  → `2026-W01`.

### 4.5 `scheduler.ts` + lifecycle
- `startJobs()` (no-op when `!env.JOBS_ENABLED` or `NODE_ENV === 'test'`): registers two `node-cron`
  tasks (`AUDIT_JOB_CRON`, default `0 6 1 1,4,7,10 *`; `ACCESS_REVIEW_REMINDER_CRON`, default
  `0 6 * * 1`) with `{ timezone: env.JOBS_TIMEZONE }`, then runs **startup catch-up** (`runJob` for
  the current quarter key and the current week key — idempotent, runs once).
- `stopJobs()`: stops every cron task.
- `server.ts` starts jobs after `listen`, and on `SIGTERM`/`SIGINT` calls `stopJobs()` then
  `server.close()`.

### 4.6 Dev entrypoint
`apps/api/scripts/run-job.ts` via `npm run run:job -- <job> [--force]`:
- refuses when `NODE_ENV === 'production'`;
- `quarterly_audit` / `access_review_reminder` call the same `runJob` path;
- `--force` uses a unique run-key suffix (`:{epochMs}`) to bypass the gate.

## 5. Shared roster-audit function

Extract the Phase 10 logic from `members.service.listRosterAudit` into
`apps/api/src/services/roster-audit.service.ts → computeRosterAudit(db?)`. It takes **no** `req`,
`user`, or `role`; it returns `RosterAuditEntry[]` (issue ∈ `active_not_member`,
`inactive_still_member`, `membership_unknown`). `members.service.listRosterAudit` delegates to it and
`GET /api/roster/audit` keeps behaving exactly as before. The quarterly job reuses the same function
so the endpoint and the job can never drift.

## 6. Notification service & delivery

### 6.1 Writers (`apps/api/src/services/notifications.service.ts`)
- `enqueueNotification({ recipientUserId, event, payload, dedupeKey }, db = pool)` — one row, upsert-ignore.
- `notify(userId, event, payload, db = pool)` — generic single recipient; `dedupeKey = uuid()` (random,
  so repeated calls produce distinct notifications). Used by `member_removal_requested`.
- `findRecipientUserIds(roles, db?)` (in the repository) — the Admins/Registrars query.
- `notifyRepeatedRegistrationFailure({ userId, telegramId, failureCount })` — enqueue
  `repeated_registration_failure` to every Admin + Registrar, `dedupe_key =
  'repeated_failure:{userId}:{floor(now / REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS)}'`, so at most
  one alert per user per window. Runs **best-effort after the registration transaction commits**.
- `changeUserRole` enqueues `role_changed` **inside the same `withTransaction` client** as the role
  update + audit row, so a rollback enqueues nothing.

### 6.2 Delivery (`apps/api/src/services/notification-delivery.service.ts`)
- `claimNotifications(limit)` → repository `claimNotifications` (un-lease stale `processing`, then
  `FOR UPDATE SKIP LOCKED` a batch, increment `attempts`, join users for `telegram_id` + `role`).
- `completeNotification({ id, outcome, terminal?, error? })`:
  - `sent` → `status='sent', sent_at=now()`.
  - `failed` and (`terminal` or `attempts >= NOTIFICATION_MAX_ATTEMPTS`) → `status='failed'`.
  - otherwise → back to `pending` with `next_attempt_at = now() + computeBackoffSeconds(attempts, base)`.

### 6.3 Internal endpoints
`POST /internal/notifications/claim` (body `{ limit? }`) → `{ items: NotificationTask[] }`.
`POST /internal/notifications/:id/confirm` (body `{ outcome:'sent'|'failed', terminal?, error? }`) →
`{ status }`. Mounted under the existing internal-token router.

## 7. Bot side

### 7.1 `NotificationTask` (shared)
```
{ id, userId, telegramId, event, payload, attempts, recipientRole }
```

### 7.2 `isBotBlocked(err)`
True for `bot was blocked by the user`, `user is deactivated`, `chat not found`,
`can't initiate conversation`, `bot was kicked`. Terminal for notifications (never retried).

### 7.3 `templates/notification.ts`
`renderNotification(task)` switches on `event`; every interpolated value passes through `escapeHtml`;
role strings pass through a whitelisted `ROLE_LABELS` map (`admin→Administrator`,
`registrar→Registrar`, `faculty→Faculty`, `scholar→Scholar`) and any unknown role renders as
`Member`. Sent with `parse_mode: 'HTML'`.

### 7.4 `services/notification-delivery.ts`
`deliverNotificationTask` sends the DM; on success `completeNotification({ outcome:'sent' })`; on
`isBotBlocked` logs `warn { role, userId }` and `completeNotification({ outcome:'failed', terminal:true })`;
on any other error logs and reports a retryable failure. `runNotificationTick` claims a batch and
mirrors the other loops' `start/stop` + per-tick isolation. Wired into `apps/bot/src/index.ts` and
its `stop()`; added to `loops.test.ts`.

## 8. Config & env

| Var | Default | Where |
|-----|---------|-------|
| `JOBS_ENABLED` | `true` (forced off in tests) | api |
| `JOBS_TIMEZONE` | `UTC` | api |
| `AUDIT_JOB_CRON` | `0 6 1 1,4,7,10 *` | api |
| `ACCESS_REVIEW_REMINDER_CRON` | `0 6 * * 1` | api |
| `JOB_RUN_STALE_MINUTES` | `30` | api |
| `NOTIFICATION_MAX_ATTEMPTS` | `5` | api |
| `NOTIFICATION_BACKOFF_BASE_SECONDS` | `60` | api |
| `NOTIFICATION_LEASE_SECONDS` | `120` | api |
| `NOTIFICATION_BATCH_SIZE` | `10` | api |
| `BOT_NOTIFICATION_BATCH_SIZE` | `10` | bot |

`node-cron` + `@types/node-cron` added to `apps/api`.

## 9. Error handling & edge cases
- A throwing job body → `job_runs.status='failed'`, `logger.error`; the scheduler callback swallows so
  the process and the other job are unaffected. Advisory lock always released.
- Crash between claim and finish → the `started` row is retaken once older than `JOB_RUN_STALE_MINUTES`.
- Multi-replica → advisory lock prevents simultaneous execution; unique keys prevent duplicate work.
- Failed/blocked DMs → terminal for undeliverable cases, otherwise exponential backoff then `failed`.
- Notification payloads store ids/counts/roles only; no names, emails, usernames, or registration ids.
- Deploy note: every Admin and Registrar must press **Start** on the bot to receive alerts.

## 10. Testing
Shared: enum/schema unit tests.
Migration `0011` int test (tables, unique `(recipient_user_id, dedupe_key)`, indexes).
API unit: `runJob` (first-run executes; fresh `started` skips; stale `started` taken over; `failed`
retaken; throwing body ⇒ `failed` + lock released; already-`completed` skips); `keys` (year-boundary
`2025-12-29 → 2026-W01`, quarter boundaries); template/payload shape.
API int:
- `notifications.repository` — dedupe upsert (3 admins + 2 registrars ⇒ 5 rows; re-enqueue → 0),
  claim/lease/backoff/terminal.
- `notifications.service` → recipient fan-out, no-PII payload, repeated-failure single-per-window.
- `roster-audit` → endpoint and job use one function (same entries).
- `quarterly-audit.job` → run twice = one `audit_logs` row; each admin exactly one notification.
- `access-review-reminder.job` → weekly dedupe; second run same week no-op.
- `job-runs` lifecycle: stale-started takeover, failed retry, crash-after-insert recovery, advisory
  lock released after a throwing job, catch-up runs once.
- `changeUserRole` rollback enqueues nothing (force the write to fail → role unchanged, no notification).
- internal notifications controller: auth + claim/confirm validation.
Bot: `api-client` claim/confirm, `notification-delivery` (sent, blocked→terminal, retryable, tick),
`isBotBlocked`, `loops.test.ts` fifth loop, templates (HTML escaping + role whitelist).

## 10b. Docs
`api-reference.md` (2 internal endpoints), `database-schema.md` (`notifications`, `job_runs`,
`0011`), `workflows.md` (#3 quarterly job, #7 role-change now really notifies, #9 FR27 implemented;
FR26 coverage note + no `registration_received`), `security.md` (no-PII payloads, DM-failure
semantics, jobs in-process + advisory lock), `architecture.md` (jobs + fifth bot loop), `README.md`
(api + bot env tables; deploy note to press Start).

## 11. Deviations / notes to flag
- `member_removal_requested` was a Phase 10 stub call site; making `notify()` real means it now
  actually delivers. It keeps its neutral template and is outside the four events named in the
  briefing — flagged in the final report.
- `registration_received` intentionally absent (D5).

## 12. Out of scope
Mini App UI; notification inbox/read-state; purge/retention; Phase 12+.
