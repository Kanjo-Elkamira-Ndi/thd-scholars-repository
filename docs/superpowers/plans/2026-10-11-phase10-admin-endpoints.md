# Phase 10 — Admin Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the Admin/Registrar management surface (users/roles, audit logs, settings, dashboard, members/membership, member removal, roster audit) with a bot-reconciled membership snapshot and a member-removal outbox.

**Architecture:** Thin RBAC HTTP layer over focused repos/services. Telegram side-effects are bot-owned: the bot reconciles membership into `channel_membership`, leases `member_removals`, and confirms. The API never calls Telegram.

**Tech Stack:** TypeScript, Express, pg (raw SQL), zod, Vitest + supertest, Telegraf, pino. Workspaces: `packages/shared`, `apps/api`, `apps/bot`.

**Spec:** `docs/superpowers/specs/2026-10-11-phase10-admin-endpoints-design.md`

## Global Constraints

- **No commits.** A standing directive forbids committing without an explicit ask. Ignore the "Commit" steps' git commands; leave work uncommitted. (Flag in the final report.)
- **TDD:** write the failing test first, run it, implement, run to green.
- Node ≥20; `pg` raw SQL; no ORM. New SQL follows the `FOR UPDATE SKIP LOCKED` claim pattern from `apps/api/src/repositories/content.repository.ts`.
- API env vars must have defaults (unit tests run without them): `MEMBER_REMOVAL_LEASE_SECONDS=120`, `MEMBER_REMOVAL_MAX_ATTEMPTS=5`, `MEMBER_REMOVAL_MAX_BATCH=100`.
- Bot env defaults: `BOT_MEMBERSHIP_SYNC_INTERVAL_MS=900000`, `BOT_MEMBERSHIP_SYNC_RATE_PER_SEC=20`, `BOT_MEMBER_REMOVAL_BATCH_SIZE=10`.
- Settings stay separate: `maxUploadSizeBytes` (45 MB Drive threshold, DB `47185920`) and `maxContentUploadBytes` (500 MB cap, DB `524288000`). Never merge.
- `audit_logs` is immutable at the DB level; tests must clean up with `TRUNCATE` (never DELETE/UPDATE).
- `notify` logs no PII (no `full_name`, `email`, `registration_id`).
- Commands: from repo root `npm run build:shared`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`; integration `npm run test:integration --workspace=apps/api`; single int file `npx vitest run -c vitest.integration.config.ts src/<path>` (workdir `apps/api`).

---

## Task 1: Shared types, schemas, constants, `SystemSettings`

**Files:**
- Modify: `packages/shared/src/types/enums.ts`
- Modify: `packages/shared/src/types/entities.ts`
- Modify: `packages/shared/src/types/internal.ts`
- Modify: `packages/shared/src/types/settings.ts`
- Create: `packages/shared/src/schemas/audit-logs.ts`
- Create: `packages/shared/src/schemas/members.ts`
- Create: `packages/shared/src/constants/audit.ts`
- Modify: `packages/shared/src/schemas/settings.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/members.test.ts`, `packages/shared/src/schemas/audit-logs.test.ts`

**Interfaces (produces):**
```ts
// enums.ts
export type MemberRemovalStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';
export type MemberRemovalInitiator = 'admin' | 'registrar';
// entities.ts
export interface ChannelMembership { isMember: boolean; memberStatus: string | null; checkedAt: string; }
export interface MemberSummary {
  user: { id: string; telegramId: number; fullName: string; role: Role };
  roster: { registrationId: string; status: RosterStatus; cohortYear: number } | null;
  membership: ChannelMembership | null;
}
export interface RosterAuditEntry {
  roster: { id: string; userId: string; registrationId: string; status: RosterStatus; cohortYear: number };
  membership: ChannelMembership | null;
  issue: 'active_not_member' | 'inactive_still_member' | 'membership_unknown';
}
export interface DashboardStats {
  totalScholars: number; pendingJoinRequests: number; pendingAccessReviews: number;
  contentByDiscipline: { discipline: DisciplineTag; count: number }[];
  recentActivity: AuditLog[];
}
// settings.ts
export interface SystemSettings { registrationIdPattern: string; availableCohortYears: number[]; inviteLinkExpirySeconds: number; maxUploadSizeBytes: number; maxContentUploadBytes: number; }
// internal.ts
export interface MembershipReconcileTarget { userId: string; telegramId: number; }
export interface MembershipSnapshotEntry { telegramId: number; isMember: boolean; memberStatus: string | null; }
export interface MemberRemovalTask { id: string; userId: string; telegramId: number; attempts: number; }
export interface ClaimMemberRemovalsResponse { items: MemberRemovalTask[]; }
// constants/audit.ts
export const AUDIT_ACTIONS = { UPDATE_USER_ROLE: 'update_user_role', UPDATE_SETTINGS: 'update_settings', MEMBER_REMOVAL_REQUESTED: 'member_removal_requested', MEMBER_REMOVAL_FAILED: 'member_removal_failed' } as const;
export const AUDIT_TARGET_TYPES = { USERS: 'users', SETTINGS: 'settings' } as const;
// schemas/audit-logs.ts
export const auditLogQuerySchema = z.object({ action: z.string().trim().min(1).optional(), actorUserId: z.string().uuid().optional(), targetType: z.string().trim().min(1).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
// schemas/members.ts
export const removeMemberSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() });
export const membershipSnapshotSchema = z.object({ members: z.array(z.object({ telegramId: z.number().int().positive(), isMember: z.boolean(), memberStatus: z.string().trim().max(50).nullable().optional().default(null) })) });
export const memberRemovalConfirmSchema = z.object({ outcome: z.enum(['removed','failed']), error: z.string().trim().min(1).max(1000).optional() }).refine(v => v.outcome === 'removed' || !!v.error, { message: 'error is required when outcome is failed' });
```
- `schemas/settings.ts`: add `.max(200, { message: 'Pattern must be 200 characters or fewer' })` to `registrationIdPattern`.
- `index.ts`: add `export * from './constants/audit'; export * from './schemas/audit-logs'; export * from './schemas/members';`

- [x] **Step 1: Write failing tests** — `members.test.ts`: valid snapshot passes; negative telegramId fails; `removeMemberSchema` empty object passes, `reason` >500 fails; `memberRemovalConfirmSchema` `{outcome:'failed'}` without error fails. `audit-logs.test.ts`: defaults `page=1,pageSize=50`; `actorUserId:'nope'` fails; `pageSize:101` fails.
- [x] **Step 2: Run** `npx vitest run src/schemas/members.test.ts src/schemas/audit-logs.test.ts` (workdir `packages/shared`) → FAIL (modules missing).
- [x] **Step 3: Implement** the types/schemas/constants above.
- [x] **Step 4: Run** `npm run build:shared && npx vitest run src/schemas/members.test.ts src/schemas/audit-logs.test.ts` (workdir `packages/shared`) → PASS.
- [x] **Step 5: Commit (SKIP per Global Constraints).**

### Task 2: Migration `0010` + test DB truncate + audit-immutability test

**Files:**
- Create: `apps/api/src/db/migrations/0010_admin_membership.sql`
- Modify: `apps/api/src/db/testing/test-database.ts` (TRUNCATE list)
- Test: `apps/api/src/db/migrations/audit-immutability.int.test.ts`

**Interfaces (produces):** DB tables `channel_membership`, `member_removals`; `invite_links.revoked_at`; trigger `audit_logs_immutable`.

- [x] **Step 1: Write failing test** `audit-immutability.int.test.ts`: insert a user + `insertAuditLog`, then `await expect(pool.query("UPDATE audit_logs SET action='x'")).rejects.toThrow(/immutable/i)` and same for `DELETE FROM audit_logs`.
- [x] **Step 2: Run** `npx vitest run -c vitest.integration.config.ts src/db/migrations/audit-immutability.int.test.ts` (workdir `apps/api`) → FAIL (no trigger).
- [x] **Step 3: Implement migration** per spec §3 (tables, indexes, `revoked_at`, trigger function). Add `channel_membership, member_removals` to the `TRUNCATE` statement in `resetTestDatabase`.
- [x] **Step 4: Run** the test → PASS. Then run the full int suite once to confirm the new migration applies cleanly.
- [x] **Step 5: Commit (SKIP).**

### Task 3: `channel-membership.repository.ts`

**Files:** Create `apps/api/src/repositories/channel-membership.repository.ts`; Test `apps/api/src/repositories/channel-membership.repository.int.test.ts`.

**Interfaces (produces):**
```ts
export const mapChannelMembership = (row: {is_member:boolean; member_status:string|null; checked_at:Date}): ChannelMembership
export const upsertMembershipByTelegram = (entries: MembershipSnapshotEntry[], db?: Db): Promise<number> // ignores unknown telegram ids
export const upsertMembershipForUser = (userId: string, input: {isMember:boolean; memberStatus:string|null}, db?: Db): Promise<void>
export const getMembershipForUser = (userId: string, db?: Db): Promise<ChannelMembership | null>
export const listReconcileTargets = (db?: Db): Promise<MembershipReconcileTarget[]>
```
- [x] **Step 1: Failing test** — upsert two entries (one unknown telegram) → returns 1 and only the known user has a row; re-upsert flips `is_member` and refreshes `checked_at`; `listReconcileTargets` returns all users.
- [x] **Step 2: Run** the int file → FAIL.
- [x] **Step 3: Implement** with `INSERT ... ON CONFLICT (user_id) DO UPDATE` driven by a `SELECT id FROM users WHERE telegram_id = ANY($1)`.
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit (SKIP).**

### Task 4: `member-removals.repository.ts`

**Files:** Create `apps/api/src/repositories/member-removals.repository.ts`; Test `...int.test.ts`.

**Interfaces (produces):**
```ts
export interface MemberRemoval { id; userId; requestedBy; initiatedByRole; reason; status; attempts; nextAttemptAt; claimedAt; lastError; createdAt; updatedAt; processedAt; }
export const mapMemberRemoval = (row): MemberRemoval
export const insertMemberRemoval = (input: {userId; requestedBy: string|null; initiatedByRole: MemberRemovalInitiator; reason: string|null}, db?: Db): Promise<{ removal: MemberRemoval; created: boolean }> // ON CONFLICT (open index) DO NOTHING, then read the open row
export const cancelPendingRemovalsForUser = (userId: string, db?: Db): Promise<number>
export const claimMemberRemovals = (input: {limit: number; leaseSeconds: number}, db?: Db): Promise<MemberRemovalTask[]>
export const getMemberRemoval = (id: string, db?: Db): Promise<MemberRemoval | null>
export const markMemberRemovalDone = (id: string, db?: Db): Promise<void>
export const rescheduleMemberRemoval = (id: string, input: {error: string; nextAttemptAt: Date}, db?: Db): Promise<void>
export const markMemberRemovalFailed = (id: string, input: {error: string; terminal: boolean}, db?: Db): Promise<void>
```
- Claim SQL (skip rule, spec §6.1): `UPDATE member_removals m SET status='processing', claimed_at=now(), delivery_attempts=m.delivery_attempts+1, updated_at=now() FROM users u WHERE u.id=m.user_id AND m.id IN (SELECT m2.id FROM member_removals m2 LEFT JOIN roster r ON r.user_id=m2.user_id WHERE m2.status='pending' AND (m2.next_attempt_at IS NULL OR m2.next_attempt_at<=now()) AND (m2.initiated_by_role='admin' OR r.status IN ('graduated','withdrawn')) ORDER BY m2.created_at FOR UPDATE SKIP LOCKED LIMIT $1) RETURNING m.id, m.user_id, u.telegram_id, m.delivery_attempts` — preceded by a stale-lease reset like `claimContentTasks`.
- [x] **Step 1: Failing tests** — duplicate open removal: second `insertMemberRemoval` returns `created:false` and the same id; `cancelPendingRemovalsForUser` moves `pending`→`cancelled`; claim leases a registrar removal only when roster is `graduated`/`withdrawn` (an `active` roster row with a registrar removal is skipped; an admin removal on an active roster is leased); `markMemberRemovalDone` sets `done` + `processed_at`; `markMemberRemovalFailed(id,{terminal:false})` reschedules, `{terminal:true}` sets `failed`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit (SKIP).**

### Task 5: `users.repository.ts` additions

**Files:** Modify `apps/api/src/repositories/users.repository.ts`; Test `apps/api/src/repositories/users.repository.int.test.ts` (extend).

**Interfaces (produces):**
```ts
export const listUsers = (db?: Db): Promise<User[]>                    // ORDER BY full_name
export const getUserById = (id: string, db?: Db): Promise<User | null>
export const updateUserRole = (id: string, role: Role, db?: Db): Promise<User>
export const countAdmins = (db?: Db): Promise<number>
export const lockAdmins = (db: Db): Promise<{ id: string }[]>          // SELECT id FROM users WHERE role='admin' FOR UPDATE
```
- [x] **Step 1: Failing tests** — list ordering; `updateUserRole` returns the new role; `countAdmins`; `lockAdmins` inside `withTransaction` returns admin ids.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 6: `audit-logs.repository.ts` additions

**Files:** Modify `apps/api/src/repositories/audit-logs.repository.ts`; Test `...int.test.ts`.

**Interfaces (produces):**
```ts
export interface ListAuditLogsParams { action?: string; actorUserId?: string; targetType?: string; page: number; pageSize: number; }
export const listAuditLogs = (p: ListAuditLogsParams, db?: Db): Promise<{ logs: AuditLog[]; total: number }>
```
- [x] **Step 1: Failing tests** — seed 3 rows with distinct actions; filter by `action` returns 1; `targetType` filter; pagination `page=2,pageSize=1` returns the right row + `total=3`; ordering `created_at DESC`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement** (dynamic `WHERE` + `COUNT(*) OVER()`). **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 7: `settings.repository.ts` additions

**Files:** Modify `apps/api/src/repositories/settings.repository.ts`; Test `...int.test.ts` (extend).

**Interfaces (produces):**
```ts
export const getSystemSettings = (db?: Db): Promise<SystemSettings>
export const upsertSettings = (entries: { key: string; value: unknown }[], updatedBy: string|null, db?: Db): Promise<void>
```
`getSystemSettings` uses the existing clamped getters for the two upload keys, `getInviteLinkExpirySeconds()`, raw `registrationIdPattern` (fallback `^DIBI-THD-\\d{4}$`), raw `availableCohortYears` (fallback `[2025,2026]`).
- [x] **Step 1: Failing tests** — defaults returned on seeded DB; `upsertSettings` writes jsonb + `updated_by`; re-read reflects change; the 45 MB / 500 MB values are distinct.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 8: `invite-links.repository.ts` (new) + roster cancel hook preparation

**Files:** Create `apps/api/src/repositories/invite-links.repository.ts`; Test `...int.test.ts`.

**Interfaces (produces):**
```ts
export const listActiveInviteLinksForUser = (userId: string, db?: Db): Promise<{ id: string; link: string }[]>
export const revokeActiveInviteLinksForUser = (userId: string, db?: Db): Promise<{ id: string; link: string }[]> // sets revoked_at=now(), returns the revoked links
```
Active = `used=false AND revoked_at IS NULL AND expires_at > now()`.
- [x] **Step 1: Failing tests** — one used link + one active → only active returned; revoke sets `revoked_at` and returns the active links; a second revoke returns `[]`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 9: API env constants + `safe-regex2` + `settings.service.ts`

**Files:** Modify `apps/api/src/config/env.ts`, `apps/api/package.json`, `apps/api/.env.example`; Create `apps/api/src/services/settings.service.ts`; Test `apps/api/src/services/settings.service.test.ts`.

**Interfaces (produces):**
```ts
// env.ts (ApiEnv gains)
memberRemovalLeaseSeconds: number; // default 120
memberRemovalMaxAttempts: number;  // default 5
memberRemovalMaxBatch: number;     // default 100
// settings.service.ts
export const getSystemSettings = (): Promise<SystemSettings>
export const updateSystemSettings = (input: SettingsUpdateInput, actorUserId: string): Promise<SystemSettings>
```
`updateSystemSettings`: read old settings; if `registrationIdPattern` present, reject unsafe pattern (`400 VALIDATION_ERROR` "Pattern is too complex") via `safeRegex(value)`; upsert changed keys; write audit `update_settings` with `{ key: { from, to } }`; return new settings.
- [x] **Step 1: Install** `npm install safe-regex2 --workspace=apps/api` and `npm install -D @types/safe-regex2 --workspace=apps/api` (or a local `.d.ts` if no types).
- [x] **Step 2: Failing unit test** — mock the repos (vi.mock) : unsafe pattern `(a+)+$` → rejects VALIDATION_ERROR; safe pattern calls `upsertSettings` + `insertAuditLog` with old/new; no-pattern update skips the regex check.
- [x] **Step 3: Run** `npx vitest run src/services/settings.service.test.ts` (workdir `apps/api`) → FAIL.
- [x] **Step 4: Implement** env + service. **Step 5: Run** → PASS. **Step 6: Commit (SKIP).**

### Task 10: `admin-users.service.ts` (list + role change with guards)

**Files:** Create `apps/api/src/services/admin-users.service.ts`; Test `...test.ts` (unit, mocked repos) + `apps/api/src/services/admin-users.int.test.ts`.

**Interfaces (produces):**
```ts
export const listUsers = (): Promise<User[]>
export const changeUserRole = (targetId: string, role: Role, actorUserId: string): Promise<User>
```
`changeUserRole` (inside `withTransaction`): target missing → `404 NOT_FOUND`; `targetId === actorUserId` → `400 VALIDATION_ERROR`; `await lockAdmins(client)`; if target role is `admin` and new role ≠ admin and `countAdmins(client)<=1` → `409 CONFLICT`; `updateUserRole`; `insertAuditLog` `update_user_role`; `notify(targetId,'role_changed',{from,to})`; return user.
- [x] **Step 1: Failing unit tests** — self-change blocked; last-admin blocked; success writes audit + notify. **Step 2: Run** → FAIL.
- [x] **Step 3: Failing int tests** — concurrent demotion: create 2 admins, fire `Promise.all([changeUserRole(a,'scholar',b), changeUserRole(b,'scholar',a)])`, assert exactly one rejects `409` and `countAdmins()===1`.
- [x] **Step 4: Implement.** **Step 5: Run** unit + int → PASS. **Step 6: Commit (SKIP).**

> Note: concurrency lock requires `lockAdmins` on the same client. The `withTransaction` wrapper supplies it.

### Task 11: `notify` stub + `audit-logs.service.ts`

**Files:** Modify `apps/api/src/services/notifications.service.ts`; Create `apps/api/src/services/audit-logs.service.ts`; Tests `notifications.service.test.ts`, `audit-logs.service.int.test.ts`.

**Interfaces (produces):**
```ts
export const notify = (userId: string, event: string, payload: Record<string, unknown>): Promise<void> // logs {userId,event,payload}, no PII
export const listAuditLogs = (query: AuditLogQuery): Promise<{ logs: AuditLog[]; page: number; pageSize: number; total: number }>
```
- [x] **Step 1: Failing unit test** — `notify` resolves and logs event (spy on logger.warn not called; assert no `fullName`/`email` strings). **Int test** — service maps repo output to `{logs,page,pageSize,total}`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 12: `dashboard.service.ts`

**Files:** Create `apps/api/src/services/dashboard.service.ts`; Test `...int.test.ts`.

**Interfaces (produces):** `export const getDashboardStats = (): Promise<DashboardStats>`.
Queries: `totalScholars` = roster join users where role='scholar'; `pendingJoinRequests` = join_requests status='pending'; `pendingAccessReviews` = roster where access_review_pending; `contentByDiscipline` = group by discipline_tag where deleted_at IS NULL; `recentActivity` = 10 latest audit rows.
- [x] **Step 1: Failing int test** — seed scholars/roster/join_requests/content → assert counts + discipline groups + recent activity length.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 13: `members.service.ts` (list, remove, roster audit) + roster reactivation cancel

**Files:** Create `apps/api/src/services/members.service.ts`; Modify `apps/api/src/services/roster.service.ts`; Tests `members.service.int.test.ts`, extend `roster.int.test.ts`.

**Interfaces (produces):**
```ts
export const listMembers = (): Promise<MemberSummary[]>
export const requestMemberRemoval = (targetUserId: string, actor: {id: string; role: Role}, reason: string | null): Promise<{ removal: MemberRemoval; created: boolean }>
export const listRosterAudit = (): Promise<RosterAuditEntry[]>
```
`requestMemberRemoval` (one transaction): target missing → 404; `target.role==='admin'` → 403; `targetUserId===actor.id` → 400; if actor is registrar, load the target's roster entry and require `status∈{graduated,withdrawn} && updated_by===actor.id && access_review_pending` else 403; `insertMemberRemoval` (idempotent); `revokeActiveInviteLinksForUser`; if registrar-initiated set `roster.access_review_pending=false`; `insertAuditLog` `member_removal_requested`.
Roster cancel: in `roster.service.ts` update path, when `patch.status==='active'` and the entry has a `user_id`, call `cancelPendingRemovalsForUser(userId, client)` in the same transaction.
- [x] **Step 1: Failing int tests** — registrar predicate truth table (own+graduated+pending ✓; other's ✗; active ✗; already-cleared ✗); admin can remove an active scholar; self-removal 400; admin-target 403; duplicate request returns same id `created:false`; active invite link gets `revoked_at`; registrar removal clears `access_review_pending`; `listRosterAudit` issue rules (unknown/active_not_member/inactive_still_member/omitted) and roster-only scope (a non-roster user is never listed); roster reactivation cancels a pending removal.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 14: Controllers + `admin-routes.ts` + app mount + HTTP role-boundary tests

**Files:** Create `apps/api/src/controllers/admin-users-controller.ts`, `admin-config-controller.ts`, `admin-members-controller.ts`, `apps/api/src/routes/admin-routes.ts`; Modify `apps/api/src/app.ts`; Test `apps/api/src/controllers/admin.int.test.ts`.

**Interfaces (produces):** Routes (each with its own `requireRole`):
`GET /api/users` (admin) · `PATCH /api/users/:id/role` (admin) · `GET /api/audit-logs` (admin) · `GET /api/settings` (admin) · `PATCH /api/settings` (admin) · `GET /api/dashboard/stats` (admin) · `GET /api/members` (admin) · `POST /api/members/:userId/remove` (admin, registrar) · `GET /api/roster/audit` (registrar, admin).
Controllers validate `req.params.id` as uuid (`400 VALIDATION_ERROR`), parse bodies with the shared schemas, and return `{ users }` / `{ user }` / `{ logs,page,pageSize,total }` / `{ settings }` / `{ stats }` / `{ members }` / 202 `{ removal }` / `{ entries }`.
`app.ts`: `app.use('/api', authUser, adminRoutes);` placed **after `contentRoutes`, before `rosterRoutes`**.
- [x] **Step 1: Failing HTTP tests** — for each endpoint: unauthenticated → 401; wrong roles (scholar, faculty, and for admin-only also registrar) → 403; allowed role → success. Plus: `PATCH /api/users/:id/role` self → 400, last-admin → 409; `POST /api/members/:userId/remove` registrar predicate → 403/202; `GET /api/roster/audit` registrar allowed.
- [x] **Step 2: Run** `npx vitest run -c vitest.integration.config.ts src/controllers/admin.int.test.ts` (workdir `apps/api`) → FAIL (404s).
- [x] **Step 3: Implement** controllers + routes + mount. **Step 4: Run** → PASS. **Step 5: Commit (SKIP).**

### Task 15: `internal-members-controller.ts` + internal routes + membership freshness

**Files:** Create `apps/api/src/controllers/internal-members-controller.ts`, `apps/api/src/services/member-delivery.service.ts` (claim/confirm/getTargets/snapshot); Modify `apps/api/src/routes/internal-routes.ts`, `apps/api/src/services/join-request-delivery.service.ts` (delivered → `upsertMembershipForUser(...,{isMember:true})`); Tests `apps/api/src/controllers/internal-members.int.test.ts`, extend `join-request-delivery` coverage.

**Interfaces (produces):** internal routes
```
GET  /internal/members/reconcile-targets
PUT  /internal/members/snapshot              (membershipSnapshotSchema)
POST /internal/members/removals/claim        ({ limit? } 1..env.memberRemovalMaxBatch)
POST /internal/members/removals/:id/confirm  (memberRemovalConfirmSchema)
```
Service: `claimMemberRemovals(limit)` reuses repo + env lease; `completeMemberRemoval(id, input)` — terminal-safe; on `removed` → `markMemberRemovalDone` + `upsertMembershipForUser(userId,{isMember:false,memberStatus:'left'})`; on `failed` → `markMemberRemovalFailed` with `computeBackoffSeconds`; at max attempts write `member_removal_failed` audit.
- [x] **Step 1: Failing int tests** — before/after token (401 without `X-Internal-Token`); snapshot upserts only known telegrams; targets list; claim returns leased tasks; confirm `removed` sets done + membership false; confirm `failed` reschedules; join-request delivered sets membership true.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 16: Bot env + api-client methods

**Files:** Modify `apps/bot/src/config/env.ts`, `apps/bot/.env.example`, `apps/bot/src/services/api-client.ts`; Test `apps/bot/src/services/api-client.test.ts` (extend).

**Interfaces (produces):**
```ts
// env.ts BotEnv gains: membershipSyncIntervalMs: number; membershipSyncRatePerSec: number; memberRemovalBatchSize: number;
// api-client.ts
getMembershipReconcileTargets(): Promise<MembershipReconcileTarget[]>
pushMembershipSnapshot(entries: MembershipSnapshotEntry[]): Promise<void>
claimMemberRemovals(limit?: number): Promise<MemberRemovalTask[]>
completeMemberRemoval(id: string, input: { outcome: 'removed' | 'failed'; error?: string }): Promise<void>
// + MemberRemovalTask type imported from @thd/shared
```
- [x] **Step 1: Failing unit test** — each method hits the right path/method and unwraps the response (`items`/`targets`). **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 17: Bot `membership-sync.ts`

**Files:** Create `apps/bot/src/services/membership-sync.ts`; Test `...test.ts`.

**Interfaces (produces):**
```ts
export interface MembershipSyncDeps { api: BotApiClient; telegram: Telegraf['telegram']; channelId: string; logger: Pick<Logger,'warn'|'info'|'error'>; intervalMs: number; ratePerSec: number; }
export const syncMembershipOnce = (deps: MembershipSyncDeps): Promise<void>
export const startMembershipSyncLoop = (deps: MembershipSyncDeps): void
export const stopMembershipSyncLoop = (): void
```
`syncMembershipOnce`: pull targets; iterate, calling `getChatMember`; throttle so ≤`ratePerSec` calls/sec (inject `sleep` for tests); on Telegram 429 (`err.parameters.retry_after`) pause that many seconds and continue (NOT a failure); on other errors log `warn` and skip; push snapshot `{telegramId, isMember: MEMBER_STATUSES.has(status), memberStatus: status}`. Use the same member-status set as `delivery.ts`.
- [x] **Step 1: Failing tests** — maps statuses to `isMember`; unknown telegram → not included (API ignores anyway); 429 sets a pause (assert `sleep` called with `retry_after*1000`) and does not reject; a thrown non-429 is logged and the loop continues; rate throttle calls sleeps.
- [x] **Step 2: Run** `npx vitest run src/services/membership-sync.test.ts` (workdir `apps/bot`) → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 18: Bot `member-removal.ts`

**Files:** Create `apps/bot/src/services/member-removal.ts`; Test `...test.ts`.

**Interfaces (produces):**
```ts
export interface MemberRemovalDeps { api: BotApiClient; telegram: Telegraf['telegram']; channelId: string; logger: Pick<Logger,'warn'|'info'|'error'>; intervalMs: number; batchSize: number; }
export const deliverMemberRemovalTask = (task: MemberRemovalTask, deps: MemberRemovalDeps): Promise<void>
export const runMemberRemovalTick = (deps: MemberRemovalDeps): Promise<void>
export const startMemberRemovalLoop = (deps: MemberRemovalDeps): void
export const stopMemberRemovalLoop = (): void
```
`deliverMemberRemovalTask`: `banChatMember(channelId, telegramId)` then `unbanChatMember(channelId, telegramId, { only_if_banned: true })`; treat "user not in chat" / "participant not found" / "user not found" as success; `completeMemberRemoval(id,{outcome:'removed'})`. On error: `completeMemberRemoval(id,{outcome:'failed',error})` (mirrors content loop).
- [x] **Step 1: Failing tests** — mock telegram/api: happy path bans then unbans and confirms `removed`; a thrown "user not in chat" still confirms `removed`; a generic throw confirms `failed` with the message; tick leases batch and processes each.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 19: Bot loop isolation + `index.ts` wiring

**Files:** Modify `apps/bot/src/index.ts`, `apps/bot/src/services/delivery.ts`, `apps/bot/src/services/content-delivery.ts`; Test `apps/bot/src/services/loops.test.ts`.

**Interfaces:** each loop's `setInterval` callback wraps its tick in `try/catch` logging `error`; `index.ts` starts `startMembershipSyncLoop` + `startMemberRemovalLoop` and stops them on shutdown.
- [x] **Step 1: Failing test** — a tick that rejects is caught (spy: no unhandled rejection; `logger.error` called).
- [x] **Step 2: Run** → FAIL. **Step 3: Implement** (wrap each existing loop's tick too). **Step 4: PASS.** **Step 5: Commit (SKIP).**

### Task 20: Docs

**Files:** Modify `docs/context/api-reference.md`, `database-schema.md`, `workflows.md` (#3/#4), `security.md`, `architecture.md`, `README.md`.
- [x] **Step 1:** api-reference: add admin endpoints (with the D4 split) + internal member endpoints.
- [x] **Step 2:** database-schema: `channel_membership`, `member_removals`, `invite_links.revoked_at`, `0010`, immutability trigger, settings keys.
- [x] **Step 3:** workflows #3/#4 mark implemented; note membership-unknown / Bot-API no-enumeration.
- [x] **Step 4:** security: snapshot staleness + roster-audit scope + no-PII notify stub.
- [x] **Step 5:** architecture + README env tables.

### Task 21: Full verification gate

- [x] **Step 1:** `npm run build:shared && npm run lint && npm run typecheck && npm run test && npm run build` → all green.
- [x] **Step 2:** `npm run test:integration --workspace=apps/api` → all green.
- [x] **Step 3:** Confirm `apps/api/dist`, `apps/bot/dist`, `packages/shared/dist` emit.
- [x] **Step 4:** Final report: files changed, verify commands, deviations.

## Self-Review

- **Spec coverage:** §3 → Task 2; §4/§5.4/§5.5 settings → Tasks 7,9; §5.1 users → Tasks 5,10; §5.3 audit logs → 6,11; §5.6 dashboard → 12; §5.7 members + §5.8 roster audit → 13; §5.2 notify → 11; §6 internal + §6.1/6.2 → Tasks 14,15; §7 bot → 16,17,18,19; §8 shared → Task 1; §9 tests → every task; §10 docs → Task 20. All covered.
- **Placeholders:** none (all steps name files, signatures, SQL, and test assertions).
- **Type consistency:** `MemberRemovalTask {id,userId,telegramId,attempts}` used by repo, service, api-client, and bot loop; `ChannelMembership` used by repo/service/entities consistently; `AUDIT_ACTIONS`/`AUDIT_TARGET_TYPES` used by services.
- **Amendment coverage:** audit scope roster-only (T13); reactivate cancel + claim skip (Tasks 4,13); partial unique index (Task 4); settings safe-regex + old/new audit (Tasks 1,9); audit trigger + TRUNCATE (Tasks 2, and `resetTestDatabase`); membership freshness ×3 (Tasks 3, 14); bot throttle/429/ban+unban/loop isolation (Tasks 15,16,17); tests incl. truth table/duplicate/self-admin/trigger/all-roles (Tasks 4,10,13,14).
