# Phase 15 — Role Dashboards & Admin (Mini App) — Design Spec

Date: 2026-10-14
Status: Approved (design reviewed; 7 amendments folded in) — ready to plan
Depends on: Phases 10–14 (admin/members/audit/settings API, roster-audit, Mini App foundation, roster + content features)

## 1. Goal

Replace the last four designed placeholders and make Home role-aware:

- **Dashboard** (`/`, all roles): `HomeScreen` becomes a role-aware dashboard driven by a single **role-discriminated** payload — Scholar, Faculty, Registrar and Admin each get exactly the variant they need, with cards that deep-link to the relevant filtered screen.
- **Admin hub** (`/admin`, Admin): a small launcher for the admin surfaces, with lazy deep routes:
  - **Users & roles** (`/admin/users`) — change a user's role, behind a confirm step, honouring self-change and last-admin guards.
  - **Members** (`/admin/members`) — cross-reference roster status against observed channel membership, and queue a confirmed removal.
  - **Audit log** (`/admin/audit`) — filterable, stable-paged viewer with humanised actions and safe `details` rendering.
  - **Settings** (`/admin/settings`) — typed editor for all five `SystemSettings` fields, with live regex validation and a pattern-change confirm.

The API gains one endpoint that replaces an admin-only one and two additive filters; everything else Admin already exists (Phase 10) and is reused as-is.

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| D1 | **Role-aware dashboard endpoint.** `GET /api/dashboard` replaces the admin-only `GET /api/dashboard/stats`. The response is a **role-discriminated union**; a consumer cannot see another role's shape. |
| D2 | **Server decides the role.** The variant is chosen only from the authenticated DB role; query/body/headers are ignored. |
| D3 | **Home is the dashboard.** No separate `/dashboard` route; `HomeScreen` renders the role panel + `RoleActions`. |
| D4 | **Admin hub, not a mega-screen.** One `/admin` hub route (in the nav) plus four lazy deep routes. `/members`, `/audit`, `/settings` top-level routes are replaced; `/requests` stays a placeholder. |
| D5 | **Reuse the Phase 10 backend.** No new endpoints for users/roles, audit, settings, members or removal. Only the dashboard endpoint is replaced and `GET /api/content` gains `mine`/`deliveryStatus` filters. |
| D6 | **Audit enums are the contract.** `AUDIT_ACTIONS`/`AUDIT_TARGET_TYPES` are expanded to every value the code writes, the query is validated against them, and a test keeps them in sync with source. |
| D7 | **Cache invalidation, never optimistic writes.** One `['dashboard']` key, invalidated from every mutation that can move a number (matrix in §5.3). |
| D8 | **Partial-settings writes.** The editor PATCHes only fields that changed. |
| D9 | **Reuse the shared confirmed-action pattern.** `ConfirmDialog` for role change, removal, pattern change; inline result copy (no toast library). |
| D10 | **Privacy.** No `fullName`/`email`/`telegramId`/`registrationId` in URLs, route paths, `localStorage` or client logs; audit `details` never injected as HTML. |
| D10b | **No PII in dashboard payloads.** Activity items carry `actorUserId` (an opaque id) and no `details`; member rows show `fullName` + `RoleBadge` on screen only. |
| D11 | **Lazy admin routes** + per-route chunk sizes reported against the Phase 12 budget. |
| D12 | **Design review is part of "done":** the dashboard goes through the UI/UX Pro Max review, with 21st.dev used for card-layout inspiration, and must not read as templated. |

## 3. User amendments (authoritative)

1. **Scholar `recentContent` gating.** The Scholar variant's `recentContent` is populated **only when the scholar's roster entry is `status = 'active'`**, re-read from the DB on every dashboard call; otherwise it is `[]`. Test: unregistered, declined and graduated scholars all get `[]`.
2. **Role source.** The variant comes only from the authenticated user's DB role; any role param/header is ignored. Test that forging them has no effect.
3. **Registrar `myPendingAccessReviews`.** The Registrar variant adds `myPendingAccessReviews` — entries flagged by the caller (`access_review_pending = true AND updated_by = actor.id`), matching what the registrar can act on.
4. **Admin `recentActivity`.** Capped at 10 and trimmed to `action`, `actorUserId`, `targetType`, `createdAt` — **no raw `details`**, no names/emails.
5. **Shared metric definitions** (identical for Admin and Registrar):
   - `totalScholars` = `roster` rows with `status = 'active'`.
   - All content counts exclude soft-deleted posts (`deleted_at IS NULL`).
   - `pendingJoinRequests` counts only requests from the last 30 days (card labelled "Pending requests · last 30 days").
