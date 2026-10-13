# Phase 14 — Roster & Content — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-13-phase14-roster-content-design.md`
Execution rules: TDD per task (write the failing test first), run the listed verify commands after each task, **do not commit**, and run `lint` + `typecheck` + `test` + `build` before the final report. Do not start Phase 15.

Naming conventions: `kebab-case.ts` files; React components `PascalCase.tsx`; shadcn primitives live in `components/ui/`; shared composites in `components/shared/`; feature code under `features/{roster,content}/`. Query keys hold primitives only (no personal data). No comments unless the surrounding file has them.

---

## Task 0 — Baseline gate

**Steps**
- [ ] `npm run lint && npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

Expected: all green (api 109, miniapp 49, shared 37; the uncommitted migration fix is present). If anything is red, stop and record it before starting.

---

## Task 1 — Backend additive endpoints + filter

**Files**
- `packages/shared/src/schemas/roster.ts` — add `accessReviewPending` to `rosterQuerySchema`.
- `apps/api/src/repositories/roster.repository.ts` — thread the filter into `ListRosterParams` / `listRoster` SQL.
- `apps/api/src/services/roster.service.ts` — `listRoster` passes it through; add `getRosterById`.
- `apps/api/src/controllers/roster-controller.ts` — add `getRosterById`.
- `apps/api/src/routes/roster-routes.ts` — `router.get('/roster/:id', asyncHandler(getRosterById))`.
- `apps/api/src/services/content.service.ts` — add `getContentById`.
- `apps/api/src/controllers/content-controller.ts` — add `getContentById`.
- `apps/api/src/routes/content-routes.ts` — `router.get('/content/:id', requireVerifiedMember, asyncHandler(getContentById))`.
- Tests: `apps/api/src/controllers/content-controller.test.ts` (new), `apps/api/src/controllers/roster-controller.test.ts` (extend), plus integration coverage.

**TDD steps**
- [ ] **Red (shared):** in `packages/shared` add a test asserting `rosterQuerySchema.parse({ accessReviewPending: 'true' }).accessReviewPending === true` and `'false' → false` (new `schemas/roster.test.ts` if none covers it). Run `npm test --workspace=packages/shared` → fail.
- [ ] Implement the schema field; re-run → green.
- [ ] **Red (controller):** in `roster-controller.test.ts` add `getRosterById`: non-UUID → `VALIDATION_ERROR` without calling the service; valid UUID calls `rosterService.getRosterById` and returns `200 { rosterEntry }`. In a new `content-controller.test.ts` do the same for `getContentById` (mock `content.service`), including `404` propagation from the service.
- [ ] **Implement** the controllers + routes + service passthrough:
  - content: reuse the existing `UUID_RE`; `await contentService.getContentById(id)` (throws `NOT_FOUND` when missing/deleted, like `updateContent`).
  - roster: `UUID_RE` guard then `rosterService.getRosterById(id)`.
- [ ] `rosterQuerySchema` change: `accessReviewPending: z.coerce.boolean().optional()`.
- [ ] `roster.service.listRoster` + repo: add `accessReviewPending?: boolean` to the params type and `AND ($4::boolean IS NULL OR r.access_review_pending = $4)` (renumber the `LIMIT/OFFSET` placeholders accordingly).
- [ ] Integration tests (extend `*.int.test.ts`): `GET /content/:id` 200 + 404 (soft-deleted); `GET /roster/:id` 200 + 404; `GET /roster?accessReviewPending=true` returns only flagged entries. Use the existing integration harness (`test:integration`).

**Verify**
- [ ] `npm test --workspace=apps/api`
- [ ] `npm run test:integration --workspace=apps/api`
- [ ] `npm run typecheck && npm run lint`

---

## Task 2 — Miniapp deps + shadcn primitives

**Files**
- `apps/miniapp/package.json` — add `@radix-ui/react-tabs`, `@radix-ui/react-dialog`, `@radix-ui/react-select`.
- `apps/miniapp/src/components/ui/tabs.tsx`, `dialog.tsx`, `sheet.tsx`, `select.tsx`.

**Steps**
- [ ] Install the three Radix deps in the miniapp workspace.
- [ ] Vendor the primitives in the canonical shadcn form (match the styling/tokens of the existing `components/ui/*`; reuse `cn`, `buttonVariants` where needed). `sheet.tsx` wraps `@radix-ui/react-dialog` with side variants; `tabs.tsx` exports `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`; `dialog.tsx` exports `Dialog` + `DialogContent` + `DialogHeader/Footer/Title/Description` + `DialogClose`; `select.tsx` exports the standard pieces.
- [ ] Add a `primitives.test.tsx` case (or extend) asserting each renders without throwing.

**Verify**
- [ ] `npm run typecheck --workspace=apps/miniapp`
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 3 — API client: query builder, resource fns, XHR upload

**Files**
- `apps/miniapp/src/lib/api.ts` (+ `lib/api.test.ts`)
- `apps/miniapp/src/lib/channel-link.ts` (+ test)
- `apps/miniapp/src/vite-env.d.ts` — `VITE_CHANNEL_ID?: string`.

**Steps (test-first)**
- [ ] `lib/channel-link.test.ts`: `buildChannelUrl('-1001234567890', 42)` === `https://t.me/c/1234567890/42`; a plain id `123` stays `https://t.me/c/123/9`; `buildChannelUrl(undefined, 5)` → `null`; `buildChannelUrl('-100123', null)` → `null`.
- [ ] Implement `buildChannelUrl(channelId, messageId)`; read `VITE_CHANNEL_ID` via a `channelIdFromEnv()` helper.
- [ ] `lib/api.test.ts`: add cases for
  - `listContent({ discipline:'Missiology', page:2 })` → GET `/content?discipline=Missiology&page=2` and no empty params.
  - `getContentPost('id')` → `/content/<id>`; `listRoster`, `getRosterEntry` similarly.
  - `uploadContent(...)` — stub `XMLHttpRequest`; assert auth header, `FormData` body, `onProgress` called from `upload.onprogress`, error envelope → `ApiError`, and `abort()`/network failure → `NETWORK_ERROR` (no retry).
- [ ] Implement a `buildQuery(params)` helper using `URLSearchParams` (skip `undefined`/`null`/empty).
- [ ] Add typed fns with shared types (`ContentPost`, `RosterEntry`, `RosterAuditEntry`, `ContentQuery`-like inline types, `RosterQuery`): `listContent`, `getContentPost`, `createContent`, `updateContent`, `deleteContent`, `listRoster`, `getRosterEntry`, `updateRoster`, `getRosterAudit`, `removeMember`.
- [ ] Implement `uploadContent(fields, file, { onProgress, signal })` via `XMLHttpRequest` to `${API_BASE_URL}/content`; `FormData` with `title/disciplineTag/formatTag/cohortYear?` + `file`; attach `authHeaders()`; parse `responseText` envelope on error; expose `abort`.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`
- [ ] `npm run typecheck --workspace=apps/miniapp`

---

## Task 4 — `useBackButton` hook

**Files**
- `apps/miniapp/src/hooks/use-back-button.ts` (+ test)

**Steps**
- [ ] Test: mounting registers a `backButton.onClick` handler; unmounting removes it; handler runs the supplied callback; no-op outside Telegram. (Mock `@telegram-apps/sdk-react` as the other hook tests do.)
- [ ] Implement `useBackButton(handler, { enabled = true })`: when enabled and supported, `backButton.onClick(handler)` + `backButton.show()`; cleanup `offClick` + `hide()`. Cover overlay precedence by simply calling it from the child that owns the open sheet.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 5 — Shared primitives

**Files**
- `apps/miniapp/src/components/shared/SearchInput.tsx`
- `apps/miniapp/src/components/shared/FilterBar.tsx`
- `apps/miniapp/src/components/shared/ConfirmDialog.tsx`
- `apps/miniapp/src/components/shared/LoadMore.tsx`
- `apps/miniapp/src/components/shared/ListState.tsx`
- `apps/miniapp/src/components/shared/StatusPill.tsx` (extend)
- Tests colocated.

**Steps (test-first per component)**
- [ ] `SearchInput` — debounces (fake timers), fires `onChange` once, clear button resets.
- [ ] `ConfirmDialog` — renders title/body; confirm/cancel callbacks; `busy` disables and shows a spinner; destructive tone; `result` slot renders after success.
- [ ] `LoadMore` — hidden when `!hasNextPage`; shows spinner when `isFetchingNextPage`.
- [ ] `ListState` — loading → skeleton; empty → `EmptyState`; error → `ErrorState` with retry; data → children.
- [ ] `FilterBar` — renders children in a responsive row; optional clear.
- [ ] Extend `StatusPill`: export a generic `pillTone`/`Tone` and add content-delivery + audit-issue labels/tones (keep the existing roster API intact so `HomeScreen` tests still pass).

**Verify**
- [ ] `npm test --workspace=apps/miniapp`
- [ ] `npm run typecheck --workspace=apps/miniapp`

---

## Task 6 — Data hooks

**Files**
- `apps/miniapp/src/hooks/use-roster.ts` (+ test)
- `apps/miniapp/src/hooks/use-content.ts` (+ test)

**Steps**
- [ ] `use-roster.ts`: key factory; `useInfiniteRoster(query)` with `getNextPageParam` from `total`/`pageSize`; `useRosterEntry(id)`; `useRosterAudit()`; `useUpdateRoster(id)`; `useRemoveMember()` — mutations invalidate `['roster']` and `['dashboard','stats']`.
- [ ] `use-content.ts`: key factory; `useInfiniteContent(query)` with conditional `refetchInterval` (5 s while any visible item is `pending`/`processing` and `!document.hidden`); `useContentPost(id)`; `useCreateContent`/`useUpdateContent`/`useDeleteContent` invalidating `['content']` + `['dashboard','stats']`.
- [ ] Test the poll function directly (pure helper `contentPollInterval(data, hidden)`) — active vs terminal vs hidden.
- [ ] Test that each mutation's `onSuccess` calls `invalidateQueries` with the expected key prefixes.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 7 — Routes: `/library` → `/content`, composer routes, lazy loading

**Files**
- `apps/miniapp/src/router/routes.tsx`
- `apps/miniapp/src/router/index.tsx`
- `apps/miniapp/src/features/home/RoleActions.tsx`

**Steps**
- [ ] Rename the `/library` entry to `/content` (`label: 'Content'`, keep `BookOpen`, `showInNav: true`, no role restriction) pointing at the (new) `ContentScreen` behind `React.lazy` + `<Suspense fallback={<ScreenSkeleton/>}>`.
- [ ] Roster entry → lazy `RosterScreen`.
- [ ] Add non-nav routes `/content/new` and `/content/:id/edit` (`roles: ['faculty','admin']`, `showInNav: false`) — lazy composer.
- [ ] Update `RoleActions.tsx` action lists to use `/content`.
- [ ] `router/index.tsx`: ensure nested path params work (the `.replace(/^\//,'')` mapping already yields `content/new` and `content/:id/edit`).
- [ ] Grep for `/library` across the repo; expect only `routes.tsx` and `RoleActions.tsx`. If any bot template/startapp mapping references it, fix it and record it (none were found during design — confirm and report).
- [ ] Update `routes.test.ts` expectations.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`
- [ ] `npm run lint`

---

## Task 8 — Roster: Scholars segment

**Files**
- `apps/miniapp/src/features/roster/RosterScreen.tsx`
- `apps/miniapp/src/features/roster/components/{RosterFilters,RosterCard,RosterDetailSheet,RosterStatusForm}.tsx`
- Tests colocated.

**Steps (test-first for behavior)**
- [ ] `RosterScreen` renders the three `Tabs` (Scholars / Access review / Audit).
- [ ] Scholars: `ListState` + `useInfiniteRoster`; `RosterFilters` (debounced search, status, cohort); cards → detail sheet.
- [ ] `RosterStatusForm` (RHF + `rosterUpdateSchema`): commit calls `useUpdateRoster`; `graduated`/`withdrawn` gated by `ConfirmDialog` with the exact copy; `active` shows the cancels-pending note.
- [ ] Test: flag confirm copy shown; update mutation invalidates `['roster']`.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 9 — Roster: Access review segment

**Files**
- `apps/miniapp/src/features/roster/components/AccessReviewList.tsx` (+ test)

**Steps (test-first)**
- [ ] Uses `useInfiniteRoster({ accessReviewPending: true })`.
- [ ] **Test the boundary:** Admin sees an enabled "Confirm removal"; a Registrar whose `id !== entry.updatedBy` sees it **disabled** with the explanation; the flagging Registrar sees it enabled.
- [ ] Confirm → `ConfirmDialog` (exact copy) → `useRemoveMember(entry.userId)` → inline **"Removal queued"** result; `403` renders a friendly inline error; `userId === null` hides removal with an explanation.
- [ ] Invalidate `['roster']` + `['dashboard','stats']` after removal.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 10 — Roster: Audit segment

**Files**
- `apps/miniapp/src/features/roster/components/AuditList.tsx` (+ test)

**Steps**
- [ ] `useRosterAudit()` → `{ issues }`; render issue pill + roster + membership snapshot per `RosterAuditEntry`.
- [ ] Empty state ("No mismatches right now") and error state via `ListState`.
- [ ] Test: renders issues; empty state when `issues` is `[]`.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 11 — Content: list, filters, detail sheet, link actions

**Files**
- `apps/miniapp/src/features/content/ContentScreen.tsx`
- `apps/miniapp/src/features/content/components/{ContentFilters,ContentCard,ContentDetailSheet,ContentLinkActions}.tsx`
- Tests colocated.

**Steps (test-first)**
- [ ] `ContentScreen` → `useInfiniteContent` + `ContentFilters` (search/discipline/format/cohort using shared constants) + `ListState` + `LoadMore`; cards → detail sheet.
- [ ] `ContentLinkActions`: "Open in channel" → `openTelegramLink(buildChannelUrl(...))`, **hidden when `telegramMessageId === null`**; "Open Drive link" → `openLink(driveLink)` when present (assert `openLink` called, not `window.open`).
- [ ] `channel-link.test.ts` already covers the builder; add a test that the action hides for a link-only post until posted.
- [ ] Delivery pill shown to owner/Admin; `failed` surfaces an explanatory line.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 12 — Content: composer (create/edit) with upload progress

**Files**
- `apps/miniapp/src/features/content/ContentComposerScreen.tsx`
- `apps/miniapp/src/features/content/components/{ContentForm,DriveOrFileField}.tsx`
- Tests colocated.

**Steps (test-first)**
- [ ] `ContentForm` (RHF + `contentCreateSchema`/`contentUpdateSchema`): required `title` (max 150), `disciplineTag`, `formatTag`, optional `cohortYear`.
- [ ] `DriveOrFileField`: **exactly one** of file/`driveLink`; client-side MIME check against `CONTENT_MIME_WHITELIST[formatTag]` and size against the limit; disallowed → inline error before upload. Test both the "both provided" and "neither provided" rejection, and the oversize/wrong-type messages.
- [ ] Create: file path → `uploadContent` with `onProgress` (progress bar) + **Cancel** (aborts XHR); link path → `createContent` (JSON). Enable Telegram closing confirmation while uploading.
- [ ] Error mapping: `400/413/415` + `VALIDATION_ERROR` → plain inline messages; **network error** → "Upload interrupted — check the Content list before retrying", refetch the content list, no auto-retry. Test the network path with a mocked `uploadContent` rejection.
- [ ] Edit: pre-fill via `useContentPost(id)`; non-owner Faculty → `AccessDenied` (test). Note copy that edits are index-only.
- [ ] Sticky bottom action bar with safe-area padding; disable submit while busy.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 13 — Content: delete + ownership gate

**Files**
- `apps/miniapp/src/features/content/components/ContentDetailSheet.tsx` (extend) (+ test)

**Steps (test-first)**
- [ ] Faculty A sees Edit/Delete on their own post; **Faculty B sees neither** (test).
- [ ] `/content/:id/edit` for another Faculty's post renders `AccessDenied` (test the composer's guard).
- [ ] Delete → `ConfirmDialog` (exact copy) → `useDeleteContent` → close sheet + invalidate.
- [ ] Admin sees Edit/Delete on any post.

**Verify**
- [ ] `npm test --workspace=apps/miniapp`

---

## Task 14 — Back button, keyboard, lazy chunks

**Files**
- Detail sheets (roster/content) + composer use `useBackButton`; `AppShell`/routes suspend with `ScreenSkeleton`.

**Steps**
- [ ] Wire `useBackButton` so an open sheet/dialog closes on Telegram Back instead of navigating (sheet/dialog `onOpenChange` drives the same state).
- [ ] Composer: confirm the submit bar stays above the keyboard (sticky, safe-area) — manual check on a narrow viewport.
- [ ] Build with `sourcemap` and capture per-route chunk sizes:
  - [ ] `VITE_API_BASE_URL=http://127.0.0.1:3000/api VITE_MOCK_USER='{"id":1}' VITE_CHANNEL_ID='-1001234567890' npm run build --workspace=apps/miniapp`
  - [ ] Record the asset sizes (initial + each lazy chunk) for the final report; note they are implicit from the initial-bundle/chunk output and compare against the Phase 12 statement that the bundle was previously un-split.

**Verify**
- [ ] `npm run build`

---

## Task 15 — Docs & env

**Files**
- `apps/miniapp/.env.example`, `apps/miniapp/src/vite-env.d.ts`
- `README.md` (miniapp env table)
- `docs/context/api-reference.md`, `docs/context/file-structure.md`, `docs/context/workflows.md`, `docs/context/ui-context.md`

**Steps**
- [ ] `.env.example` + `vite-env.d.ts` + README row: `VITE_CHANNEL_ID` (description per spec §12).
- [ ] `api-reference.md`: add `GET /api/content/:id`, `GET /api/roster/:id`; add `accessReviewPending` to the roster query params; **fix** `GET /api/roster/audit` to `200 { issues: RosterAuditEntry[] }`.
- [ ] `file-structure.md`: add the new features/components/hooks/files.
- [ ] `workflows.md` (#2, #3, #5, #6): add the Mini App UI mapping (screen → action → endpoint → confirm).
- [ ] `ui-context.md`: list the new shared primitives.

**Verify**
- [ ] `npm run lint` (docs don't lint, but keep the tree clean)

---

## Task 16 — Final verification + report

**Steps**
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test` (api / miniapp / shared)
- [ ] `npm run test:integration --workspace=apps/api`
- [ ] `npm run build`
- [ ] Report: files changed; the verify commands and their real outputs; per-route chunk sizes vs Phase 12; deviations (fix `roster/audit` doc shape; native select vs Radix select if chosen; any `/library` references found beyond the two known); and confirm **Phase 15 not started** and **nothing committed**.

---

## Requirement → task coverage

| Requirement (spec) | Tasks |
|---|---|
| `GET /api/content/:id`, `GET /api/roster/:id`, `accessReviewPending` | 1 |
| Shared primitives (tabs/dialog/sheet/select + SearchInput/FilterBar/ConfirmDialog/LoadMore/ListState) | 2, 5 |
| API client, XHR upload, channel link | 3 |
| Back button | 4, 14 |
| Data hooks + invalidation + capped poll | 6 |
| `/library`→`/content`, lazy routes, composer routes | 7 |
| Roster Scholars / Access review / Audit | 8, 9, 10 |
| Content list / detail sheet / links | 11 |
| Composer + progress + error mapping | 12 |
| Delete + ownership | 13 |
| Privacy/mobile/lazy | 7, 12, 14 |
| Docs + env | 15 |
| Verification | 0, 16 |
