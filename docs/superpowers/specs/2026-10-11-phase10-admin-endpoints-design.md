# Phase 10 — Admin Endpoints — Design Spec

Date: 2026-10-11
Status: Approved (with amendments), implementing
Depends on: Phases 5–9 (`auth`, roster/registration, bot outbox, join-request pipeline, content module)

## 1. Goal

Deliver the Admin/Registrar management surface defined in `docs/context/api-reference.md`:
user/role management, audit-log viewing, system settings, dashboard stats, live channel
membership, member removal (kick), and the quarterly roster audit.

All Telegram side-effects (membership reads, kicks, invite revocation) go through the Bot
Service using the Phase 8/9 outbox + internal-endpoint pattern. **The API never calls
Telegram and never calls the bot** — the bot dials the API outbound.

Out of scope: Mini App UI (backend only, as prior phases); real FR26 notification delivery
(a log-only stub this phase — see §5.2).

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| D1 | Membership is a bot-reconciled snapshot in `channel_membership`, not a live Telegram call from the API. |
| D2 | Member removal is an outbox row (`member_removals`) the bot leases, executes (`banChatMember` → `unbanChatMember({only_if_banned:true})`), and confirms. |
| D3 | Registrar may remove **only** a roster entry where `status ∈ {graduated, withdrawn}` AND `updated_by = registrar's user id` AND `access_review_pending = true`. Admin may remove anyone. |
| D4 | `GET /api/members` is **admin-only**; `GET /api/roster/audit` is **registrar + admin**. |
| D5 | `PATCH /api/users/:id/role` blocks changing your own role and demoting the last admin (both under a transaction that locks admin rows). |
| D6 | Roster audit is driven from **roster entries only**; never invents flags for users without a roster entry. |
| D7 | Reactivating a roster entry (`status = 'active'`) cancels that user's pending removals. |
| D8 | `audit_logs` is immutable at the DB level (trigger raising on UPDATE/DELETE). |
| D9 | FR26 is a log-only stub with signature `notify(userId, event, payload)`; logs no PII. |

## 3. Data model (migration `0010_admin_membership.sql`)

### 3.1 `channel_membership`
```
user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
is_member   boolean NOT NULL
member_status text            -- raw Telegram status ('member'|'administrator'|'left'|...), nullable
checked_at  timestamptz NOT NULL DEFAULT now()
```
One row per user; upserted by `user_id`. No row ⇒ membership unknown.

### 3.2 `member_removals` (outbox)
```
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
requested_by     uuid REFERENCES users(id) ON DELETE SET NULL
initiated_by_role text NOT NULL CHECK (initiated_by_role IN ('admin','registrar'))
reason           text
status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','done','failed','cancelled'))
delivery_attempts integer NOT NULL DEFAULT 0
next_attempt_at  timestamptz
claimed_at       timestamptz
last_error       text
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()
processed_at     timestamptz
```
Indexes:
- `CREATE UNIQUE INDEX member_removals_open_user ON member_removals (user_id) WHERE status IN ('pending','processing');` — one open removal per user; a duplicate request is a no-op (idempotent 202).
- `... (next_attempt_at) WHERE status = 'pending'` — claim queue.
- `... (claimed_at) WHERE status = 'processing'` — stale-lease reclaim.

### 3.3 `invite_links`
Add `revoked_at timestamptz`. Active link = `used = false AND revoked_at IS NULL AND expires_at > now()`.

### 3.4 `audit_logs` immutability
```
CREATE FUNCTION forbid_audit_log_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'audit_logs are immutable'; END; $$;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_mutation();
```
Row-level trigger ⇒ does not fire on `TRUNCATE`. Test cleanup must use `TRUNCATE` (already
the case in `resetTestDatabase`; it must also add `channel_membership`, `member_removals`).

## 4. Settings reconciliation

`SystemSettings` gains `maxContentUploadBytes` (5 fields). Two upload settings stay separate
and are **not** deduplicated:

- `maxUploadSizeBytes` — Drive threshold, clamped to 50 MB; current DB value `47185920` (45 MB).
- `maxContentUploadBytes` — hard upload cap, default `524288000` (500 MB).

`PATCH /api/settings` validation (via `settingsUpdateSchema`, shared):
- `registrationIdPattern`: trimmed, non-empty, **`.max(200)`**, must compile as a RegExp, and must
  pass a `safe-regex2` check (dependency added to `apps/api`); failure ⇒ `400 VALIDATION_ERROR`.