6. **Audit consistency test.** A test scans the API source for every action string written to `audit_logs` and asserts each is present in `AUDIT_ACTIONS` (and likewise target types in `AUDIT_TARGET_TYPES`).
7. **Query key + invalidation.** Rename `['dashboard','stats']` to `['dashboard']`; invalidate it after role change, member removal, roster status change, content create/edit/delete, and settings update. Move the Phase 12 admin Home onto the new endpoint. Update `api-reference.md`, `workflows.md`, `security.md`; move the old stats tests to the new endpoint.

### 3a. Additional UI constraints (from review)

- **Role management:** confirm before change with copy naming the user and target role; disable on self and on the last admin with an explanation; map `409`/`400`/`403` to inline messages.
- **Audit:** stable append (key by id, de-dupe) so live inserts don't duplicate rows; `details` rendered from an allow-list, never `dangerouslySetInnerHTML`; timestamps in the viewer's locale.
- **Settings:** pattern-change confirm; "test a registration id" live check; only changed fields sent.
- **Members:** show `checkedAt` as relative time; state that membership covers only queried users (the bot cannot enumerate the channel); block self/admin removal client-side; "Removal queued" copy for `202`.
- **Dashboards:** cards link to filtered screens (`failedDeliveries` → content filtered to mine+failed, `pendingAccessReviews` → roster access-review tab); skeleton/empty/error states; no PII; tap targets ≥ 44px.
- **Routing:** lazy-load admin routes; report per-route chunk sizes vs the Phase 12 budget; Telegram BackButton closes sheets/dialogs first.

## 4. Backend changes

### 4.1 `GET /api/dashboard` (replaces `GET /api/dashboard/stats`)

- **Auth:** any authenticated user (`authUser`); the controller passes `req.user` to the service.
- **Role source:** `actor.role` from the DB only (D2). No `?role`, no `X-Role`.
- **Response:** `200 { dashboard: DashboardPayload }`.
- **Removal:** the `/dashboard/stats` route + handler are deleted; its tests are rewritten against `/api/dashboard` (admin variant). `admin-routes.ts` keeps every other route; the new route lives in a small `dashboard-routes.ts` mounted with `authUser` in `app.ts`.

Service: `dashboard.service.getDashboard(actor: { id: string; role: Role }, db)` switching on role; the aggregates live in repositories (`roster.repository`, `content.repository`, `join-requests.repository`, `audit-logs.repository`) as small count/list functions so the definitions are shared.

New repository functions needed:
- `rosterRepository.countActiveScholars(db)` → `count(*) WHERE status = 'active'`.
- `rosterRepository.countAccessReviewPendingBy(updatedBy, db)` → registrar's `myPendingAccessReviews` (the existing `countAccessReviewPending` covers `pendingAccessReviews`).
- `contentRepository.countByAuthor(postedBy, db)`, `contentRepository.countFailedByAuthor(postedBy, db)`, and `contentRepository.listRecentByAuthor(postedBy, limit, db)`.
- `joinRequestsRepository.countPendingSince(since, db)` for the 30-day pending count.

### 4.2 `DashboardPayload` (`packages/shared/src/types/dashboard.ts`, new)

```ts
export type DashboardActivityItem = {
  action: AuditAction;
  actorUserId: string | null;
  targetType: AuditTargetType;
  createdAt: string;
};

export type ScholarDashboard = {
  role: 'scholar';
  roster: RosterEntry | null;
  recentContent: ContentPost[]; // [] unless the roster entry is active (amendment 1)
};

export type FacultyDashboard = {
  role: 'faculty';
  myContentCount: number;
  failedDeliveries: number;
  recentContent: ContentPost[]; // posted by the caller, soft-deleted excluded
};

export type RegistrarDashboard = {
  role: 'registrar';
  totalScholars: number;
  pendingAccessReviews: number;
  myPendingAccessReviews: number;
  rosterAuditIssues: number;
};

export type AdminDashboard = {
  role: 'admin';
  totalScholars: number;
  pendingJoinRequests: number;
  pendingAccessReviews: number;
  contentByDiscipline: { discipline: DisciplineTag; count: number }[];
  recentActivity: DashboardActivityItem[]; // max 10 (amendment 4)
};

export type DashboardPayload =
  | ScholarDashboard
  | FacultyDashboard
  | RegistrarDashboard
  | AdminDashboard;
```

