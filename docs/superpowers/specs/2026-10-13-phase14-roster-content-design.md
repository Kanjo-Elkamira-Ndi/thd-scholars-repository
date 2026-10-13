# Phase 14 — Roster & Content (Mini App) — Design Spec

Date: 2026-10-13
Status: Approved (design reviewed; 8 amendments folded in) — ready to implement
Depends on: Phases 9–13 (content API + bot delivery, admin/roster/members API, roster-audit, jobs, Mini App foundation + registration)

## 1. Goal

Turn the two remaining designed placeholders in `apps/miniapp` into real feature screens:

- **Roster** (`/roster`, Registrar + Admin): one screen with three segments — **Scholars** (search/filter the roster, edit status with a confirm step), **Access review** (the flagged graduated/withdrawn entries, with a confirmed member removal where allowed), and **Audit** (the quarterly `computeRosterAudit` view).
- **Content** (`/content`, all verified members): browse/search/filter the content index, open a post in a **bottom sheet** with an "Open in channel" / "Open Drive link" action; **Faculty + Admin** get a **full-screen composer** (`/content/new`, `/content/:id/edit`) with file-upload progress, edit and delete of their own posts.

This phase also builds the **shared UI infrastructure** both features need (tabs, dialog, sheet, select, debounced search, infinite "load more", a reusable confirm dialog, a unified list state) — because a third consumer does not exist and a generic config-driven DataTable was explicitly rejected as over-engineering (Approach #1).

The API gains three small **additive** endpoints/filters (one item-read per resource + an access-review filter) so the Mini App never has to over-fetch a list to render a detail view.

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| D1 | **One phase, two features + shared infra.** Roster and Content ship together with the shared primitives, reusing the Phase 12 token/motion/shell system unchanged. |
| D2 | **Approach #1 — shared toolkit + per-feature modules.** No generic config-driven DataTable; each feature owns its list/detail/composer components and composes the shared primitives. |
| D3 | **Content IA:** list → **bottom-sheet** detail (shadcn `sheet` side="bottom"); authoring is a **full-screen route** (`/content/new`, `/content/:id/edit`), not a sheet — a real form with upload progress deserves the full viewport. |
| D4 | **Roster IA:** one `/roster` route, three **segments** via shadcn `tabs` (Scholars / Access review / Audit). Mobile-first cards, not a table. |
| D5 | **Additive backend only.** `GET /api/content/:id`, `GET /api/roster/:id`, and `accessReviewPending` on `rosterQuerySchema`. No schema/migration change. |
| D6 | **Uploads via XHR** (not `fetch`) so the composer gets real **byte progress** and a **Cancel** button; `apiFetch` stays the JSON chokepoint, and a dedicated `uploadContent` helper handles the multipart path. |
| D7 | **Telegram closing confirmation** is enabled for the duration of an upload (and while the composer holds unsaved input) so a user can't accidentally swipe the Mini App closed mid-request. |
| D8 | **No toast library.** Success/error feedback is **inline** at the point of action (in-dialog result, field error, or list state). |
| D9 | **Link host is deploy config:** `VITE_CHANNEL_ID` holds the numeric channel id (same value as the bot's `BOT_CHANNEL_ID`, `-100…` form). The Mini App derives `https://t.me/c/<id-without--100>/<messageId>`. |
| D10 | **Ownership is UI-honest, server-enforced.** Faculty see Edit/Delete only on their own posts (compared against `me.user.id`); the API is the real gate (non-owner Faculty → `403`), and a direct edit URL renders `AccessDenied`. |
| D11 | **Cache invalidation, not optimistic writes.** Every mutation invalidates the affected query keys; only content lists get a **capped, conditional** poll (while a visible post is `pending`/`processing`), paused when the document is hidden. |
| D12 | **Privacy:** no `fullName`/`email`/`registrationId` in URLs, route paths, `localStorage`, or client logs; route paths carry ids only; no React Query cache persistence. |
| D13 | **Lazy routes:** Roster, Content, and the composer routes are `React.lazy`-loaded; per-route chunk sizes are reported against the Phase 12 budget. |

## 3. User amendments (authoritative)

These refine the approved design and override anything below that contradicts them.

1. **`/library` → `/content`.** Rename the route and nav label to "Content"; fix every leftover `/library` reference (code, bot templates, startapp mappings, docs). "Open in channel" builds `https://t.me/c/<channelId minus `-100` prefix>/<telegramMessageId>` opened via SDK `openTelegramLink`; channel id from public env `VITE_CHANNEL_ID` (documented as the same value as `BOT_CHANNEL_ID`). Drive links open via SDK `openLink`, never `target=_blank`. Hide "Open in channel" when `telegramMessageId` is null.
2. **Composer upload:** XHR multipart for byte progress + a **Cancel** button; Telegram closing confirmation on while uploading; client pre-check of MIME + size from shared constants; map `400`/`413`/`415` and `VALIDATION_ERROR` to plain messages. On a network error mid-upload: "Upload interrupted — check the Content list before retrying", refetch the list, **no auto-retry**.
3. **Access review:** "Confirm removal" is shown only when the user is **Admin**, or a **Registrar whose id equals the entry's `updatedBy`**; otherwise it is disabled with a short explanation. Handle a `403` gracefully. The roster entry response must include `updatedBy` (it does).
4. **Confirm-dialog copy** (exact intent): flagging `graduated`/`withdrawn` = *flags for access review; the student stays in the channel until removal is confirmed*; setting back to `active` cancels any pending removal; member removal = **"Removal queued"** (the API responds `202`; the kick is async) and the dialog notes the Audit tab may still show the member until the bot finishes; content delete = removes it from the index **and** deletes the channel message; content edit = **index-only** (the channel message and hashtags are unchanged).
5. **Ownership:** Faculty see Edit/Delete only where `postedBy === me.user.id`; Admin sees all. `/content/:id/edit` for someone else's post as Faculty → `AccessDenied`.
6. **Cache:** after each mutation invalidate all affected keys (roster lists, audit, access review, content lists/detail, and `['dashboard','stats']` where relevant). Poll content lists with capped, conditional `refetchInterval` only while a visible post is `pending`/`processing`; stop at terminal states; pause when `document.hidden`. Show a failed delivery to the owner/Admin.
7. **Privacy:** no names/emails/registration ids in URLs, route paths (ids only), `localStorage`, or client logs; no query-cache persistence.
8. **Mobile:** Telegram `BackButton` closes an open sheet/dialog before navigating; the composer submit button stays above the keyboard; lazy-load roster, content, and composer routes; report per-route chunk sizes vs the Phase 12 budget.

## 3b. Extra tests required (from review)

- Registrar sees a **disabled** removal control on another registrar's flag; Admin sees it enabled.
- Faculty B sees no Edit/Delete on A's post, and `/content/:id/edit` renders `AccessDenied`.
- Composer requires **exactly one** of file or `driveLink`, and enforces the shared title max length.
- A mid-upload network error does **not** auto-retry and surfaces the "check the Content list" copy.
- The channel-link builder strips the `-100` prefix and hides when `telegramMessageId` is null.
- Cache invalidation fires the expected keys after each mutation.

## 4. Backend additions (additive, with tests)

### 4.1 `GET /api/content/:id`
- **Route:** `apps/api/src/routes/content-routes.ts` → `router.get('/content/:id', requireVerifiedMember, asyncHandler(getContentById))` (registered **before** the `/content/:id` PATCH/DELETE conflict is irrelevant — methods differ, but keep the list `/content` first).
- **Auth:** `requireVerifiedMember` (same gate as the list). Non-verified Scholar → `403 NOT_VERIFIED`.
- **Behaviour:** `:id` validated as UUID → `400 VALIDATION_ERROR`; unknown or soft-deleted (`deleted_at IS NOT NULL`) → `404 NOT_FOUND`.
- **Service:** `content.service.getContentById(id)` → `contentRepo.getContentPostById(id)`, reject `deletedAt`.
- **Response:** `200 { contentPost: ContentPost }`.

### 4.2 `GET /api/roster/:id`
- **Route:** `apps/api/src/routes/roster-routes.ts` → `router.get('/roster/:id', asyncHandler(getRosterById))` under the existing `requireRole('registrar','admin')`.
- **Behaviour:** UUID validate → `400`; not found → `404`.
- **Service/repo:** new `getRosterById` in `roster.service` delegating to `rosterRepo.getRosterById` (already exists).
- **Response:** `200 { rosterEntry: RosterEntry }`.

### 4.3 `accessReviewPending` filter
- **Shared:** add `accessReviewPending: z.coerce.boolean().optional()` to `rosterQuerySchema` (coerces the `"true"`/`"false"` query string).
- **Controller/service/repo:** thread it through `getRoster` → `listRoster` → `rosterRepo.listRoster`, adding `AND ($n::boolean IS NULL OR r.access_review_pending = $n)` to the filter SQL.
- The **Access review** tab uses `GET /api/roster?accessReviewPending=true` (a dedicated endpoint was unnecessary).

### 4.4 Tests
- **Unit (controller):** `content-controller.test.ts` (new) and `roster-controller.test.ts` (extend): reject a non-UUID with `VALIDATION_ERROR` without calling the service; delegate a valid UUID and set `200`.
- **Integration (DB):** extend the existing `*.int.test.ts` for content/roster: `GET /content/:id` returns the post, `404` for a soft-deleted post; `GET /roster/:id` returns the entry, `404` for unknown; `getContent` with `accessReviewPending=true` returns only flagged entries.

## 5. Shared UI infrastructure

### 4.1.1 New shadcn primitives (`components/ui/`)
Add via the shadcn CLI (vendored in canonical form like the Phase 12 primitives, so the build stays offline):
- `tabs.tsx` — `@radix-ui/react-tabs`
- `dialog.tsx` — `@radix-ui/react-dialog`
- `sheet.tsx` — `@radix-ui/react-dialog` (sheet is the dialog primitive styled as a panel)
- `select.tsx` → use `@radix-ui/react-select`; **but** for native mobile ergonomics prefer a `Select` built on the existing `select` primitive only where a real dropdown is needed. Discipline/format/status filters use native `<select>`-styled controls on mobile; document the choice.

New deps: `@radix-ui/react-tabs`, `@radix-ui/react-dialog`, `@radix-ui/react-select`.

### 4.4 New `components/shared` primitives
- **`SearchInput`** — `input` + search icon + clear button; debounces `onChange` (~250 ms) via a local timer; controlled externally.
- **`FilterBar`** — responsive row of `Select`/native selects + an optional "Clear".
- **`ConfirmDialog`** — wraps `dialog`; `{ title, description, confirmLabel, cancelLabel, tone, onConfirm, onCancel, busy, children? }`; destructive tone uses `variant="destructive"`; supports a `result` slot for inline "Removal queued" success.
- **`LoadMore`** — "Load more" button + inline spinner; disabled/absent when `!hasNextPage`.
- **`ListState`** — `{ status, empty, error, children }`: renders `ScreenSkeleton`/`CardSkeleton` while loading, `EmptyState` when empty, `ErrorState` with retry on error, else children.
- **`StatusPill` extended** — keep roster status; add generic `tone`+`label` usage (or a sibling `DeliveryPill`) for content delivery (`pending`/`processing`/`posted`/`failed`) and audit issues (`active_not_member`/`inactive_still_member`/`membership_unknown`). Implementation detail: extract the `Tone` type and a `pillTone` map so new statuses don't duplicate `Badge` markup.

## 5. Data layer

### 5.1 `lib/api.ts`
- Generalize `apiFetch` to accept `FormData` (skip `content-type` so the browser sets the multipart boundary) **or** keep `apiFetch` JSON-only and add:
- **`uploadContent(payload, file, { onProgress, signal })`** — `XMLHttpRequest` POST to `/content` with `FormData`; sets auth headers; reports `upload.onprogress`; parses the same error envelope into `ApiError`; `abort()` support for Cancel.
- New fns: `listContent(query, signal)`, `getContentPost(id, signal)`, `createContent` (link path via `apiFetch`), `updateContent(id, patch)`, `deleteContent(id)`, `listRoster(query, signal)`, `getRosterEntry(id, signal)`, `updateRoster(id, patch)`, `getRosterAudit(signal)`, `removeMember(userId, body?)`, `getMembers()` (if the access-review tab needs membership; otherwise skip).
- Query-string builder: drop `undefined`/empty; `URLSearchParams` (no manual concatenation).

### 5.2 `hooks/use-roster.ts`
- `rosterKeys = { list: (q) => ['roster', q], detail: (id) => ['roster', id], audit: ['roster','audit'], accessReview: (q) => ['roster', { ...q, accessReviewPending: true }] }`.
- `useRosterList(query)` / `useInfiniteRoster(query)` (Scholars + Access review via the filter) — **infinite** query, `getNextPageParam` from `total`.
- `useRosterEntry(id)` — enabled when `id` present.
- `useRosterAudit()`.
- `useUpdateRoster(id)` / `useRemoveMember()` mutations → `invalidateQueries` on `['roster']` (all roster keys) + `['dashboard','stats']`.

### 5.3 `hooks/use-content.ts`
- `contentKeys = { list: (q) => ['content', q], detail: (id) => ['content', id] }`.
- `useContentList(query)` / `useInfiniteContent(query)` with the **conditional poll**: `refetchInterval: (query) => hasActiveDelivery(query.state.data) && !document.hidden ? 5000 : false`.
- `useContentPost(id)`.
- `useCreateContent()` / `useUpdateContent(id)` / `useDeleteContent()` → invalidate `['content']` (all) and `['dashboard','stats']`.

Query keys are plain arrays of primitives (ids, enums, numbers) — **no personal data** (D12).

## 6. Roster feature (`features/roster/`)

```
features/roster/
  RosterScreen.tsx            # tabs shell + per-segment lists
  components/
    RosterFilters.tsx         # search + status + cohort + access-review-aware
    RosterCard.tsx            # name, status pill, cohort, registration id (staff-only screen), flag marker
    RosterDetailSheet.tsx     # detail + Edit status (ConfirmDialog)
    RosterStatusForm.tsx      # status select + optional cohort/supervisor
    AccessReviewList.tsx      # flagged entries + "Confirm removal"
    AuditList.tsx             # audit issues
  hooks/ (or use shared use-roster.ts)
```

- **Scholars segment:** `useInfiniteRoster({ search, status, cohortYear })`; cards open `RosterDetailSheet`; **Edit status** opens `RosterStatusForm` in a `Sheet` (or inline) and committing calls `useUpdateRoster`. Status change to `graduated`/`withdrawn` requires `ConfirmDialog` (copy per amendment 4); `active` shows a "cancels any pending removal" note.
- **Access review segment:** `useInfiniteRoster({ accessReviewPending: true })`. Each card shows the flag reason (status + `accessReviewFlaggedAt`). **Confirm removal** visible only when `isAdmin || (isRegistrar && entry.updatedBy === me.id)`; otherwise rendered disabled with the explanation "Only the registrar who flagged this scholar (or an admin) can confirm removal." On confirm → `POST /api/members/:userId/remove` (needs `entry.userId`; hide the action with an explanation if `userId` is null) → inline **"Removal queued"** result; a `403` is shown as a friendly inline message (not a crash).
- **Audit segment:** `useRosterAudit()` → `{ issues }` (confirmed shape; the `api-reference.md` "items/total" text is **stale and will be fixed**). Show issue pill + roster summary + membership snapshot; empty state when clean.
- All three use `ListState` + `LoadMore`; audit is a plain (non-paginated) list.

## 7. Content feature (`features/content/`)

```
features/content/
  ContentScreen.tsx           # list + filters + detail sheet
  ContentComposerScreen.tsx   # /content/new and /content/:id/edit
  components/
    ContentFilters.tsx        # search + discipline + format + cohort
    ContentCard.tsx           # title, tags, cohort, delivery pill (owner/admin)
    ContentDetailSheet.tsx    # metadata + actions
    ContentForm.tsx           # shared RHF form (create/edit)
    DriveOrFileField.tsx      # mutually-exclusive file/link control + progress + cancel
    ContentLinkActions.tsx    # "Open in channel" / "Open Drive link"
  lib/channel-link.ts         # buildChannelUrl(channelId, messageId)
```

- **List:** `useInfiniteContent({ search, discipline, format, cohortYear })`; `ContentFilters`; cards open `ContentDetailSheet`.
- **Detail sheet:** title, discipline/format/cohort tags, `StatusPill`, created date; actions per ownership:
  - **Open in channel** → `buildChannelUrl(VITE_CHANNEL_ID, telegramMessageId)` via `openTelegramLink`; hidden when `telegramMessageId === null`.
  - **Open Drive link** → `openLink(driveLink)` when present (never `target=_blank`).
  - **Edit** / **Delete** (own post, or Admin any): Edit navigates to `/content/:id/edit`; Delete opens `ConfirmDialog` (copy per amendment 4) → `useDeleteContent` → close sheet, invalidate.
- **Composer (`/content/new`, `/content/:id/edit`):**
  - RHF + `contentCreateSchema`/`contentUpdateSchema` from `@thd/shared`; shared `title` max enforced by the schema.
  - `DriveOrFileField` enforces **exactly one** of file/`driveLink`; client pre-checks MIME against `CONTENT_MIME_WHITELIST[formatTag]` and size against the settings-derived limit (fetched or a sane default constant); disallowed type/size → inline field error before upload.
  - Submit: file → `uploadContent` with XHR progress + Cancel; link → `createContent` (JSON). While uploading, enable Telegram closing confirmation; on success navigate to `/content` and invalidate; on `400/413/415`/`VALIDATION_ERROR` map to plain inline messages; on network error show "Upload interrupted — check the Content list before retrying", refetch the list, **do not retry automatically**.
  - Edit: pre-fill from `useContentPost(id)`; a non-owner Faculty gets `AccessDenied` (compare `postedBy` vs `me.user.id`) — and the PATCH would 403 server-side anyway.
- **Empty/error/loading:** `ListState`; failed delivery is shown only to the owner/Admin as a `failed` pill + explanatory line.

## 8. Confirm flows & copy (authoritative strings)

- **Flag (→ graduated/withdrawn):** "This will flag the scholar for access review. They stay in the channel until an admin or the flagging registrar confirms removal."
- **Re-activate (→ active):** "This cancels any pending removal and keeps the scholar in the channel."
- **Confirm removal:** title "Remove from channel"; body "Removal is queued and the bot will remove them on its next run. The Audit tab may still list them until then."; confirm "Queue removal"; success result "Removal queued".
- **Delete content:** title "Delete post"; body "This removes the post from the library and deletes its message from the channel."; confirm "Delete".
- **Edit content:** helper "Edits update the library entry only — the channel message and its hashtags are not changed."

## 9. States, caching, polling (recap of D11/amendment 6)

- `ListState` is the single loading/empty/error surface for both features.
- Mutations invalidate the whole resource namespace (`['roster']`, `['content']`) plus `['dashboard','stats']`.
- Content lists poll at 5 s **only** while at least one visible item is `pending`/`processing` and the document is visible; terminal states stop the poll. `deliveryStatus: 'failed'` is surfaced to owner/Admin.

## 10. Privacy & mobile (recap of D12–D13/amendments 7–8)

- Route paths are `/content/:id` and `/content/:id/edit` — ids only. No personal data in URLs/logs/localStorage; no query persistence.
- `BackButton`: when a sheet/dialog is open on `/content` or `/roster`, back closes it; the composer registers back to leave the form; other routes navigate. Implement a small `useBackButton(handler)` that mounts/unmounts the SDK handler with precedence for overlays.
- The composer keeps the submit button reachable above the keyboard (sticky bottom action bar, `padding-bottom: env(safe-area-inset-bottom)`).
- Roster/Content/Composer routes are `React.lazy`-loaded with a shared `<Suspense>` fallback (`ScreenSkeleton`); per-route chunk sizes are measured in the final report against the Phase 12 baseline (initial bundle was un-split; this phase starts code-splitting).

## 11. Testing

- **Miniapp unit/component (vitest + RTL):**
  - `lib/channel-link.test.ts` — prefix stripping + null behavior.
  - `lib/api.test.ts` — `listContent`/`getContentPost`/`listRoster`/`getRosterEntry` query strings; `uploadContent` success/error parsing (mock `XMLHttpRequest`); network error → `NETWORK_ERROR` and no retry.
  - `hooks/use-content.test.tsx` — `refetchInterval` returns `false` at terminal states and when `document.hidden`, `5000` while active.
  - `features/roster/*.test.tsx` — registrar-other-flag disabled vs admin enabled; "Removal queued" inline result; 403 handling; audit empty state; tabs render.
  - `features/content/*.test.tsx` — Faculty B sees no Edit/Delete + `AccessDenied` at `/content/:id/edit`; composer exactly-one-of validation; title max; delete confirm; "Open in channel" hidden when `telegramMessageId` null.
  - `components/shared/*` — `ConfirmDialog` confirm/cancel/busy, `SearchInput` debounce, `ListState` branches.
- **API:** §4 tests (controller unit + the three integration additions above).
- **Gates:** `npm run lint`, `npm run typecheck`, `npm test` (per workspace: `--workspace=apps/api`, `apps/miniapp`, `packages/shared`), `npm run test:integration --workspace=apps/api`, and `npm run build`.

## 12. Docs & env

- `apps/miniapp/.env.example` + `README.md` (miniapp env table): add `VITE_CHANNEL_ID` — "Numeric channel id used to build `t.me/c/…` message links for posted content (same value as the bot's `BOT_CHANNEL_ID`, `-100…` form). Leave empty to hide 'Open in channel'."
- `apps/miniapp/src/vite-env.d.ts`: add `VITE_CHANNEL_ID?`.
- `docs/context/api-reference.md`: document `GET /api/content/:id`, `GET /api/roster/:id`, the `accessReviewPending` query param, and **fix** `GET /api/roster/audit` to the real `200 { issues: RosterAuditEntry[] }` shape.
- `docs/context/file-structure.md`: add `features/roster/**`, `features/content/**`, new `components/shared` and `components/ui` entries.
- `docs/context/workflows.md` (#2, #3, #5, #6): add the UI mapping (which Mini App screen/action drives each API call and confirm step).
- `docs/context/ui-context.md`: note the new shared primitives (tabs/dialog/sheet/select/SearchInput/FilterBar/ConfirmDialog/LoadMore/ListState).

## 13. Non-goals

- Pre-loading roster (`POST /api/roster`) UI, join-request review, member/role management, audit-log browsing, settings, notifications inbox, offline/PWA, E2E.
- Server schema/migration changes; any new bot templates (the bot already publishes/deletes content).
- **Phase 15 is not started.**

## 14. Deviations to expect / record

- `GET /api/roster/audit`'s documented shape was wrong (`items/total`); the client uses the real `{ issues }`.
- Native mobile `<select>`-style controls may be used for filters even though `@radix-ui/react-select` is added, for touch ergonomics — to be recorded if so.
- shadcn `sheet`/`dialog`/`tabs`/`select` will be vendored in canonical form (offline build), consistent with Phase 12.
