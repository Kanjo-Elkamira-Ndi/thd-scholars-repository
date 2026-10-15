# Phase 15 — Miniapp Admin Module & Role Dashboards — Implementation Plan

> **For the implementing engineer (zero prior context):** This plan is self-contained.
> Work top to bottom. Every task is TDD: write the failing test, run it, make it pass,
> run the wider suite, then stop at the **Commit** step (do **not** execute it — see
> "Ground rules"). Exact file paths, SQL, and code are given. Commands assume the repo
> root `/home/alchemy-codes/Desktop/Projects/thd-scholars-repository` unless stated.

Spec of record: `docs/superpowers/specs/2026-10-14-phase15-miniapp-admin-dashboard-design.md`
(referred to below as "the spec" with §-references). When this plan and the spec disagree,
**the spec wins** and you must record a deviation.

---

## 0. Ground rules (read first)

1. **Do NOT run `git commit`, `git add`, `git push`, or create PRs.** "Commit" steps are
   recorded for the human's later use only. This overrides the writing-plans skill's
   "frequent commits" guidance.
2. **Do not stop for approval** between tasks. Implement all tasks, then report.
3. **Fix clearly-broken things** you encounter in touched files; note them in the final report.
4. **Flag conflicts and deviations explicitly** in the final report (list format below).
5. **No comments** in code unless the edited file already contains them.
6. **No new runtime dependencies.** Everything here uses packages already in
   `apps/api/package.json`, `apps/miniapp/package.json`, `packages/shared/package.json`.
7. **Verify commands** (run from repo root, `bash` with `workdir` set):
   - `npm run lint`
   - `npm run typecheck`
   - `npm test --workspace=@thd/shared`
   - `npm test --workspace=@thd/api` (unit; excludes `*.int.test.ts`)
   - `npm run test:integration --workspace=@thd/api`
   - `npm test --workspace=@thd/miniapp`
   - `npm run build`
   Single file: `npx vitest run <path> --workspace=@thd/api`
   Single integration file: `npx vitest run -c vitest.integration.config.ts <path>` (workdir `apps/api`)
8. **Recorded baselines** (Phase 14 final): api unit **24 files / 114 tests**, api integration
   **31 files / 196 tests**, miniapp **28 files / 132 tests**, shared **7 files / 40 tests**.
   Phase 12 initial chunk gzip **227.60 kB**; Phase 14 measured ≈ **238 kB** initial gzip.
   Phase 15 must add **zero new env vars**.

---

## 1. Objective & scope

Phase 15 delivers two things on top of the already-built Phase 10 admin API:

1. **A role-aware dashboard** at `GET /api/dashboard` (replacing the admin-only
   `GET /api/dashboard/stats`) rendered by the miniapp **Home** screen, with a distinct
   view for `scholar`, `faculty`, `registrar`, and `admin`.
2. **The miniapp admin module** — an `/admin` hub with four lazy child routes
   (`users`, `members`, `audit`, `settings`) that consume the Phase 10 backend, plus a
   cancel-safe `ConfirmDialog` pattern and inline result feedback.

The backend admin endpoints from Phase 10 already exist and are **not** rebuilt. The only
backend changes are: replace the dashboard endpoint; add two additive filters to
`GET /api/content`; expand + validate the audit enums; add the supporting repository
aggregates.

### Non-goals (do not build)

- `/requests` join-request review (no `GET /api/registrations` endpoint — spec §12).
- Notifications inbox, job/queue viewer, manual join-request decisions, user create/delete.
- Keyset pagination (audit stays page-based). Phase 16.

---

## 1a. File structure map

Create (new files):

```
packages/shared/src/types/dashboard.ts
packages/shared/src/schemas/audit-logs.test.ts        (exists — extend)
apps/api/src/routes/dashboard-routes.ts
apps/api/src/controllers/dashboard-controller.ts
apps/api/src/services/dashboard.service.int.test.ts   (exists — rewrite)
apps/api/src/repositories/dashboard-aggregates.int.test.ts           (new — covers all 3 repos)
apps/api/src/services/audit-enums.consistency.test.ts                (new)
apps/api/src/controllers/dashboard-controller.test.ts                (new)
apps/api/src/controllers/dashboard.int.test.ts                       (new — HTTP truth table for /api/dashboard)
apps/miniapp/src/hooks/use-dashboard.ts
apps/miniapp/src/hooks/use-dashboard.test.tsx
apps/miniapp/src/hooks/use-admin.ts
apps/miniapp/src/hooks/use-admin.test.tsx
apps/miniapp/src/features/dashboard/DashboardScreen.tsx
apps/miniapp/src/features/dashboard/components/ScholarDashboard.tsx
apps/miniapp/src/features/dashboard/components/FacultyDashboard.tsx
apps/miniapp/src/features/dashboard/components/RegistrarDashboard.tsx
apps/miniapp/src/features/dashboard/components/AdminDashboard.tsx
apps/miniapp/src/features/dashboard/components/StatCard.tsx
apps/miniapp/src/features/dashboard/DashboardScreen.test.tsx
apps/miniapp/src/features/admin/AdminHubScreen.tsx
apps/miniapp/src/features/admin/users/AdminUsersScreen.tsx
apps/miniapp/src/features/admin/users/AdminUsersScreen.test.tsx
apps/miniapp/src/features/admin/members/AdminMembersScreen.tsx
apps/miniapp/src/features/admin/members/AdminMembersScreen.test.tsx
apps/miniapp/src/features/admin/audit/AdminAuditScreen.tsx
apps/miniapp/src/features/admin/audit/AdminAuditScreen.test.tsx
apps/miniapp/src/features/admin/settings/AdminSettingsScreen.tsx
apps/miniapp/src/features/admin/settings/AdminSettingsScreen.test.tsx
apps/miniapp/src/features/admin/AdminHubScreen.test.tsx
```

Modify (existing files):

```
packages/shared/src/constants/audit.ts                 (expand enums)
packages/shared/src/schemas/audit-logs.ts              (enum-validate action/targetType)
packages/shared/src/index.ts                           (export types/dashboard)
apps/api/src/services/content.service.ts               (use audit constants; listContent filters)
apps/api/src/services/registration.service.ts          (use audit constants)
apps/api/src/services/join-request-delivery.service.ts (use audit constants)
apps/api/src/services/roster.service.ts                (use audit constants)
apps/api/src/repositories/content.repository.ts        (mine/deliveryStatus filters + aggregates)
apps/api/src/repositories/roster.repository.ts         (countActiveScholars, countAccessReviewPendingBy)
apps/api/src/repositories/join-requests.repository.ts  (countPendingSince)
apps/api/src/services/dashboard.service.ts             (getDashboard; remove getDashboardStats)
apps/api/src/controllers/admin-config-controller.ts    (remove getDashboardStats)
apps/api/src/controllers/admin.int.test.ts             (drop the /api/dashboard/stats truth-table row)
apps/api/src/controllers/content.int.test.ts          (extend with mine/deliveryStatus cases)
apps/api/src/routes/admin-routes.ts                    (remove /dashboard/stats)
apps/api/src/app.ts                                    (mount dashboard-routes)
apps/api/src/controllers/content-controller.ts         (mine + deliveryStatus in contentQuerySchema)
apps/miniapp/src/lib/api.ts                            (getDashboard + admin fns + content query type)
apps/miniapp/src/lib/api.test.ts                       (extend)
apps/miniapp/src/hooks/use-content.ts                  (invalidate ['dashboard'], mine/deliveryStatus params)
apps/miniapp/src/hooks/use-content.test.tsx            (extend)
apps/miniapp/src/hooks/use-roster.ts                   (invalidate ['dashboard'])
apps/miniapp/src/hooks/use-roster.test.tsx             (extend)
apps/miniapp/src/router/routes.tsx                     (admin routes)
apps/miniapp/src/router/routes.test.ts                 (extend)
apps/miniapp/src/features/home/HomeScreen.tsx          (render DashboardScreen)
apps/miniapp/src/features/home/RoleActions.tsx         (point at /admin/*)
apps/miniapp/src/features/content/ContentScreen.tsx    (read search params)
apps/miniapp/src/features/content/components/ContentFilters.tsx (mine/deliveryStatus controls)
apps/miniapp/src/components/layout/AppHeader.tsx       (nested admin titles)
docs/context/api-reference.md
docs/context/workflows.md
docs/context/security.md
docs/context/file-structure.md
docs/context/ui-context.md
```

---

## Phase A — Shared contracts & audit integrity

### Task 1 — Expand the audit enums and repoint string literals