`DashboardStats` (entities.ts) is **retired**: its aggregate fields move into `AdminDashboard`, and the moved Phase 10 tests assert the same numbers through the admin variant.

### 4.3 `GET /api/content` — additive filters

The controller-local `contentQuerySchema` (`apps/api/src/controllers/content-controller.ts:24`, currently `discipline`/`format`/`cohortYear`/`search`/`page`/`pageSize`) gains:
- `mine` (`booleanQuerySchema`) → `posted_by = actor.id` (Faculty/Admin see their own; a Scholar asking `mine=true` gets an empty list, not an error).
- `deliveryStatus` (`z.enum(ContentDeliveryStatus)`) → `delivery_status = ?` (soft-deleted excluded, as today).

Both validated in `content.repository` list/find conditions. Purpose: the dashboard's "Failed deliveries" card deep-links to `/content?mine=true&deliveryStatus=failed`.

### 4.4 Audit enums expanded + query validated

`packages/shared/src/constants/audit.ts`:

- `AUDIT_ACTIONS` adds: `CREATE_ROSTER_ENTRY`, `UPDATE_ROSTER_STATUS`, `UPDATE_ROSTER_ENTRY`, `APPROVE_JOIN_REQUEST`, `DECLINE_JOIN_REQUEST`, `JOIN_REQUEST_DELIVERY_FAILED`, `CONTENT_CREATED`, `CONTENT_UPDATED`, `CONTENT_DELETED`, `CONTENT_POSTED`, `CONTENT_DELIVERY_FAILED` (keeping the five existing).
- `AUDIT_TARGET_TYPES` adds: `ROSTER`, `JOIN_REQUESTS`, `CONTENT_POSTS`.

`auditLogQuerySchema` validates `action` against `AuditAction` and `targetType` against `AuditTargetType` → `400 VALIDATION_ERROR` on an unknown value (replacing free-text). `actorUserId` stays a UUID filter; `page`/`pageSize` unchanged (default 50).

### 4.5 Backend tests

- Per-role payload: each role gets exactly its variant (shape asserted field by field; no extra keys).
- **Role source:** scholar sending `?role=admin`, header `X-Role: admin`, and body `{ role: 'admin' }` still gets `{ role: 'scholar' }`.
- **Scholar gating:** unregistered / `pending` / `declined` → `recentContent: []`; active → populated; a roster status change between calls flips it (fresh DB read).
- **Registrar:** `myPendingAccessReviews` counts only rows with `updated_by = actor.id`; another registrar's flag is excluded.
- **Admin:** `recentActivity` ≤ 10 and items carry exactly the four trimmed keys (assert `details` absent).
- **Definitions:** `totalScholars` ignores non-active roster rows; content counts exclude soft-deleted; `pendingJoinRequests` excludes requests older than 30 days.
- **Audit enum consistency (amendment 6):** a unit test reads `apps/api/src/{services,controllers}` with `fs`, extracts `action: '<literal>'` / `targetType: '<literal>'` occurrences, and asserts each value is a member of the shared enum sets. Values referenced through `AUDIT_ACTIONS.*` are covered by the existing five.
- **Query validation:** `auditLogQuerySchema` rejects an unknown `action`/`targetType`.
- **Content filters:** `mine`/`deliveryStatus` filter correctly; unknown `deliveryStatus` → `400`.

## 5. Miniapp data layer

### 5.1 `lib/api.ts`

Add:
- `getDashboard(): Promise<DashboardPayload>` — unwraps `{ dashboard }`.
- `listUsers(): Promise<User[]>` — unwraps `{ users }`.
- `updateUserRole(id: string, role: Role): Promise<User>` — unwraps `{ user }`.
- `listAuditLogs(query: AuditLogQuery): Promise<{ logs: AuditLog[]; page: number; pageSize: number; total: number }>` — returns the service object as-is (it is not wrapped in a named key).
- `getSettings(): Promise<SystemSettings>` / `updateSettings(patch: SettingsUpdateInput): Promise<SystemSettings>` — unwrap `{ settings }`.
- `listMembers(): Promise<MemberSummary[]>` — unwraps `{ members }`.