- Non-empty body (at least one field) — existing refine.
- Other fields keep their existing constraints.

The safe-regex check runs in the API service (not the shared schema) so `@thd/shared` keeps only
`zod` as a dependency.

## 5. API surface

All under `/api` with `authUser`; routes live in `admin-routes.ts`, mounted **before**
`rosterRoutes` (roster routes apply a router-level `requireRole('registrar','admin')` that
otherwise leaks onto sibling `/api` mounts — same reason `contentRoutes` is mounted early).
Every admin route carries its **own** `requireRole(...)` guard — no router-level `.use` guard.

### 5.1 Users
- `GET /api/users` — admin. → `{ users: User[] }` (all users, id/telegramId/username/fullName/email/role/timestamps). Unpaginated (small cohort).
- `PATCH /api/users/:id/role` — admin. Body `roleChangeSchema`. Behaviour:
  - 404 if user not found.
  - **Self-change blocked**: `:id === req.user.id` → `400 VALIDATION_ERROR` "You cannot change your own role."
  - **Last-admin blocked**: if target is currently `admin` and is `scholar`/`faculty`/`registrar` target and would leave zero admins → `409 CONFLICT` "Cannot remove the last admin."
  - Implemented inside one transaction: `SELECT id FROM users WHERE role='admin' FOR UPDATE` to serialize concurrent demotions, then re-count.
  - Writes `audit_logs` `update_user_role` (`target_type='users'`, `details = { from, to }`).
  - Calls `notify(userId, 'role_changed', { from, to })` (log stub, no PII).
  - Returns `{ user }`.

### 5.2 `notify` stub
`apps/api/src/services/notifications.service.ts` adds:
```ts
export const notify = async (userId: string, event: string, payload: Record<string, unknown>): Promise<void>
```
Logs `{ userId, event, payload }` at `info` and returns. Never logs `full_name`, `email`, or
`registration_id`. Phase 11 will replace the body.

### 5.3 Audit logs
- `GET /api/audit-logs` — admin.
Query `auditLogQuerySchema`: `action?`, `actorUserId?`(uuid), `targetType?`, `page` (int ≥1, default 1), `pageSize` (int 1–100, default 50). Read-only.
Response `{ logs: AuditLog[], page, pageSize, total }` ordered `created_at DESC`.

### 5.4 Settings
- `GET /api/settings` — admin. Returns `{ settings: SystemSettings }` (all 5 keys; missing key → default).

### 5.5 `PATCH /api/settings` — admin
Body `settingsUpdateSchema`; extra guard: `registrationIdPattern` must pass `safe-regex2`.
Upsert changed keys with `updated_by = req.user.id`, `updated_at = now()`. Writes `audit_logs`
`update_settings` (`target_type='settings'`, `details = { key: { from, to } }` for each change).
Returns `{ settings }` (full, post-update).

### 5.6 Dashboard
`GET /api/dashboard/stats` — admin. Returns `{ stats: DashboardStats }`:
```ts
interface DashboardStats {
  totalScholars: number;         // roster join users where role='scholar'
  pendingJoinRequests: number;   // join_requests where status='pending'
  pendingAccessReviews: number;  // roster where access_review_pending = true
  contentByDiscipline: { discipline: DisciplineTag; count: number }[]; // content_posts deleted_at IS NULL
  recentActivity: AuditLog[];    // latest 10 audit rows
}
```

### 5.7 Members
`GET /api/members` — **admin**. Returns `{ members: MemberSummary[] }`:
```ts
interface MemberSummary {
  user: { id: string; telegramId: number; fullName: string; role: Role };
  roster: { registrationId: string; status: RosterStatus; cohortYear: number } | null;
  membership: { isMember: boolean; memberStatus: string | null; checkedAt: string } | null;
}
```
Ordered by `full_name`.

`POST /api/members/:userId/remove` — **admin**, or **registrar** under D3:
- 404 if user not found.
- Not allowed to remove a user whose `role = 'admin'` → `403 FORBIDDEN`.
- Not allowed to remove yourself → `400 VALIDATION_ERROR`.
- Registrar predicate (D3) evaluated over the user's roster entry; failure → `403 FORBIDDEN`.
- In one transaction: insert `member_removals` (idempotent via partial unique index — a second
  request while one is open returns the existing open removal), set `revoked_at = now()` on the
  user's active invite links, and if registrar-initiated clear `roster.access_review_pending`.