**Goal:** audit actions/targets become a strict, single-source list; API services stop using
ad-hoc string literals (spec §4.4, D6, amendment 6).

**Files**
- Edit: `packages/shared/src/constants/audit.ts`
- Edit: `packages/shared/src/index.ts` (if enums aren't re-exported — verify)
- Edit: `apps/api/src/services/content.service.ts`
- Edit: `apps/api/src/services/registration.service.ts`
- Edit: `apps/api/src/services/join-request-delivery.service.ts`
- Edit: `apps/api/src/services/roster.service.ts`
- New test: `apps/api/src/services/audit-enums.consistency.test.ts`
- New test: `packages/shared/src/constants/audit.test.ts`

**Step 1 — Read the current file**

Read `packages/shared/src/constants/audit.ts`. It currently reads approximately:

```ts
export const AUDIT_ACTIONS = {
  UPDATE_USER_ROLE: 'update_user_role',
  UPDATE_SETTINGS: 'update_settings',
  MEMBER_REMOVAL_REQUESTED: 'member_removal_requested',
  MEMBER_REMOVAL_FAILED: 'member_removal_failed',
  QUARTERLY_ROSTER_AUDIT: 'quarterly_roster_audit',
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGET_TYPES = {
  USERS: 'users',
  SETTINGS: 'settings',
  MEMBER_REMOVALS: 'member_removals',
  JOBS: 'jobs',
} as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[keyof typeof AUDIT_TARGET_TYPES];
```

**Step 2 — Write the failing shared test**

`packages/shared/src/constants/audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from './audit';

describe('audit enums', () => {
  it('exposes the phase-15 actions', () => {
    expect(Object.values(AUDIT_ACTIONS)).toEqual(
      expect.arrayContaining([
        'update_user_role',
        'update_settings',
        'member_removal_requested',
        'member_removal_failed',
        'quarterly_roster_audit',
        'create_roster_entry',
        'update_roster_status',
        'update_roster_entry',
        'approve_join_request',
        'decline_join_request',
        'join_request_delivery_failed',
        'content_created',
        'content_updated',
        'content_deleted',
        'content_posted',
        'content_delivery_failed',
      ]),
    );
  });

  it('exposes the phase-15 target types', () => {
    expect(Object.values(AUDIT_TARGET_TYPES)).toEqual(
      expect.arrayContaining(['users', 'settings', 'member_removals', 'jobs', 'roster', 'join_requests', 'content_posts']),
    );
  });
});
```

Run: `npm test --workspace=@thd/shared` → fails (missing keys).

**Step 3 — Expand the constants**

Replace `AUDIT_ACTIONS` / `AUDIT_TARGET_TYPES` with the values above. Keep every existing
key; add keys exactly named:

```ts
export const AUDIT_ACTIONS = {
  UPDATE_USER_ROLE: 'update_user_role',
  UPDATE_SETTINGS: 'update_settings',
  MEMBER_REMOVAL_REQUESTED: 'member_removal_requested',
  MEMBER_REMOVAL_FAILED: 'member_removal_failed',
  QUARTERLY_ROSTER_AUDIT: 'quarterly_roster_audit',
  CREATE_ROSTER_ENTRY: 'create_roster_entry',
  UPDATE_ROSTER_STATUS: 'update_roster_status',
  UPDATE_ROSTER_ENTRY: 'update_roster_entry',
  APPROVE_JOIN_REQUEST: 'approve_join_request',
  DECLINE_JOIN_REQUEST: 'decline_join_request',
  JOIN_REQUEST_DELIVERY_FAILED: 'join_request_delivery_failed',
  CONTENT_CREATED: 'content_created',
  CONTENT_UPDATED: 'content_updated',
  CONTENT_DELETED: 'content_deleted',
  CONTENT_POSTED: 'content_posted',
  CONTENT_DELIVERY_FAILED: 'content_delivery_failed',
} as const;

export const AUDIT_TARGET_TYPES = {
  USERS: 'users',
  SETTINGS: 'settings',
  MEMBER_REMOVALS: 'member_removals',
  JOBS: 'jobs',
  ROSTER: 'roster',
  JOIN_REQUESTS: 'join_requests',
  CONTENT_POSTS: 'content_posts',
} as const;
```

**Step 4 — Repoint literals in the API services**

In each file below, import the enum and replace the literal. Examples already confirmed:

- `roster.service.ts` lines 48, 49, 111, 112: `'create_roster_entry'` → `AUDIT_ACTIONS.CREATE_ROSTER_ENTRY`,
  `'roster'` → `AUDIT_TARGET_TYPES.ROSTER`, `'update_roster_status'` / `'update_roster_entry'` → constants.
- `registration.service.ts` (submit): action `approve_join_request` / `decline_join_request`,
  targetType `'join_requests'` → `AUDIT_ACTIONS.APPROVE_JOIN_REQUEST` etc. and
  `AUDIT_TARGET_TYPES.JOIN_REQUESTS`. Note `targetType` currently is `'join_requests'` literal —
  replace. Also there may be a second `join_requests` literal; grep the file for `'join_requests'`.
- `content.service.ts`: replace every `'content_created' | 'content_updated' | 'content_deleted' | 'content_posted'` literal in `insertAuditLog` calls (grep `auditRepo.insertAuditLog` in the file) with the matching `AUDIT_ACTIONS.*`; replace `'content_posts'` target with `AUDIT_TARGET_TYPES.CONTENT_POSTS`.
- `join-request-delivery.service.ts`: `action: 'join_request_delivery_failed'` → `AUDIT_ACTIONS.JOIN_REQUEST_DELIVERY_FAILED`; and any `'content_delivery_failed'` → `AUDIT_ACTIONS.CONTENT_DELIVERY_FAILED` (grep first).

Add `import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@thd/shared';` to each (merge into
the existing `@thd/shared` import). `members.service.ts` and `settings.service.ts` already
use the constants — leave them.

**Step 5 — Write the source-consistency test**

This test scans the API source and asserts that **no** service hard-codes an audit action or
target-type string outside the enum. Empty directories must not throw.

`apps/api/src/services/audit-enums.consistency.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@thd/shared';

const SRC_ROOT = join(__dirname, '..');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts') && !full.endsWith('.int.test.ts')) {
      out.push(full);
    }
  }
  return out;
};

const ACTIONS = new Set<string>(Object.values(AUDIT_ACTIONS));
const TARGETS = new Set<string>(Object.values(AUDIT_TARGET_TYPES));

describe('audit enum consistency (source scan)', () => {
  it('no audit action/target literal is used that is absent from the shared enums', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const source = readFileSync(file, 'utf8');
      const patterns: Array<[RegExp, Set<string>, string]> = [
        [/(?:action|ACTION)\s*[:=]\s*'([a-z_]+)'/g, ACTIONS, 'action'],
        [/(?:targetType|TARGET_TYPE)\s*[:=]\s*'([a-z_]+)'/g, TARGETS, 'targetType'],
      ];
      for (const [regex, allowed, label] of patterns) {
        for (const match of source.matchAll(regex)) {
          const value = match[1];
          if (!allowed.has(value)) {
            offenders.push(`${relative(SRC_ROOT, file)}: ${label} '${value}' not in enum`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

Run: `npx vitest run src/services/audit-enums.consistency.test.ts` (workdir `apps/api`) —
first make Step 4 edits so it passes. If the scan flags a legitimate non-audit literal
(e.g. a `targetType` used for a different purpose), add the value to the enum rather than
loosening the regex.

**Step 6 — Run**

```
npm test --workspace=@thd/shared
npx vitest run src/services/audit-enums.consistency.test.ts   # workdir apps/api
npm run typecheck
```

**Commit** (do not run): `feat(shared,api): expand audit enums and enforce them via source scan`

---

### Task 2 — Validate `auditLogQuerySchema` against the enums

**Goal:** unknown `action` / `targetType` query values return `400`, not an empty page
(spec §4.4).

**Files**
- Edit: `packages/shared/src/schemas/audit-logs.ts`
- Extend: `packages/shared/src/schemas/audit-logs.test.ts`

**Step 1 — Write failing tests**

Append to `packages/shared/src/schemas/audit-logs.test.ts`:

```ts
it('accepts a known action and target type', () => {
  const parsed = auditLogQuerySchema.parse({ action: 'update_settings', targetType: 'settings' });
  expect(parsed.action).toBe('update_settings');
  expect(parsed.targetType).toBe('settings');
});

it('rejects an unknown action', () => {
  expect(auditLogQuerySchema.safeParse({ action: 'not_a_real_action' }).success).toBe(false);
});

it('rejects an unknown target type', () => {
  expect(auditLogQuerySchema.safeParse({ targetType: 'not_real' }).success).toBe(false);
});
```

Run: `npm test --workspace=@thd/shared` → the two reject tests fail.

**Step 2 — Implement**

Read `packages/shared/src/schemas/audit-logs.ts`. Change `action` and `targetType` from
`z.string().optional()` to enum-backed:

```ts
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../constants/audit';

const actionValues = Object.values(AUDIT_ACTIONS) as [string, ...string[]];
const targetTypeValues = Object.values(AUDIT_TARGET_TYPES) as [string, ...string[]];
// ...
action: z.enum(actionValues).optional(),
targetType: z.enum(targetTypeValues).optional(),
```

(Preserve `actorUserId: z.string().uuid().optional()`, `page`/`pageSize` with default 50 and
max 100 exactly as they are.)

**Step 3 — Verify the API returns 400**

Find the admin config controller test (glob `apps/api/src/controllers/admin-*.test.ts`). If a
`getAuditLogs` test exists, add:

```ts
it('rejects an unknown action with VALIDATION_ERROR', async () => {
  await expect(
    getAuditLogs(makeReq({ query: { action: 'bogus' } }), makeRes()),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
});
```

Otherwise the schema test is sufficient at this layer; the route int test in Task 6 exercises
the HTTP path.

**Step 4 — Run**

```
npm test --workspace=@thd/shared
npm run test:integration --workspace=@thd/api   # existing audit int tests must still pass
```

**Commit** (do not run): `feat(shared): validate audit log query filters against enums`

---

### Task 3 — Dashboard payload types; retire `DashboardStats`

**Goal:** introduce the role-discriminated `DashboardPayload` in shared and remove the old
`DashboardStats` type (spec §4.1, §4.2, D1).

**Files**
- New: `packages/shared/src/types/dashboard.ts`
- Edit: `packages/shared/src/index.ts`
- Find/remove: the existing `DashboardStats` declaration.

**Step 1 — Locate the old type**

`DashboardStats` is declared at `packages/shared/src/types/entities.ts:183`. Run
`grep -rn "DashboardStats" apps` to list every consumer; all will be handled in Tasks 5/6
(service + controller) and Task 8 (miniapp `lib/api.ts`).

**Step 2 — Write the new types file**

`packages/shared/src/types/dashboard.ts` (imports come from existing sibling type files —
read `types/entities.ts` for the exact exported names `RosterEntry`, `ContentPost`,
`DisciplineTag`; read `types/enums.ts` for `Role`):

```ts
import type { DisciplineTag, Role } from './enums';
import type { ContentPost, RosterEntry } from './entities';

export interface DashboardActivityItem {
  action: string;
  actorUserId: string | null;
  targetType: string;
  createdAt: string;
}

export interface ContentByDiscipline {
  discipline: DisciplineTag;
  count: number;
}

export interface ScholarDashboard {
  role: 'scholar';
  roster: RosterEntry | null;
  recentContent: ContentPost[];
}

export interface FacultyDashboard {
  role: 'faculty';
  myContentCount: number;
  failedDeliveries: number;
  recentContent: ContentPost[];
}

export interface RegistrarDashboard {
  role: 'registrar';
  totalScholars: number;
  pendingAccessReviews: number;
  myPendingAccessReviews: number;
  rosterAuditIssues: number;
}

export interface AdminDashboard {
  role: 'admin';
  totalScholars: number;
  pendingJoinRequests: number;
  pendingAccessReviews: number;
  contentByDiscipline: ContentByDiscipline[];
  recentActivity: DashboardActivityItem[];
}

export type DashboardPayload =
  | ScholarDashboard
  | FacultyDashboard
  | RegistrarDashboard
  | AdminDashboard;

export type DashboardRole = Role;
```

> Confirmed: `DisciplineTag` and `Role` live in `packages/shared/src/types/enums.ts`;
> `ContentPost` and `RosterEntry` live in `packages/shared/src/types/entities.ts`; all are
> already re-exported from `packages/shared/src/index.ts`.

**Step 3 — Export and remove**

- Add `export * from './types/dashboard';` to `packages/shared/src/index.ts` (match the
  existing export style in that file).
- Delete the `DashboardStats` interface from wherever it lives. Do **not** keep it as a
  deprecated alias (spec §4.2: `DashboardStats` is retired).

**Step 4 — Verify**

`npm run build:shared && npm run typecheck` → expect **compile errors in the consumers you
will fix in Tasks 5/6/8**. That is the point of this task: it proves there are no silent
stragglers. Do not fix them here; note the exact files.

**Commit** (do not run): `feat(shared): add DashboardPayload and retire DashboardStats`

---

## Phase B — Backend

### Task 4 — Repository aggregates and list helpers

**Goal:** add the count/list functions the dashboard service needs (spec §4.1).

**Files**
- Edit: `apps/api/src/repositories/roster.repository.ts`
- Edit: `apps/api/src/repositories/content.repository.ts`
- Edit: `apps/api/src/repositories/join-requests.repository.ts`
- New: `apps/api/src/repositories/dashboard-aggregates.int.test.ts` (one integration file
  covering all three repos keeps setup cheap)

**Notes on conventions:** every function takes `db: Db = pool` as the last arg, returns plain
objects (never rows), and uses `COUNT(*)::text AS count` + `Number(...)` (see
`countAccessReviewPending` at `roster.repository.ts:221` and `countRecentDeclines` at
`join-requests.repository.ts:237`).

**Step 1 — Write failing integration tests**

`apps/api/src/repositories/dashboard-aggregates.int.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertContentPost } from './content.repository';
import { countPendingSince } from './join-requests.repository';
import { countActiveScholars, countAccessReviewPendingBy } from './roster.repository';
import { countByAuthor, countFailedByAuthor, listRecentByAuthor } from './content.repository';

beforeEach(resetTestDatabase);

describe('dashboard aggregates (integration)', () => {
  it('counts only active roster rows as scholars', async () => {
    const a = await createUser(9701, 'scholar');
    const b = await createUser(9702, 'scholar');
    const c = await createUser(9703, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-9701', userId: a.id, status: 'active' });
    await insertRosterRow({ registrationId: 'DIBI-THD-9702', userId: b.id, status: 'graduated' });
    await insertRosterRow({ registrationId: 'DIBI-THD-9703', userId: c.id, status: 'pending' });
    expect(await countActiveScholars()).toBe(1);
  });

  it('counts pending access reviews by the acting user', async () => {
    const admin = await createUser(9704, 'admin');
    const other = await createUser(9705, 'admin');
    const s1 = await createUser(9706, 'scholar');
    const s2 = await createUser(9707, 'scholar');
    await insertRosterRow({
      registrationId: 'DIBI-THD-9706',
      userId: s1.id,
      status: 'graduated',
      accessReviewPending: true,
      updatedBy: admin.id,
    });
    await insertRosterRow({
      registrationId: 'DIBI-THD-9707',
      userId: s2.id,
      status: 'withdrawn',
      accessReviewPending: true,
      updatedBy: other.id,
    });
    expect(await countAccessReviewPendingBy(admin.id)).toBe(1);
  });

  it('counts join requests created since a cutoff', async () => {
    const u = await createUser(9708, 'scholar');
    await pool.query(`INSERT INTO join_requests (user_id, status, created_at) VALUES ($1, 'pending', now())`, [u.id]);
    expect(await countPendingSince(new Date(Date.now() - 1000))).toBe(1);
    expect(await countPendingSince(new Date(Date.now() + 1000))).toBe(0);
  });

  it('counts and lists content by author, excluding soft-deleted', async () => {
    const faculty = await createUser(9709, 'faculty');
    for (let i = 0; i < 3; i += 1) {
      await insertContentPost({
        title: `Post ${i}`,
        disciplineTag: 'SystematicTheology',
        formatTag: 'ebook',
        cohortTag: null,
        postedBy: faculty.id,
        driveLink: null,
        fileSizeBytes: null,
        stagedFileName: null,
        stagedMimeType: null,
        stagedOriginalName: null,
      });
    }
    await pool.query(`UPDATE content_posts SET deleted_at = now() WHERE posted_by = $1 AND title = 'Post 2'`, [faculty.id]);
    await pool.query(`UPDATE content_posts SET delivery_status = 'failed' WHERE posted_by = $1 AND title = 'Post 1'`, [faculty.id]);

    expect(await countByAuthor(faculty.id)).toBe(2);
    expect(await countFailedByAuthor(faculty.id)).toBe(1);
    const recent = await listRecentByAuthor(faculty.id, 10);
    expect(recent).toHaveLength(2);
    expect(recent[0].postedBy).toBe(faculty.id);
  });
});
```

> `insertRosterRow` must accept `updatedBy` — confirm in `apps/api/src/db/testing/fixtures.ts`.
> If it does not, use a raw `UPDATE roster SET updated_by = $1 WHERE id = $2` after insert.

Run: `npm run test:integration --workspace=@thd/api` → import errors (functions missing).

**Step 2 — Implement the repository functions**

Append to `roster.repository.ts`:

```ts
export const countActiveScholars = async (db: Db = pool): Promise<number> => {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM roster r JOIN users u ON u.id = r.user_id
      WHERE r.status = 'active' AND u.role = 'scholar'`,
  );
  return Number(rows[0].count);
};

export const countAccessReviewPendingBy = async (
  updatedBy: string,
  db: Db = pool,
): Promise<number> => {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM roster
      WHERE access_review_pending = true AND updated_by = $1`,
    [updatedBy],
  );
  return Number(rows[0].count);
};
```

Append to `join-requests.repository.ts`:

```ts
export const countPendingSince = async (since: Date, db: Db = pool): Promise<number> => {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM join_requests
      WHERE status = 'pending' AND created_at >= $1`,
    [since],
  );
  return Number(rows[0].count);
};
```

Append to `content.repository.ts` (mirror `listContentPosts`' soft-delete predicate):

```ts
export async function countByAuthor(authorId: string, db: Db = pool): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM content_posts
      WHERE posted_by = $1 AND deleted_at IS NULL`,
    [authorId],
  );
  return Number(rows[0].count);
}

export async function countFailedByAuthor(authorId: string, db: Db = pool): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM content_posts
      WHERE posted_by = $1 AND deleted_at IS NULL AND delivery_status = 'failed'`,
    [authorId],
  );
  return Number(rows[0].count);
}

export async function listRecentByAuthor(
  authorId: string,
  limit: number,
  db: Db = pool,
): Promise<ContentPost[]> {
  const { rows } = await db.query<ContentPostRow>(
    `SELECT ${CONTENT_COLUMNS} FROM content_posts
      WHERE posted_by = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [authorId, limit],
  );
  return rows.map(mapContentRow);
}
```

**Step 3 — Run**

```
npm run test:integration --workspace=@thd/api
npm run typecheck
```

**Commit** (do not run): `feat(api): add dashboard aggregate queries`

---

### Task 5 — `dashboard.service.getDashboard(actor)`

**Goal:** replace `getDashboardStats()` with a role-switching `getDashboard(actor, db)`
returning `DashboardPayload` (spec §4.1, amendments 1–5).

**Files**
- Edit: `apps/api/src/services/dashboard.service.ts`
- Rewrite: `apps/api/src/services/dashboard.service.int.test.ts`

**Step 1 — Rewrite the integration test**

Replace the whole of `dashboard.service.int.test.ts`. Assertions come directly from spec
§4.1/§4.2 and amendments 1, 3, 4, 5.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertAuditLog } from '../repositories/audit-logs.repository';
import { insertContentPost } from '../repositories/content.repository';
import { getDashboard } from './dashboard.service';

beforeEach(resetTestDatabase);

const post = (postedBy: string, title: string) =>
  insertContentPost({
    title,
    disciplineTag: 'SystematicTheology',
    formatTag: 'ebook',
    cohortTag: null,
    postedBy,
    driveLink: null,
    fileSizeBytes: null,
    stagedFileName: null,
    stagedMimeType: null,
    stagedOriginalName: null,
  });

describe('dashboard service (integration)', () => {
  it('admin variant: active scholars, 30-day pending requests, reviews, discipline counts, trimmed activity', async () => {
    const admin = await createUser(9801, 'admin');
    const scholar = await createUser(9802, 'scholar');
    const other = await createUser(9803, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-9802', userId: scholar.id, status: 'graduated', accessReviewPending: true });
    await insertRosterRow({ registrationId: 'DIBI-THD-9803', userId: other.id, status: 'active' });
    await pool.query(`INSERT INTO join_requests (user_id, status) VALUES ($1, 'pending')`, [other.id]);
    // pending but older than 30 days -> excluded
    const stale = await createUser(9804, 'scholar');
    await pool.query(
      `INSERT INTO join_requests (user_id, status, created_at) VALUES ($1, 'pending', now() - interval '40 days')`,
      [stale.id],
    );
    await post(admin.id, 'Lecture 1');
    await post(admin.id, 'Lecture 2');
    await insertAuditLog({ actorUserId: admin.id, action: 'update_settings', targetType: 'settings', targetId: null, details: { secret: 'x' } });

    const payload = await getDashboard({ id: admin.id, role: 'admin' });

    expect(payload.role).toBe('admin');
    if (payload.role !== 'admin') throw new Error('unreachable');
    expect(payload.totalScholars).toBe(1);
    expect(payload.pendingJoinRequests).toBe(1);
    expect(payload.pendingAccessReviews).toBe(1);
    expect(payload.contentByDiscipline).toEqual([{ discipline: 'SystematicTheology', count: 2 }]);
    expect(payload.recentActivity).toHaveLength(1);
    expect(payload.recentActivity[0]).not.toHaveProperty('details');
    expect(Object.keys(payload.recentActivity[0]).sort()).toEqual(
      ['action', 'actorUserId', 'createdAt', 'targetType'].sort(),
    );
  });

  it('scholar variant: roster is the entry, recentContent only when active', async () => {
    const scholar = await createUser(9805, 'scholar');
    const faculty = await createUser(9806, 'faculty');
    await insertRosterRow({ registrationId: 'DIBI-THD-9805', userId: scholar.id, status: 'active' });
    await post(scholar.id, 'My note');
    const active = await getDashboard({ id: scholar.id, role: 'scholar' });
    expect(active.role).toBe('scholar');
    if (active.role !== 'scholar') throw new Error('unreachable');
    expect(active.roster?.status).toBe('active');
    expect(active.recentContent.map((p) => p.title)).toEqual(['My note']);

    // flip to pending -> recentContent must be empty on the next call
    await pool.query(`UPDATE roster SET status = 'pending' WHERE user_id = $1`, [scholar.id]);
    const pending = await getDashboard({ id: scholar.id, role: 'scholar' });
    if (pending.role !== 'scholar') throw new Error('unreachable');
    expect(pending.recentContent).toEqual([]);
    expect(faculty.role).toBe('faculty');
  });

  it('faculty variant: author-scoped counts and recent content', async () => {
    const faculty = await createUser(9807, 'faculty');
    await post(faculty.id, 'A');
    await post(faculty.id, 'B');
    await pool.query(`UPDATE content_posts SET delivery_status = 'failed' WHERE title = 'A'`);
    const payload = await getDashboard({ id: faculty.id, role: 'faculty' });
    if (payload.role !== 'faculty') throw new Error('unreachable');
    expect(payload.myContentCount).toBe(2);
    expect(payload.failedDeliveries).toBe(1);
    expect(payload.recentContent).toHaveLength(2);
  });

  it('registrar variant: totals and own pending reviews', async () => {
    const registrar = await createUser(9808, 'registrar');
    const otherAdmin = await createUser(9809, 'admin');
    const s1 = await createUser(9810, 'scholar');
    const s2 = await createUser(9811, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-9810', userId: s1.id, status: 'graduated', accessReviewPending: true, updatedBy: registrar.id });
    await insertRosterRow({ registrationId: 'DIBI-THD-9811', userId: s2.id, status: 'withdrawn', accessReviewPending: true, updatedBy: otherAdmin.id });
    const payload = await getDashboard({ id: registrar.id, role: 'registrar' });
    if (payload.role !== 'registrar') throw new Error('unreachable');
    expect(payload.pendingAccessReviews).toBe(2);
    expect(payload.myPendingAccessReviews).toBe(1);
    expect(payload.totalScholars).toBe(0);
    expect(typeof payload.rosterAuditIssues).toBe('number');
  });
});
```