Reuses `removeMember`, `getRosterAudit`, `isForbidden`, `isUnauthorized`.

### 5.2 Hooks

- `hooks/use-dashboard.ts` — `dashboardKeys = { all: ['dashboard'] as const }`, `useDashboard()`.
- `hooks/use-admin.ts` — `adminKeys = { users, auditLogs(query), members, settings }`; `useUsers()`, `useUpdateUserRole()`, `useAuditLogs(query)`, `useMembers()`, `useSettings()`, `useUpdateSettings()`. Mutations invalidate per §5.3, never optimistically.

### 5.3 Query keys & invalidation matrix

`['dashboard','stats']` is renamed to `['dashboard']` and invalidated by:

| Mutation | Invalidates |
|---|---|
| `useUpdateUserRole` | `['dashboard']`, `['admin','users']` |
| `useRemoveMember` | `['dashboard']`, `['admin','members']`, `['roster']` |
| `useUpdateRoster` | `['dashboard']`, `['roster']` |
| content create/edit/delete/upload | `['dashboard']`, `['content']` |
| `useUpdateSettings` | `['dashboard']`, `['admin','settings']` |

(The Phase 14 content/roster hooks currently invalidate `['dashboard','stats']`; those calls change to `['dashboard']`.)

### 5.4 Privacy

No `fullName`/`email`/`telegramId`/`registrationId` in URLs, route paths, `localStorage` or logs. `MemberSummary.user.telegramId` is used only for on-screen context, never as a route id or query key. No query-cache persistence.

## 6. Dashboard feature (`features/dashboard/`)

`HomeScreen` keeps `AppHeader`/`ProfileCard`/`RoleActions`, then renders one panel chosen from `useDashboard().data`:

- `ScholarDashboard` — status card (`StatusPill`, `cohortYear`, registration id), "Recent content" list (each → `/content/:id`), and a designed empty state for a not-yet-active scholar.
- `FacultyDashboard` — "My posts" (`myContentCount`), "Failed deliveries" (destructive tone → `/content?mine=true&deliveryStatus=failed`), recent own posts.
- `RegistrarDashboard` — "Active scholars", "Pending access reviews" (→ `/roster?tab=access-review`), "Flagged by me" (`myPendingAccessReviews`, same link), "Roster mismatches" (→ `/roster?tab=audit`).
- `AdminDashboard` — "Active scholars", "Pending requests · last 30 days", "Pending access reviews", `contentByDiscipline` (→ `/content?discipline=…`), and Recent activity (humanised `action`, short `actorUserId`, relative timestamp — no `details`).

Panels are dumb components taking their typed variant (no fetches). Shared `StatCard`/`ActionCard`/`ActivityRow` composites live in `components/shared/`. Every panel has skeleton / empty / error+retry states, `≥44px` tap targets, and no PII.

`RosterScreen` reads `?tab=` (`scholars|access-review|audit`) to preselect the tab; `ContentScreen` reads `?mine`/`?deliveryStatus` into its filter state.

**Design review:** before finalising, run the **UI/UX Pro Max** review on the dashboard and draw card-layout inspiration from **21st.dev**, adapting to the existing tokens (blue primary, semantic palette, `RoleBadge`, `StatusPill`) — the result must read as specific to this product, not templated.

## 7. Admin module (`features/admin/`)

### 7.1 IA & routes

- `routes.tsx` adds `{ path: '/admin', label: 'Admin', roles: ['admin'], showInNav: true }` → `AdminScreen` hub; and lazy, `showInNav:false`, `roles:['admin']` routes `/admin/users`, `/admin/members`, `/admin/audit`, `/admin/settings`.
- The old `/members`, `/audit`, `/settings` route entries and their `PlaceholderScreen`s are removed (replaced by the admin routes). `/requests` is untouched.
- `AdminScreen` lists four `ActionCard`s (Users & roles, Members, Audit log, Settings) linking to the deep routes.
- `routes.test.ts` updated for the new nav item and routes.