- Writes `audit_logs` `member_removal_requested` (`target_type='users'`,
  `details = { reason }`).
- Returns **202** `{ removal: { id, userId, status } }`.

### 5.8 Roster audit
`GET /api/roster/audit` — **registrar + admin**. Driven from roster entries that have a
`user_id` (entries with no linked user are omitted — they cannot be cross-referenced).
Returns `{ entries: RosterAuditEntry[] }`:
```ts
type RosterAuditIssue = 'active_not_member' | 'inactive_still_member' | 'membership_unknown';
interface RosterAuditEntry {
  roster: { id: string; userId: string; registrationId: string; status: RosterStatus; cohortYear: number };
  membership: { isMember: boolean; memberStatus: string | null; checkedAt: string } | null;
  issue: RosterAuditIssue;
}
```
Rules (in order):
1. no `channel_membership` row → `membership_unknown`
2. `status = 'active'` and `is_member = false` → `active_not_member`
3. `status ∈ {graduated, withdrawn, pending}` and `is_member = true` → `inactive_still_member`
4. otherwise → not included.

Never synthesizes entries for users without a roster row (D6): an admin/faculty/registrar
without a roster entry is never flagged.

## 6. Internal endpoints (Bot → API, `X-Internal-Token`)

All in `internal-routes.ts` via `internal-members-controller.ts`.

- `GET /internal/members/reconcile-targets` → `{ targets: { userId: string; telegramId: number }[] }`
  (all users).
- `PUT /internal/members/snapshot` — body `{ members: { telegramId: number; isMember: boolean; memberStatus?: string | null }[] }`;
  upserts `channel_membership` for known `telegram_id`s only; ignores unknown ids; sets
  `checked_at = now()`. Returns `{ updated: number }`.
- `POST /internal/members/removals/claim` — body `{ limit?: number }` (1–100, default
  `MEMBER_REMOVAL_BATCH_SIZE`). Reclaims stale `processing` leases, then leases `pending` rows
  (`FOR UPDATE SKIP LOCKED`) whose initiation allows it (D7/§6.1), incrementing
  `delivery_attempts`. Returns `{ items: MemberRemovalTask[] }`:
  ```ts
  interface MemberRemovalTask { id: string; userId: string; telegramId: number; attempts: number; }
  ```
  A task whose user has no `telegram_id` (none exist in practice) is failed terminally and omitted.
- `POST /internal/members/removals/:id/confirm` — body `{ outcome: 'removed' | 'failed'; error?: string }`.
  `removed` → status `done`, `processed_at = now()`, upsert `channel_membership (is_member=false)`.
  `failed` → reschedule with `computeBackoffSeconds`; at `MEMBER_REMOVAL_MAX_ATTEMPTS` mark `failed`
  and write `audit_logs` `member_removal_failed`. Idempotent on already-terminal rows.

### 6.1 Claim skip rule (D7)
Claim leases rows where `status='pending'` AND ( `initiated_by_role='admin'` OR the user's roster
entry still has `status ∈ {graduated, withdrawn}` ). Reactivation additionally sets pending rows
to `cancelled`, so the guard is defense-in-depth.

### 6.2 `channel_membership` freshness (amendment 7)
Upserted in three places: (a) snapshot push; (b) removal confirmed (`is_member=false`);
(c) join-request delivery `delivered` → `channel_membership (is_member=true)`.

## 7. Bot side

### 7.1 Bot loops
- `apps/bot/src/services/membership-sync.ts`: `startMembershipSyncLoop` / `stopMembershipLoop`.
  Each tick: `GET /internal/members/reconcile-targets` → for each target call
  `getChatMember(channelId, telegramId)`, **throttled to ≤20 calls/sec**; a `429` honours
  `retry_after` as a **pause** (not a failure); other errors are logged and skipped. Builds the
  snapshot and `PUT /internal/members/snapshot`.
- `apps/bot/src/services/member-removal.ts`: `deliverMemberRemoval` / `runMemberRemovalTick` /
  `startMemberRemovalLoop` / `stopMemberRemovalLoop`: lease → `banChatMember` then
  `unbanChatMember({ only_if_banned: true })` → confirm `removed`. Telegram "user not in chat"
  and "invite link already revoked/expired" count as success. Backoff/terminal failure mirrors
  the content loop.