Run: `npm run test:integration --workspace=@thd/api` → fails (`getDashboard` missing).

**Step 2 — Implement the service**

Replace `dashboard.service.ts`:

```ts
import type { ContentByDiscipline, DashboardPayload, DisciplineTag, User } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as contentRepo from '../repositories/content.repository';
import * as joinRepo from '../repositories/join-requests.repository';
import * as rosterRepo from '../repositories/roster.repository';

const PENDING_WINDOW_DAYS = 30;
const RECENT_LIMIT = 10;
const SCHOLAR_CONTENT_LIMIT = 10;

export const getDashboard = async (
  actor: Pick<User, 'id' | 'role'>,
  db: Db = pool,
): Promise<DashboardPayload> => {
  switch (actor.role) {
    case 'scholar': {
      const roster = await rosterRepo.getRosterByUserId(actor.id, db);
      const recentContent =
        roster?.status === 'active' ? await contentRepo.listRecentByAuthor(actor.id, SCHOLAR_CONTENT_LIMIT, db) : [];
      return { role: 'scholar', roster, recentContent };
    }
    case 'faculty': {
      const [myContentCount, failedDeliveries, recentContent] = await Promise.all([
        contentRepo.countByAuthor(actor.id, db),
        contentRepo.countFailedByAuthor(actor.id, db),
        contentRepo.listRecentByAuthor(actor.id, RECENT_LIMIT, db),
      ]);
      return { role: 'faculty', myContentCount, failedDeliveries, recentContent };
    }
    case 'registrar': {
      const [totalScholars, pendingAccessReviews, myPendingAccessReviews, auditIssues] =
        await Promise.all([
          rosterRepo.countActiveScholars(db),
          rosterRepo.countAccessReviewPending(db),
          rosterRepo.countAccessReviewPendingBy(actor.id, db),
          rosterRepo.countAccessReviewPending(db),
        ]);
      return {
        role: 'registrar',
        totalScholars,
        pendingAccessReviews,
        myPendingAccessReviews,
        rosterAuditIssues: auditIssues,
      };
    }
    default: {
      const since = new Date(Date.now() - PENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const [totalScholars, pendingJoinRequests, pendingAccessReviews, disciplineRows, recent] =
        await Promise.all([
          rosterRepo.countActiveScholars(db),
          joinRepo.countPendingSince(new Date(since), db),
          rosterRepo.countAccessReviewPending(db),
          db.query<{ discipline_tag: string; count: string }>(
            `SELECT discipline_tag, count(*)::text AS count FROM content_posts
              WHERE deleted_at IS NULL GROUP BY discipline_tag ORDER BY discipline_tag`,
          ),
          auditRepo.listAuditLogs({ page: 1, pageSize: RECENT_LIMIT }, db),
        ]);

      return {
        role: 'admin',
        totalScholars,
        pendingJoinRequests,
        pendingAccessReviews,
        contentByDiscipline: disciplineRows.rows.map(
          (row): ContentByDiscipline => ({
            discipline: row.discipline_tag as DisciplineTag,
            count: Number(row.count),
          }),
        ),
        recentActivity: recent.logs.map((log) => ({
          action: log.action,
          actorUserId: log.actorUserId,
          targetType: log.targetType,
          createdAt: log.createdAt,
        })),
      };
    }
  }
};
```