### 7.2 Users & roles (`AdminUsersScreen`)

- `useUsers()` (whole cohort, no server pagination) + `SearchInput` filtering `fullName`/`telegramUsername` client-side; rows rendered as cards with `RoleBadge`, `fullName`, `@username`.
- Changing a role opens a **confirm** dialog: "Change this user's role to <Role>? They'll get the new permissions immediately and a notification in Telegram." `loading` while the PATCH is in flight.
- **Self-change** disabled client-side with explanation; **last-admin demotion** disabled client-side with explanation. Both are still enforced server-side.
- Error mapping: `409 CONFLICT` (last admin) and `400 VALIDATION_ERROR` (self-change) render the server message inline and keep the dialog open; `403` → forbidden note.
- Update → invalidate `['dashboard']`, `['admin','users']`.

### 7.3 Members & removals (`AdminMembersScreen`)

- `useMembers()` (roster status + observed membership, admin-only) with a **Mismatches** view from `getRosterAudit()` (reusing `RosterAuditPill`).
- Each row: `fullName`, `RoleBadge`, roster `StatusPill`, membership indicator with `checkedAt` shown as **relative time**; a caption states membership covers only users the bot has queried (the bot cannot enumerate the channel).
- Removal: `ConfirmDialog` (`tone="destructive"`, confirm "Queue removal") with an optional `reason`; calls `removeMember(userId, reason)`.
- `202` → inline **"Removal queued"**; `403` → "You do not have permission to remove this member." Current user and admin targets are blocked client-side (disabled with a reason); server still enforces.
- Update → invalidate `['dashboard']`, `['admin','members']`, `['roster']`.

### 7.4 Audit log viewer (`AdminAuditScreen`)

- `FilterBar` with two `FilterSelect`s (action, targetType) whose options come from the shared enums, an actor `actorUserId` text filter, and a "Load older" pager (`page`/`pageSize`, default 50).
- **Stable append:** rows are keyed by `id` and de-duplicated on append, so shifted pages during live inserts don't duplicate; explicit end-of-list state.
- Row: humanised action (map in `features/admin/labels.ts`, falling back to the raw value), actor user id, target type, and a relative timestamp with an absolute title in the viewer's locale.
- `details` rendered from an **allow-list** of keys (`from`, `to`, `title`, `status`, `count`, `reason`, …) as plain `key: value` text; unknown keys show only the key name; never `dangerouslySetInnerHTML`.
- Empty / error+retry / skeleton states.

### 7.5 Settings editor (`AdminSettingsScreen`)

- `react-hook-form` over the shared `settingsUpdateSchema`, five typed fields:
  - `registrationIdPattern` — text input with live `try/catch` regex validation and a **"Test a registration id"** sub-field showing match/no-match.
  - `availableCohortYears` — add/remove chips (numeric, de-duplicated, sorted, ≥1).
  - `inviteLinkExpirySeconds` — numeric seconds with a humanised hint.
  - `maxUploadSizeBytes` / `maxContentUploadBytes` — MB inputs converted to bytes on submit (min/max from the schema).
- Submit sends **only changed fields** (deep-compare against loaded settings). A **confirm** appears when `registrationIdPattern` changed: "This changes which registration ids are accepted — new registrations will be screened against the new pattern immediately."
- Error mapping: invalid pattern → the schema message inline; `400` → server message; `403` → forbidden note.
- Footer shows `updatedAt`/`updatedBy` where available and a "Saved" confirmation. Update → invalidate `['dashboard']`, `['admin','settings']`.
- The empty-patch case (nothing changed) shows "No changes to save" and sends nothing.

## 8. Cross-cutting

- Screens wrap in `PageTransition`, add no page padding (AppShell owns `px-4 pb-28 pt-4`), and reuse `ListState`/`EmptyState`/`ErrorState`/`LoadingSkeletons`/`ConfirmDialog`.
- `useBackButton` is wired so Telegram Back closes an open `Sheet`/`ConfirmDialog` first, then navigates.
- No toast library — feedback is inline at the point of action (Phase 14 D8 carried forward).
- Admin deep routes are `lazyElement`-wrapped with a `ScreenSkeleton` fallback.
- `features/admin/labels.ts` holds action/target/status copy; `features/dashboard/labels.ts` holds any dashboard-only copy.