- **Loop isolation:** each `setInterval` callback (join-request, content, membership-sync,
  member-removal) must catch its own errors so a failure in one loop never stalls the others.
  Existing loops get a defensive `try/catch` around their tick.

### 7.2 Env (bot)
- `BOT_MEMBERSHIP_SYNC_INTERVAL_MS` (default `900000`).
- `BOT_MEMBERSHIP_SYNC_RATE_PER_SEC` (default `20`) — throttle.
- `BOT_MEMBER_REMOVAL_BATCH_SIZE` (default `10`).
Add to `apps/bot/.env.example` and `README.md`.

### 7.3 Env (api)
- `MEMBER_REMOVAL_LEASE_SECONDS` (default `120`), `MEMBER_REMOVAL_MAX_ATTEMPTS` (default `5`),
  `MEMBER_REMOVAL_MAX_BATCH` (default `100`). Add to `apps/api/.env.example` + `README.md`,
  following the Phase 8/9 constants pattern in `apps/api/src/config/env.ts`.

## 8. Shared package additions

- `types/enums.ts`: `MemberRemovalStatus`, `RosterAuditIssue`.
- `types/entities.ts`: `ChannelMembership`, `MemberSummary`, `RosterAuditEntry`, `DashboardStats`.
- `types/internal.ts`: `MemberRemovalTask`, `ClaimMemberRemovalsResponse`, `MembershipSnapshotEntry`.
- `types/settings.ts`: add `maxContentUploadBytes`.
- `types/common.ts` (new): `Paginated<T>`.
- `schemas/users.ts`: keep `roleChangeSchema`.
- `schemas/audit-logs.ts` (new): `auditLogQuerySchema` (`page`/`pageSize` coerced, `action`/`targetType`
  trimmed strings, `actorUserId` uuid).
- `schemas/members.ts` (new): `removeMemberSchema` (`reason` optional, max 500),
  `membershipSnapshotSchema`, `memberRemovalConfirmSchema`.
- `schemas/settings.ts`: add `.max(200)` to `registrationIdPattern`.
- `constants/audit.ts` (new): audit action names (`update_user_role`, `update_settings`,
  `member_removal_requested`, `member_removal_failed`) and target types.

## 9. Testing strategy (TDD)

Repo integration tests (real test DB, `-c vitest.integration.config.ts`):
- `channel_membership` upsert + unknown-telegram ignore.
- `member_removals` partial unique index (duplicate open removal no-op), claim lease/reclaim,
  reactivation cancellation, confirm removed/failed/terminal.
- `invite_links` `revoked_at`.
- **audit immutability:** `UPDATE audit_logs …` and `DELETE FROM audit_logs …` both throw at the DB level.
- settings read/upsert; users list; audit-log filter/pagination; dashboard aggregations;
  roster-audit issue rules; membership freshness on join-request confirm + removal confirm.

HTTP tests (supertest against `app`, `authUser` with `AUTH_MOCK_ENABLED`/`X-Mock-User` or signed initData
consistent with Phase 9 tests): **every** admin endpoint exercised against **all four roles and
unauthenticated**:
- `GET /api/users`, `PATCH /api/users/:id/role`, `GET /api/audit-logs`, `GET/PATCH /api/settings`,
  `GET /api/dashboard/stats`, `GET /api/members`, `POST /api/members/:userId/remove`,
  `GET /api/roster/audit`.
- Role guards: self-demotion blocked, last-admin blocked, concurrent double-demotion leaves ≥1 admin.
- Registrar predicate truth table; duplicate removal request; self removal blocked; admin-role
  user removal blocked.
- Registrar removal cancelled by reactivation.

Bot unit tests:
- `membership-sync` (mocked Telegraf + api-client): throttle, 429 `retry_after` pause (not failure),
  error isolation.
- `member-removal` loop: kick+unban, invite revocation, "not in chat" success, backoff/terminal.
- Api-client new methods.
- Loop-isolation: a throwing tick in one loop does not reject.

## 10. Docs
`api-reference.md` (admin + new internal member endpoints), `database-schema.md` (tables/columns +
`0010` + immutability trigger), `workflows.md` (#3, #4 → implemented; membership-unknown note),
`security.md` (membership snapshot staleness + roster-audit scope; no-PII notification stub),
`architecture.md` (admin surface + membership sync + removal outbox), `README.md` (env tables).

## 11. Non-goals
Mini App UI; real reCAPTCHA/notification delivery (FR26/FR27 stay stubs); enumerating channel
members (impossible via Bot API — documented).