Notes on the implementation:

- **Scholar roster** uses the existing `rosterRepo.getRosterByUserId(actor.id, db)`
  (`roster.repository.ts:53`), which returns the user's newest roster row regardless of
  status. `recentContent` is computed **only** when `roster?.status === 'active'`, re-read
  from the DB on every call (amendment 1).
- **Request-user type:** there is no `Actor` export; `req.user` is a `User`, hence
  `actor: Pick<User, 'id' | 'role'>`.
- `countAccessReviewPendingBy` backs `myPendingAccessReviews` (amendment 3).

- **`rosterAuditIssues`.** Use `rosterRepo.countAccessReviewPending` (global pending) — the
  current definition of a roster audit issue. Record this as a deviation only if the spec's
  §6 expected a different definition; the spec pins the field but not a distinct query.

**Step 3 — Run**

```
npm run test:integration --workspace=@thd/api
npm run typecheck
```

**Commit** (do not run): `feat(api): add role-aware dashboard service`

---

### Task 6 — Route `GET /api/dashboard`; delete `/api/dashboard/stats`

**Goal:** expose the dashboard behind `authUser`, remove the admin-only stats route
(spec §4.1, D1, D2).

**Files**
- New: `apps/api/src/controllers/dashboard-controller.ts`
- New: `apps/api/src/routes/dashboard-routes.ts`
- Edit: `apps/api/src/app.ts`
- Edit: `apps/api/src/routes/admin-routes.ts`
- Edit: `apps/api/src/controllers/admin-config-controller.ts`
- New test: `apps/api/src/controllers/dashboard-controller.test.ts`
- New test: `apps/api/src/controllers/dashboard.int.test.ts`
- Edit test: `apps/api/src/controllers/admin.int.test.ts` (remove the
  `['get', '/api/dashboard/stats']` row from the `adminOnly` truth table)