## 9. Testing

**Shared:** `DashboardPayload` type guards (if added) + audit constants exported; no runtime test needed beyond the API side.

**API:** §4.5 tests, plus a `dashboard.int.test.ts` covering the four variants against seeded data and the §4.1 repository definitions.

**Miniapp:**
- Hooks: `useDashboard`, `use-admin` (`vi.mock('@/lib/api')`).
- `HomeScreen` renders exactly one variant for each mocked `getMe` role; a card with a deep-link produces the expected route (`/content?mine=true&deliveryStatus=failed`, `/roster?tab=access-review`).
- `AdminUsersScreen`: confirm copy, self-disabled, last-admin-disabled, `409`/`400` inline mapping.
- `AdminAuditScreen`: filter → query params, append de-dupe (page 2 overlapping page 1), `details` allow-list (no raw injection).
- `AdminSettingsScreen`: invalid regex inline error, changed-fields-only body, pattern-change confirm, "No changes to save".
- `AdminMembersScreen`: relative `checkedAt`, self/admin removal disabled, "Removal queued" on `202`, `403` message.
- `routes.test.ts`: `/admin` in nav for admin only, deep routes present, `/requests` still a placeholder.

## 10. Verification & reporting

Repo root:
1. `npm run lint`
2. `npm run typecheck`
3. `npm test` (api unit incl. the audit consistency test, miniapp, shared)
4. `npm run test:integration --workspace=apps/api`
5. `npm run build --workspace=apps/miniapp` with the `VITE_*` env, then report **per-route chunk sizes vs the Phase 12 budget (727.81 kB raw / 227.60 kB gzip)**, confirming `/admin/*` and the dashboard chunk lazily.

## 11. Docs & env

- `docs/context/api-reference.md`: document `GET /api/dashboard` (four variants + definitions); remove `GET /api/dashboard/stats`; document `mine`/`deliveryStatus` on `GET /api/content`; fix stale bits — remove the non-existent `GET /api/registrations/:id`, add `maxContentUploadBytes` to the `SystemSettings` listing, document `targetType`/`page`/`pageSize` on `GET /api/audit-logs`.
- `docs/context/workflows.md`: add role-dashboard entries and the admin flows (role change, audit browsing, settings change, member removal) with screen → action → endpoint → confirm mapping.
- `docs/context/security.md`: role-source rule (DB role only), registrar `myPendingAccessReviews`/removal boundary, PII rules (no PII in URLs/logs/cache), audit `details` rendering rule.
- `docs/context/file-structure.md`: add `features/dashboard`, `features/admin`, new hooks/API functions.
- `docs/context/ui-context.md`: add the dashboard/admin card primitives and the per-role dashboard notes.
- No new env vars.

## 12. Non-goals

- `/requests` join-request review (stays a placeholder) — no `GET /api/registrations`.
- Notifications inbox, job-run/queue viewer, manual join-request decisions.
- User creation/deletion or hard deletes; role changes beyond the four roles.
- Keyset pagination (page-based + id de-dupe this phase; keyset noted as a follow-up).
- Any Phase 16 work.

## 13. Deviations to expect / record

- **`DashboardStats` is retired** — its admin aggregate fields move into `AdminDashboard`, and the Phase 10 stats tests are rewritten against the admin variant of `GET /api/dashboard`.
- **Audit `details` allow-list** is intentionally conservative: an unrecognised key is not rendered, which may hide newly added detail fields until the list is updated (the enum consistency test covers actions/targets, not detail keys).
- **Audit paging** is page-based with id de-dupe, not keyset — a very busy audit log could still skip an entry between pages in a rare race; documented as a follow-up.
- **`GET /api/members` remains unpaginated** (whole cohort with `telegramId` in the payload) — acceptable at current scale, flagged for a future pagination pass.
- **`myPendingAccessReviews` keys off `updated_by`**, matching the existing registrar removal boundary; a flag subsequently edited by an admin is no longer "the registrar's".
- **Client-side self/last-admin guards** are UX only; the API remains the enforcement point.
- **Bot-error migration fix** landed as commit `99a9029` (pre-existing, not part of this phase).
- Nothing is committed without explicit approval; Phase 16 is not started.