**Step 1 — Write the controller unit test**

`apps/api/src/controllers/dashboard-controller.test.ts` (model on
`content-controller.test.ts`):

```ts
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDashboard: vi.fn() }));
vi.mock('../services/dashboard.service', () => ({ getDashboard: mocks.getDashboard }));

import { getDashboard } from './dashboard-controller';

const makeRes = () => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res as unknown as Response;
};

beforeEach(() => vi.clearAllMocks());

describe('getDashboard controller', () => {
  it('returns the payload with the request user role, ignoring query and body', async () => {
    const payload = { role: 'scholar', roster: null, recentContent: [] };
    mocks.getDashboard.mockResolvedValue(payload);
    const req = {
      user: { id: 'u1', role: 'scholar' },
      query: { role: 'admin' },
      body: { role: 'admin' },
      header: () => undefined,
    } as unknown as Request;
    const res = makeRes();

    await getDashboard(req, res);

    expect(mocks.getDashboard).toHaveBeenCalledWith({ id: 'u1', role: 'scholar' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ dashboard: payload });
  });

  it('401s without a user', async () => {
    await expect(
      getDashboard({ user: undefined } as unknown as Request, makeRes()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });
});
```

**Step 2 — Controller**

`dashboard-controller.ts`:

```ts
import type { Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { getDashboard as getDashboardPayload } from '../services/dashboard.service';

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const payload = await getDashboardPayload({ id: req.user.id, role: req.user.role });
  res.status(200).json({ dashboard: payload });
};
```

**Step 3 — Route + mount**

`routes/dashboard-routes.ts`:

```ts
import { Router } from 'express';
import { getDashboard } from '../controllers/dashboard-controller';
import { asyncHandler } from '../middleware/async-handler';
import { authUser } from '../middleware/auth-user';

const router = Router();

router.get('/', authUser, asyncHandler(getDashboard));

export default router;
```

> Confirm the auth middleware's export name in `apps/api/src/middleware/` (grep
> `authUser`). `app.ts` already imports it.

Edit `app.ts` to add, **before** `adminRoutes`:

```ts
import dashboardRoutes from './routes/dashboard-routes';
// ...
app.use('/api/dashboard', dashboardRoutes);
```

(Keep `app.use('/api/admin', adminRoutes)` where it is; the dashboard path is separate.)

**Step 4 — Delete the old route**

- `admin-routes.ts`: remove the `router.get('/dashboard/stats', ...)` line and the
  `getDashboardStats` import.
- `admin-config-controller.ts`: delete the `getDashboardStats` export and any now-unused
  imports.

**Step 5 — Write the integration test**

`apps/api/src/controllers/dashboard.int.test.ts` — copy the harness from the top of
`apps/api/src/controllers/admin.int.test.ts` (it already has `auth(telegramId)` via
`signInitData`, `resetTestDatabase`, and `createUser`). The test must cover:

```ts
// pseudocode — use the repository's real seeding helper / token strategy
it('returns a scholar payload for a scholar token', ...);
it('returns an admin payload for an admin token', ...);
it('returns a registrar payload for a registrar token', ...);
it('returns a faculty payload for a faculty token', ...);
it('ignores a role query/body override from a scholar', async () => {
  // GET /api/dashboard?role=admin with a scholar token -> response.dashboard.role === 'scholar'
});
it('404s the removed /api/admin/dashboard/stats for an admin', ...);
it('401s without a token', ...);
```

For the role-override test, send `?role=admin` and a JSON body `{ role: 'admin' }` (the route
ignores both — controller only reads `req.user`).

Run: `npm run test:integration --workspace=@thd/api`.

**Step 6 — Run**

```
npx vitest run src/controllers/dashboard-controller.test.ts   # workdir apps/api
npm run test:integration --workspace=@thd/api
npm run typecheck
```

Also grep for any remaining `getDashboardStats` / `dashboard/stats` references
(`grep -rn "dashboard/stats\|getDashboardStats" apps packages`) and resolve them. The admin
miniapp Home (Task 12) will move to the new endpoint.

**Commit** (do not run): `feat(api): add role-aware /api/dashboard and remove /dashboard/stats`

---

### Task 7 — `GET /api/content` gains `mine` and `deliveryStatus`

**Goal:** support deep links `/content?mine=true&deliveryStatus=failed` (spec §4.3). Additive
only; existing callers unaffected.

**Files**
- Edit: `apps/api/src/controllers/content-controller.ts` (`contentQuerySchema` at line 24)
- Edit: `apps/api/src/services/content.service.ts` (`listContent`)
- Edit: `apps/api/src/repositories/content.repository.ts` (`ContentListFilters` + `listContentPosts`)
- Extend: `apps/api/src/controllers/content.int.test.ts` (existing HTTP content tests)

**Step 1 — Read `listContent` in `content.service.ts`**

`grep -n "listContent" apps/api/src/services/content.service.ts` and read the function. It
currently forwards the controller's filter object to `contentRepo.listContentPosts`. It must
gain `authorId?: string` and `deliveryStatus?: ContentPost['deliveryStatus']` and forward both.

**Step 2 — Write failing integration tests**

Add to `apps/api/src/controllers/content.int.test.ts`. It already seeds `facultyId`,
`otherFacultyTg`, `scholarId` and has `auth()`. Cases:

```ts
it('mine=true returns only the caller’s posts', ...);
it('mine=true excludes other authors’ posts', ...);
it('deliveryStatus=failed returns only failed deliveries for the caller', ...);
it('rejects an unknown deliveryStatus with 400', ...);
it('leaves existing discipline/format/cohort/search behaviour unchanged', ...);
```

Seed via `insertContentPost` + raw `UPDATE content_posts SET posted_by = ...` as needed
(fixtures create content for a single author).

Run → fails.

**Step 3 — Schema (controller)**

```ts
const contentQuerySchema = z.object({
  discipline: z.enum(DISCIPLINE_TAGS).optional(),
  format: z.enum(CONTENT_FORMATS).optional(),
  cohortYear: z.coerce.number().int().min(1900).max(2100).optional(),
  search: z.string().trim().min(1).optional(),
  mine: booleanQuerySchema.optional(),
  deliveryStatus: z.enum(['pending', 'processing', 'posted', 'failed']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
```

- `booleanQuerySchema` — import from `@thd/shared` (`schemas/common.ts`). It maps
  `'true' | 'false' | boolean` → boolean.
- There is no `CONTENT_DELIVERY_STATUSES` constant — `ContentDeliveryStatus` is a union type
  in `types/enums.ts`. Inline the four literals above (matching that union exactly).

In `getContent`, pass through:

```ts
authorId: query.mine ? req.user?.id : undefined,
deliveryStatus: query.deliveryStatus,
```

The `/api/content` route is mounted **behind auth** (see `apps/api/src/app.ts` and the 401
assertions in `content.int.test.ts`), so `req.user` is present for `mine=true`. Still guard
defensively if `req.user` is absent.

**Step 4 — Repository**

```ts
export interface ContentListFilters {
  disciplineTag?: ContentPost['disciplineTag'];
  formatTag?: ContentPost['formatTag'];
  cohortYear?: number;
  search?: string;
  authorId?: string;
  deliveryStatus?: ContentPost['deliveryStatus'];
  page: number;
  pageSize: number;
}
```

In `listContentPosts`, after the existing conditions:

```ts
if (filters.authorId) {
  values.push(filters.authorId);
  conditions.push(`posted_by = $${values.length}`);
}
if (filters.deliveryStatus) {
  values.push(filters.deliveryStatus);
  conditions.push(`delivery_status = $${values.length}`);
}
```

**Step 4 — Run**

```
npm run test:integration --workspace=@thd/api
npm run typecheck
```

**Commit** (do not run): `feat(api): add mine and deliveryStatus filters to content list`

---

## Phase C — Miniapp data layer

### Task 8 — `lib/api.ts`: dashboard + admin functions

**Goal:** the miniapp can call every Phase 15 endpoint (spec §5.1).

**Files**
- Edit: `apps/miniapp/src/lib/api.ts`
- Extend: `apps/miniapp/src/lib/api.test.ts`

**Step 1 — Read `lib/api.ts`**

Note its shape: a `request`/`fetch` helper, an error type (likely `ApiError` with
`status`/`code`), and `removeMember` as the only Phase 10 call. Follow the same pattern for
every new function. Payload envelope names are fixed by the controllers:
`{ dashboard }`, `{ users }`, `{ user }`, `{ members }`, `{ removal, created }`, settings
object, audit `{ logs, page, pageSize, total }`.

**Step 2 — Write failing tests**

Extend `apps/miniapp/src/lib/api.test.ts` (model on the existing mock-fetch pattern there).
Cover each new function's method, URL, body, and return shape:

```ts
it('getDashboard GETs /api/dashboard and returns the payload', ...);
it('listUsers GETs /api/admin/users', ...);
it('updateUserRole PATCHes /api/admin/users/:id/role with { role }', ...);
it('listAuditLogs GETs /api/admin/audit-logs with query params', ...);
it('getSettings GETs /api/admin/settings', ...);
it('updateSettings PATCHes /api/admin/settings with only the given fields', ...);
it('listMembers GETs /api/admin/members', ...);
```

Run: `npm test --workspace=@thd/miniapp` → fails.

**Step 3 — Implement**

Add to `lib/api.ts` (adapt to the file's existing fetch helper and generic patterns):

```ts
import type {
  AuditLog,
  DashboardPayload,
  MemberSummary,
  Role,
  SystemSettings,
  User,
} from '@thd/shared';

export interface AuditLogQuery {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
}

export interface ContentListQuery {
  discipline?: string;
  format?: string;
  cohortYear?: number;
  search?: string;
  mine?: boolean;
  deliveryStatus?: string;
  page?: number;
  pageSize?: number;
}

export const getDashboard = (): Promise<DashboardPayload> =>
  request<{ dashboard: DashboardPayload }>('/api/dashboard').then((r) => r.dashboard);

export const listUsers = (): Promise<User[]> =>
  request<{ users: User[] }>('/api/admin/users').then((r) => r.users);

export const updateUserRole = (id: string, role: Role): Promise<User> =>
  request<{ user: User }>(`/api/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  }).then((r) => r.user);

export const listAuditLogs = (
  query: AuditLogQuery = {},
): Promise<{ logs: AuditLog[]; total: number; page: number; pageSize: number }> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return request(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
};

export const getSettings = (): Promise<SystemSettings> =>
  request<{ settings: SystemSettings }>('/api/admin/settings').then((r) => r.settings);

export const updateSettings = (patch: Partial<SystemSettings>): Promise<SystemSettings> =>
  request<{ settings: SystemSettings }>('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then((r) => r.settings);

export const listMembers = (): Promise<MemberSummary[]> =>
  request<{ members: MemberSummary[] }>('/api/admin/members').then((r) => r.members);
```

**Verify the response envelopes against the controllers before finalising** — the spec pins
them, but read `admin-config-controller.ts`, `admin-users-controller.ts`,
`admin-members-controller.ts` and match exactly (the summary records `{settings}` for GET
settings; if GET returns the settings object unwrapped, adjust the `.then`). `listContent`
must also gain the `mine`/`deliveryStatus` query params — update its query type to
`ContentListQuery` and its URL builder to include them.

**Step 4 — Run**

```
npm test --workspace=@thd/miniapp
npm run typecheck
```

**Commit** (do not run): `feat(miniapp): add dashboard and admin API client functions`

---

### Task 8.5 — Query keys

**Goal:** one dashboard query key, and an admin key family (spec §5.2, §5.3, amendment 7).

**Files**
- New: `apps/miniapp/src/lib/query-keys.ts` (or add to `query-client.ts` if that is where
  `lib/api.ts` neighbouring keys live — check first)

If the repo already has a `queryKeys` convention, extend it. Otherwise add:

```ts
export const dashboardKeys = {
  all: ['dashboard'] as const,
};

export const adminKeys = {
  users: ['admin', 'users'] as const,
  auditLogs: (query: Record<string, unknown>) => ['admin', 'audit-logs', query] as const,
  members: ['admin', 'members'] as const,
  settings: ['admin', 'settings'] as const,
};
```

Note the rename `['dashboard','stats']` → `['dashboard']` (amendment 7).

**Commit** (do not run): `feat(miniapp): add dashboard and admin query keys`

---

### Task 8b — `use-dashboard` and `use-admin` hooks

**Goal:** typed hooks over the new API fns (spec §5.1, §5.2).

**Files**
- New: `apps/miniapp/src/hooks/use-dashboard.ts`
- New: `apps/miniapp/src/hooks/use-dashboard.test.tsx`
- New: `apps/miniapp/src/hooks/use-admin.ts`
- New: `apps/miniapp/src/hooks/use-admin.test.tsx`

**Step 1 — Read the hook conventions**

Read `apps/miniapp/src/hooks/use-content.ts` and `use-roster.ts`. Match their shape exactly:
`useQuery({ queryKey, queryFn })`, and mutation hooks with `useMutation({...})` +
`queryClient.invalidateQueries`. Tests use `renderWithProviders` from `src/test/render.tsx`
and `waitFor`.

**Step 2 — Write failing hook tests**

`use-dashboard.test.tsx`:

```tsx
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { useDashboard } from './use-dashboard';

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  getDashboard: vi.fn().mockResolvedValue({ role: 'admin', totalScholars: 0 } as never),
}));

const Probe = () => {
  const { data, isPending } = useDashboard();
  if (isPending) return <span>loading</span>;
  return <span>{data?.role}</span>;
};

describe('useDashboard', () => {
  it('loads the payload', async () => {
    const { findByText } = renderWithProviders(<Probe />);
    expect(await findByText('admin')).toBeInTheDocument();
  });
});
```

`use-admin.test.tsx`: cover `useUsers`, `useUpdateUserRole`, `useAuditLogs(query)`,
`useMembers`, `useSettings`, `useUpdateSettings`, and that the mutations invalidate the
matching keys (`queryClient.invalidateQueries` spied). Assert the role mutation invalidates
`['admin','users']`, `['admin','members']`, and `['dashboard']` (spec §5.3).

**Step 3 — Implement**

`use-dashboard.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '../lib/api';
import { dashboardKeys } from '../lib/query-keys';

export const useDashboard = () =>
  useQuery({ queryKey: dashboardKeys.all, queryFn: getDashboard });
```

`use-admin.ts` — one query hook per resource plus mutations, each invalidating per the §5.3
matrix. Implement the matrix literally (this is the source of truth for Task 11):

| Mutation | Invalidates |
|---|---|
| `updateUserRole` | `['admin','users']`, `['admin','members']`, `['dashboard']` |
| `removeMember` (reuse existing) | `['admin','members']`, `['admin','audit-logs']`, `['dashboard']` |
| roster status change (existing roster hook) | `['roster']`, `['dashboard']` |
| content create/edit/delete (existing) | `['content']`, `['dashboard']` |
| `updateSettings` | `['admin','settings']`, `['dashboard']` |

**Step 4 — Run**

```
npx vitest run src/hooks/use-dashboard.test.tsx src/hooks/use-admin.test.tsx   # workdir apps/miniapp
npm run typecheck
```

**Commit** (do not run): `feat(miniapp): add dashboard and admin data hooks`

---

### Task 9 — Invalidation matrix on existing hooks

**Goal:** every mutation that changes dashboard inputs re-fetches `['dashboard']`
(spec §5.3, amendments 5 & 7).

**Files**
- Edit: `apps/miniapp/src/hooks/use-content.ts` (`invalidateContentData`, lines ~53–56)
- Edit: `apps/miniapp/src/hooks/use-content.test.tsx`
- Edit: `apps/miniapp/src/hooks/use-roster.ts` (line ~38)
- Edit: `apps/miniapp/src/hooks/use-roster.test.tsx`

**Steps**
1. Update the failing tests to assert `['dashboard']` is invalidated after a content
   create/edit/delete and after a roster status change, and that `['dashboard','stats']` is
   no longer used anywhere.
2. Replace `invalidateQueries({ queryKey: ['dashboard','stats'] })` with
   `invalidateQueries({ queryKey: dashboardKeys.all })` in both hooks (import the key).
3. Run `npm test --workspace=@thd/miniapp` and `grep -rn "dashboard','stats" apps/miniapp/src`
   (expect no matches).

**Commit** (do not run): `refactor(miniapp): dashboard invalidation uses the shared dashboard key`

---

## Phase C — UI

> For all UI tasks: read the closest existing screen test first (e.g.
> `features/content/ContentScreen.test.tsx`, `features/roster/RosterScreen.tsx`) and mirror
> its structure. Use only design tokens (`components/ui`, Tailwind classes already in the
> project). Every interactive element ≥ 44px. No `dangerouslySetInnerHTML`.

### Task 10 — Dashboard feature

**Goal:** role-specific Home dashboard (spec §6, amendments 1–4, D3, D12).

**Files**
- New: `features/dashboard/DashboardScreen.tsx`
- New: `features/dashboard/components/{StatCard,ScholarDashboard,FacultyDashboard,RegistrarDashboard,AdminDashboard}.tsx`
- New: `features/dashboard/DashboardScreen.test.tsx`
- Edit: `features/home/HomeScreen.tsx`
- Edit: `features/home/RoleActions.tsx`

**Behaviour**
- `DashboardScreen` calls `useDashboard()`. While pending: skeleton (`LoadingSkeletons`).
  On error: `ErrorState` with retry. Then it switches on `payload.role`.
- **ScholarDashboard:** if `roster` is null → empty state ("Your registration is not linked
  yet"). Show status pill + registration id + cohort. If `status !== 'active'`, hide the
  content list and show the status-appropriate note ("Access pending review" /
  "Access ended"); `recentContent` is `[]` in that case anyway. Active → list up to 10 posts
  linking to `/content/:id`.
- **FacultyDashboard:** two stat cards (`myContentCount`, `failedDeliveries`) — failed links
  to `/content?mine=true&deliveryStatus=failed`; plus recent content (≤10).
- **RegistrarDashboard:** cards `totalScholars`, `pendingAccessReviews`, `myPendingAccessReviews`
  (link `/admin/members`), `rosterAuditIssues` (link `/admin/members`).
- **AdminDashboard:** cards `totalScholars` (→ `/admin/members`), `pendingJoinRequests`
  (label "Pending requests · last 30 days"), `pendingAccessReviews` (→ `/admin/members`);
  `contentByDiscipline` as a small list/bars; `recentActivity` (≤10) using **only**
  `action`, `actorUserId`, `targetType`, `createdAt` — never `details`, never PII.
- `HomeScreen.tsx` renders `<DashboardScreen />` (replacing the Phase 12 home body).
- `RoleActions.tsx`: change the `NAV` `Record<Role, string[]>` so admin links point at
  `/admin`, `/admin/users`, `/admin/members`, `/admin/audit`, `admin/settings` (do **not**
  surface these in the bottom tab bar — `navItemsForRole` caps at 5 and excludes them).

**Steps**
1. Write `DashboardScreen.test.tsx` with one test per role (mock `../lib/api`'s
  `getDashboard`), asserting the role-specific cards, the `role`-override is never sent, and
  that `details` never renders. Include the scholar-active vs scholar-pending cases.
2. Implement components. Run `npx vitest run src/features/dashboard` (workdir `apps/miniapp`).
3. Run `npm run lint` (root) — a11y rules are strict; use real `<button>`/`<a>`.

**Commit** (do not run): `feat(miniapp): role-aware dashboard home`

---

### Task 11 — Admin routes + hub

**Goal:** `/admin` hub + 4 lazy children; retire `/members`, `/audit`, `/settings`
(spec §7.1, D4).

**Files**
- Edit: `apps/miniapp/src/router/routes.tsx`
- Edit: `apps/miniapp/src/router/routes.test.ts`
- New: `features/admin/AdminHubScreen.tsx`
- New: `features/admin/AdminHubScreen.test.tsx`
- Edit: `components/layout/AppHeader.tsx` (nested titles)
- Edit: `features/home/RoleActions.tsx` if not already done

**Steps**
1. Add routes (lazy): `/admin` → `AdminHubScreen`, `/admin/users` → `AdminUsersScreen`,
   `/admin/members` → `AdminMembersScreen`, `/admin/audit` → `AdminAuditScreen`,
   `/admin/settings` → `AdminSettingsScreen`. Wrap in `RequireRole roles={['admin','registrar']}`
   (members/audit allow registrar; settings/users are admin-only — gate per-route with
   `RequireRole` as appropriate).
2. Remove `/members`, `/audit`, `/settings` route entries; keep `/requests` as placeholder.
3. `AdminHubScreen` = four large tap-target cards with descriptions + links. Registrar sees
   only members + audit cards.
4. `AppHeader.tsx`: resolve titles for nested `/admin/*` paths (mirror how it resolves
   existing titles; do not import the lazy screens into the header).
5. Update `routes.test.ts` and `AdminHubScreen.test.tsx`: routes resolve, 5 admin paths
   present, old paths gone, registrar filtered.
6. Run `npm test --workspace=@thd/miniapp` and `npm run lint`.

**Commit** (do not run): `feat(miniapp): add /admin hub and lazy admin routes`

---

### Task 11b — Admin users

**Goal:** list users, change role behind a confirm, inline errors (spec §7.2).

**Files**: `features/admin/users/AdminUsersScreen.tsx` + `.test.tsx`

**Behaviour**
- `useUsers()`. Table/list: name, telegram id, role badge, joined date.
- Role change opens `ConfirmDialog`. On confirm → `useUpdateUserRole`. Client guard: cannot
  change your own role; cannot demote the last admin (derive from the loaded list).
  Server `409`/`400`/`403` → inline error under the row (no toast lib).
- Loading skeleton, `ErrorState`, empty state.

**Tests:** render list; confirm flow calls mutation; self-change blocked; last-admin blocked;
`409` surfaces inline. Run miniapp tests + lint.

**Commit** (do not run): `feat(miniapp): admin users screen`

---

### Task 11c — Admin members & removals

**Goal:** reuse `/api/members` + `/roster/audit` (spec §7.3).

**Files**: `features/admin/members/AdminMembersScreen.tsx` + `.test.tsx`

**Behaviour**
- `useMembers()` + the existing roster-audit hook. Show scholar + roster status, `checkedAt`
  as relative time.
- Remove action → `ConfirmDialog` → existing `removeMember` mutation. `202` → inline
  "Removal queued" (uses the `{removal,created}` envelope).

**Tests:** list, relative time, confirm → 202 → queued copy, error path. Run + lint.

**Commit** (do not run): `feat(miniapp): admin members screen`

---

### Task 11d — Admin audit viewer

**Goal:** filter + paginate audit logs safely (spec §7.4).

**Files**: `features/admin/audit/AdminAuditScreen.tsx` + `.test.tsx`

**Behaviour**
- `useAuditLogs(query)` with `FilterBar`/`FilterSelect`, stable append keyed by log `id`
  with de-dupe on page change, locale timestamps.
- `details` rendered from an allow-list of known keys only; unknown keys omitted; string
  values escaped by React (never `dangerouslySetInnerHTML`).

**Tests:** filter change refetches; append de-dupes; unknown `details` key hidden. Run + lint.

**Commit** (do not run): `feat(miniapp): admin audit log viewer`

---

### Task 11e — Admin settings editor

**Goal:** edit the 5 settings with pattern-change confirm (spec §7.5).

**Files**: `features/admin/settings/AdminSettingsScreen.tsx` + `.test.tsx`

**Behaviour**
- Load via `useSettings`; local form state for all 5 fields. Submit sends **only changed
  fields** via `useUpdateSettings`.
- Changing the registration-id pattern opens `ConfirmDialog` first.
- "Test a registration id" input runs live validation using the shared registration schema
  (`createRosterCreateSchema(pattern)` or the pattern rule) — import from `@thd/shared`.

**Tests:** only-changed-fields payload; pattern confirm; live id check pass/fail. Run + lint.

**Commit** (do not run): `feat(miniapp): admin settings editor`

---

### Task 11f — Content deep-link filters

**Goal:** `/content?mine=true&deliveryStatus=failed` works (spec §4.3, §6).

**Files**: `features/content/ContentScreen.tsx`, `features/content/components/ContentFilters.tsx`, `ContentScreen.test.tsx`

**Behaviour**
- `ContentScreen` reads `mine` + `deliveryStatus` from `useSearchParams` and seeds
  `useContent({...})`.
- `ContentFilters` renders a "Only mine" toggle (faculty/admin) and a delivery-status select.
- Changing a filter writes back to the URL (replace, no history spam) and refetches.

**Tests:** URL params seed the query; toggling updates the request; unknown `deliveryStatus`
is ignored client-side. Run + lint.

**Commit** (do not run): `feat(miniapp): content filters honour mine and deliveryStatus deep links`

---

### Task 12 — Cross-cutting: BackButton, privacy, a11y

**Goal:** Telegram BackButton closes sheets/dialogs before navigating; no PII leaks
(spec §8, D10/D10b).

**Steps**
1. Verify `components/shared/ConfirmDialog.tsx` and any Sheet/Drawer bind `useBackButton` to
   close-first, and only navigate when nothing is open. Add coverage in the relevant test.
2. Grep the new screens for `telegramId`, `full_name`, `registrationId` in URL/search params,
   `localStorage`, `sessionStorage`, and `console.` — only the namespaced, non-PII uses
   allowed by the spec may remain. Add a test asserting the dashboard renders no raw
   `telegramId`/`full_name`.
3. Run the full miniapp suite + `npm run lint`.

**Commit** (do not run): `fix(miniapp): back-button closes overlays first; privacy hardening`

---

### Task 13 — Design review gate (D12)

**Goal:** the dashboard does not read as a template (spec §6, D12).

**Steps**
1. Invoke the **ui-ux-pro-max** skill for a review of the dashboard markup/screens; optionally
   use **21st.dev** (`search`/`search_picker`) for card inspiration only (no code copied
   verbatim, no new dependency).
2. Apply the resulting polish (spacing, hierarchy, empty states, focus visibility) as
   minimal diffs.
3. Re-run the full miniapp suite + `npm run lint` + `npm run typecheck`. Record what changed.

**Commit** (do not run): `polish(miniapp): dashboard visual refinement from design review`

---

## Phase D — Docs, verification, report

### Task 14 — Docs

**Files**
- `docs/context/api-reference.md`: replace `GET /api/dashboard/stats` with
  `GET /api/dashboard` (four role variants, response envelopes); document `mine` +
  `deliveryStatus` on `GET /api/content`; note the expanded audit enums and the new `400`
  behaviour. **Remove the non-existent `GET /api/registrations/:id` line at line ~32** (it
  documented an endpoint that was never built).
- `docs/context/workflows.md`: add the admin flows (role change, removal, audit review,
  settings change) and the dashboard-per-role flow.
- `docs/context/security.md`: note no-PII-in-URLs/logs and the audit `details` allow-list.
- `docs/context/file-structure.md`: add `features/dashboard/`, `features/admin/*`,
  `packages/shared/src/types/dashboard.ts`.
- `docs/context/ui-context.md`: dashboard/admin components.

**Commit** (do not run): `docs: phase 15 dashboard and admin module`

---

### Task 15 — Full verification

Run, in order, and capture real output:

```
npm run lint
npm run typecheck
npm test --workspace=@thd/shared
npm test --workspace=@thd/api
npm run test:integration --workspace=@thd/api
npm test --workspace=@thd/miniapp
npm run build
```

Then the chunk-size step:

```
npm run build --workspace=@thd/miniapp
```

Capture the per-route gzip table from the build output; report the initial chunk gzip vs the
Phase 14 baseline (~238 kB) and the Phase 12 budget (227.60 kB gzip). If a lazy admin route
exceeds the budget, note it as a deviation with the measured number (do not silently ship).

Expected new totals (minimums): shared +2 tests, api unit +~7 tests + 1 file, api integration
+~20 tests, miniapp +~5 hook/screen files. Any number **below** the pre-Phase-15 baseline is a
regression — investigate before reporting.

### Task 16 — Final report

Deliver, in chat, a report with these sections:

1. **Files changed** — grouped (shared / api / miniapp / docs).
2. **Verification** — the exact commands run and their real results (test file/test counts,
  build time, chunk gz sizes).
2. **Deviations** (expected, confirm or amend): `DashboardStats` retired;
   `DashboardStats` tests rewritten against the admin variant of `GET /api/dashboard`; audit
   `details` allow-list hides unknown keys; audit paging page-based (not keyset);
   `GET /api/members` stays unpaginated (whole cohort incl. `telegramId`);
   `myPendingAccessReviews` keys off `updated_by`; client self/last-admin guards are UX-only.
   Plus any new conflicts found.
3. **Follow-ups / not done:** anything in non-goals; anything the review flagged but did not change.
4. Do **not** commit.

---

## Deviations to expect / record (spec §13)

1. `DashboardStats` type retired; admin aggregate fields live on `AdminDashboard`.
2. Phase 10 dashboard stats tests are rewritten against the `admin` variant of
   `GET /api/dashboard`.
3. Audit `details` rendering uses a client-side allow-list; unknown keys are hidden.
3. Audit paging stays page-based (not keyset).
4. `GET /api/members` stays unpaginated and returns the whole cohort incl. `telegramId`.
5. `myPendingAccessReviews` keys off `updated_by`, so an admin-edited flag is no longer "the
   registrar's".
6. Client self/last-admin guards are UX affordances, not security boundaries.
