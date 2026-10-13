# Phase 13 — Mini App Registration Feature — Design Spec

Date: 2026-10-12
Status: Approved (proceed-to-implement; decisions per §13)
Depends on: Phase 6 (`POST /api/registrations`, shared `registrationPayloadSchema`), Phase 12 (Mini App shell, router, tokens, primitives, `useMe`/`RequireRole`)
Consumers: `apps/miniapp` (primary), `packages/shared` (one additive constant).
Source of truth: `docs/context/workflows.md` #1, `docs/context/api-reference.md` §Registration, `docs/context/ui-context.md`, `docs/context/code-standards.md`.

## 1. Goal

Implement the **registration feature** in the Mini App (`apps/miniapp`) — the one screen the whole
product's critical path depends on. A Scholar opens it, fills a form validated by the **shared** zod
schema, auto-fills their Telegram username, accepts the declaration, submits, and receives a
**result screen** (approved or declined with the server's reason and a Registrar contact) with a
purposeful success animation on approval.

This phase is **Mini App only** — no API, database, migration, or bot changes. It consumes the
existing contract: `POST /api/registrations` → `201 { decision: 'approved' | 'declined', reason:
string | null }` and `GET /api/me` (`UserStatusResponse`), plus `registrationPayloadSchema` from
`@thd/shared`.

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| D1 | **Form engine:** `react-hook-form` + `@hookform/resolvers/zod` (`zodResolver`) with the **shared** `registrationPayloadSchema`. No form-specific schema; the shared messages are the inline errors. |
| D2 | **Registrar contact:** a miniapp env var `VITE_REGISTRAR_CONTACT` (a `@username`, `mailto:` or `tel:`), rendered as a tappable link. No API/DB/settings change. |
| D3 | **Already-active users:** if `me.roster?.status === 'active'`, show an "already registered" card instead of the form (with an "Update my details" affordance that reveals the form). No blind re-submission. |
| D4 | **Server is authoritative on the ID pattern.** The client validates with the shared *default* pattern (`^DIBI-THD-\d{4}$`); the admin-configured `settings.registrationIdPattern` is enforced server-side and its `400 VALIDATION_ERROR` `details` are mapped back to fields inline. |
| D5 | **Vendored primitives, no new Radix deps:** add `components/ui/{input,label,checkbox,form,alert}.tsx` in the repo's hand-vendored style. `label` and `checkbox` wrap native elements (the checkbox is a styled native input with a ≥44px target); `alert` is the form-level banner (variants `default`/`warning`/`destructive`). |
| D6 | **`ApiError` carries `details`.** `lib/errors.ts` gains optional `details?: unknown`; `lib/api.ts` attaches the parsed error envelope so callers can read `details` (flattened zod). Small, general improvement. |
| D7 | **Result is client state, not a route.** `RegistrationScreen` holds `form | result` in React state; "Try again" returns to a prefilled form. No result persistence across reload (acceptable for a Mini App). |
| D8 | **Motion:** one new `successPop` variant + result variants in `motion/transitions.ts`; success animation only on approval, reduced-motion aware. |
| D9 | **Route stays role-open.** `/registration` renders for any authenticated role via `RequireRole roles={[...ROLES]}` (new shared `ROLES` constant), so the guard owns the loading/401/error states. |
| D10 | **Blast radius:** `RoleActions`/`HomeScreen` are unchanged — the screen handles the active case gracefully, so the Home link remains a valid destination. |

## 3. Design direction (UI/UX Pro Max + `ui-context.md`)

UI/UX Pro Max was run before designing (its `--design-system` step). Its palette (teal) and
typography (EB Garamond / Crimson Text) suggestions are **rejected** — Phase 12 locked the blue token
set and the system font stack, and `ui-context.md` forbids cross-screen token drift. Its **UX rules**
are adopted:

- **Forms:** validate on blur (not submit-only); visible labels (never placeholder-only); error text
  adjacent to the field; errors announced (`role="alert"`).
- **Feedback:** show loading → success/failure for async submit; skeletons over spinners for
  predictable layout.
- **Touch:** ≥44px interactive targets; clear disabled state; pressed feedback without layout shift.
- **Motion:** 150–300 ms, native easing; a success moment is appropriate here (infrequent, meaningful);
  `prefers-reduced-motion` respected.
- **App polish checklist** (`references/pro-rules.md`) run at delivery: vector icons only (Lucide),
  consistent icon sizing, semantic tokens (no ad-hoc hex), light/dark contrast checked independently,
  safe areas respected, 375px verified.
- Style stays within the Phase 12 direction: **Swiss Modernism 2.0**, blue accent, system type,
  mobile-first.

## 4. Screen state model

`RegistrationScreen` (feature orchestrator) renders exactly one of three views:

| View | Condition | Content |
|---|---|---|
| `already` | `me.roster?.status === 'active'` | `AlreadyRegisteredCard` — registration ID, cohort year, program track, supervisor, `StatusPill` (active); "Go to Home" CTA; "Update my details" link → switches to `form`. |
| `form` | default; also the "Try again" target | `RegistrationForm` (prefilled). On `201` → `result`. |
| `result` | after a `201` response | `RegistrationResult` with `{ decision, reason }`. |

Gate states (identity loading / `401` / error) are owned by `RequireRole` (D9) — the screen is only
rendered once `me` has resolved, so it may assume `data` exists.

`roster` null, `pending`, `graduated`, or `withdrawn` → `form` (the server decides; a pending record
declines with `status: pending`).

## 5. Form specification (`RegistrationForm`)

Fields in `workflows.md` #1 step 3 order. All validated by `registrationPayloadSchema`
(`zodResolver`) on **blur** and on submit.

| # | Field | Control | Prefill | Shared validation messages |
|---|-------|---------|---------|----------------------------|
| 1 | Full name | `Input text` (autoComplete `name`) | `me.user.fullName` when non-empty | required; ≥2; ≤200 |
| 2 | DIBI Registration ID | `Input text` (`autoCapitalize="characters"`, `autoComplete="off"`), helper "e.g. DIBI-THD-0042" | — | required; ≤50; "does not match the required format" |
| 3 | Cohort year | `Input` `type="number"` `inputMode="numeric"`, registered with `valueAsNumber` | — | required; whole number; 1900–2100 |
| 4 | Email | `Input type="email"` `inputMode="email"` | — | "Enter a valid email address" |
| 5 | Telegram username | `Input text` (autoComplete `username`), helper "editable — used to reach you" | `me.user.telegramUsername ?? telegramUser.username` (prefixed `@` display) | required; `/^@?[A-Za-z0-9_]{5,32}$/` |
| 6 | Program track | `Input text` | — | required; ≤200 |
| 7 | Supervisor (optional) | `Input text` | — | optional; non-empty if provided; ≤200 |
| 8 | Declaration | `Checkbox` + label (native, ≥44px row) | unchecked | literal `true` → "You must accept the declaration to register" |

**Behaviour**

- **Submission payload** (built from the resolver's parsed output, so values are trimmed):
  `{ fullName, registrationId, cohortYear, email, telegramUsername, programTrack, declarationAccepted: true }`
  plus `supervisorName` **only when non-empty** (omitted otherwise, so the optional field never sends
  `''` and trips `min(1)`).
- **Submit state:** primary `Button` `disabled` while pending, showing a spinner + "Submitting…";
  the form stays visible. Double-submit is impossible (`disabled` + RHF `isSubmitting`).
- **Declaration gate:** an unchecked declaration fails client-side and **no request is made**.
- **Fill state:** a top-of-form `Alert` (variant `warning` for 429, `destructive` for 400/network) is the home for non-field (submit) errors.

## 6. Error handling matrix

| Condition | Detection | UI |
|---|---|---|
| Field invalid (client) | `zodResolver`, on blur/submit | `FormMessage` under the field, `role="alert"`, `aria-describedby`; input `aria-invalid`, destructive border |
| Config-pattern mismatch | `201`? no — `400 VALIDATION_ERROR` with `details.fieldErrors` | Map `details` back via RHF `setError` (per field) + any `details.formErrors` to the form-level alert |
| `400` without readable `details` | `ApiError.status === 400` | Form-level alert with `ApiError.message` |
| Rate limited | `ApiError.status === 429` (`RATE_LIMITED`) | Form-level **warning** alert: "Too many attempts — please wait a few minutes and try again." Form retained. |
| Network / offline | `ApiError.status === 0` (`NETWORK_ERROR`) | Form-level alert: connection message + Retry (re-submit). |
| Unauthenticated | `ApiError` `401` | `UnauthorizedScreen` (reused) |
| Declined decision | `201 { decision: 'declined', reason }` | `result` view, declined variant |
| Approved decision | `201 { decision: 'approved' }` | `result` view, approved variant; invalidate `['me']` |

## 7. Result screens (`RegistrationResult`)

- **Approved:** `SuccessMark` (SVG check, spring scale-in + one soft ring pulse — the sanctioned
  "infrequent and meaningful" motion), heading **"You're approved"**. Body: the match succeeded and the
  bot is sending the channel invite — check Telegram chats. CTAs: **"Go to Home"** (primary, calls
  `queryClient.invalidateQueries({ queryKey: ['me'] })` then navigates) and a secondary **"Open
  Telegram"** that returns to the chat via the SDK's `openTelegramLink('https://t.me/')` (rendered only
  when a Telegram context exists).
  `aria-live="polite"` on the heading.
- **Declined:** calm fade/slide (**no** celebratory motion), warning/destructive tone, icon `XCircle`.
  Heading **"We couldn't approve this registration"**. The server `reason` in a readable block, then
  copy mirroring the bot (`apps/bot/src/templates/decline.ts`): "This usually means your DIBI
  Registration ID wasn't found on the Registrar's roster, or your record isn't active." The **Registrar
  contact** (`VITE_REGISTRAR_CONTACT`) rendered as a link (`https://t.me/<handle>` for `@handle`,
  otherwise used verbatim). CTAs: **"Try again"** (→ prefilled `form`) and "Back to Home".
- If `VITE_REGISTRAR_CONTACT` is unset, the contact line is omitted (copy degrades gracefully).

## 8. Integration changes

- `packages/shared/src/types/enums.ts`: add
  `export const ROLES: readonly Role[] = ['scholar', 'faculty', 'registrar', 'admin']` (+ one small test).
  `schemas/users.ts` currently inlines an equivalent `ROLE_VALUES`; it will be re-pointed at `ROLES`
  (`satisfies readonly Role[]`) so the role list lives in exactly one place.
- `apps/miniapp/src/lib/errors.ts`: `ApiError` gains `readonly details?: unknown`.
- `apps/miniapp/src/lib/api.ts`: `apiFetch` attaches `envelope.error.details` to the thrown `ApiError`;
  add `postRegistration(payload: RegistrationPayload): Promise<RegistrationResult>` (POST `/registrations`).
- `apps/miniapp/src/router/routes.tsx`: `/registration` element → `<RegistrationScreen />`,
  `roles: [...ROLES]`, `showInNav: false`, label stays "Registration".
- `apps/miniapp/src/motion/transitions.ts`: add `successPop` and result variants.
- No change to `RoleActions`/`HomeScreen` (D10).

## 9. New files & dependencies

```
apps/miniapp/src/features/registration/
  RegistrationScreen.tsx          # state machine + useMe branch
  RegistrationForm.tsx            # RHF form
  AlreadyRegisteredCard.tsx
  RegistrationResult.tsx          # approved + declined
  SuccessMark.tsx                 # animated check
  RegistrationScreen.test.tsx
  RegistrationForm.test.tsx
apps/miniapp/src/components/ui/
  input.tsx  label.tsx  checkbox.tsx  form.tsx  alert.tsx   # vendored, no new Radix
```

**New dependencies:** `react-hook-form`, `@hookform/resolvers`, and an explicit `zod` (already in the
workspace via `@thd/shared`; declaring it prevents a phantom dep). No new Radix packages.

## 10. Testing plan (Vitest + RTL, `vi.mock('@/lib/api')`)

- `RegistrationForm.test.tsx`
  - renders all 8 fields with accessible labels; Telegram username prefilled from `me`.
  - blur on an invalid field shows the exact shared message (e.g. "Full name is required",
    "Registration ID does not match the required format").
  - unchecked declaration blocks submit and **no** `postRegistration` call is made.
  - valid submit calls `postRegistration` with the exact payload (trimmed; `supervisorName` omitted when
    blank); button shows "Submitting…" and is disabled while pending.
  - `400` with `details.fieldErrors` → the message appears inline on that field.
  - `429` → warning alert, form retained, no result view.
  - `status 0` network error → alert + Retry re-submits.
- `RegistrationScreen.test.tsx`
  - `roster.status === 'active'` → already-registered card, no form; "Update my details" reveals the form.
  - `roster === null` → form.
  - approved `201` → approved result ("You're approved") and `['me']` invalidated.
  - declined `201` → declined result showing `reason` and the Registrar contact link (env stubbed).
- `lib/api.test.ts` (additions): `ApiError.details` is populated from the envelope; `postRegistration`
  posts to `/registrations` with auth headers.
- `router/routes.test.ts`: `/registration` is wired to `RegistrationScreen` (not the placeholder).
- `packages/shared` enums test: `ROLES` contains the four roles.

## 11. Narrow-width visual verification (§ step 5 of `ui-context.md`)

A **throwaway** harness (in `/tmp`, not committed):

1. A tiny Node HTTP mock API that serves `GET /api/me` (Scholars, `roster: null`) and
   `POST /api/registrations` (approved for a chosen ID, declined otherwise), CORS-enabled.
2. `vite build` with `VITE_API_BASE_URL=http://127.0.0.1:3000/api`, `VITE_MOCK_USER=…`,
   `VITE_REGISTRAR_CONTACT=@thd_registrar`; serve with `vite preview`.
3. Headless `google-chrome` driven over the DevTools Protocol via Node 24's global `WebSocket`
   (zero new deps): device-metrics override **375×812**, capture PNGs of — the empty form, a
   validation-error state, the declined result, and the approved result.

Screenshots are reported (paths in `/tmp/opencode`), not committed. Automated RTL tests (§10) cover
the state logic.

## 12. Config & docs changes

- `apps/miniapp/.env.example`: add `VITE_REGISTRAR_CONTACT=@thd_registrar` (dev placeholder).
- `README.md`: add the `VITE_REGISTRAR_CONTACT` row to the miniapp env table.
- `docs/context/file-structure.md`: extend the miniapp tree with `features/registration/` and the five
  new `components/ui/` files.
- No change to `docs/context/api-reference.md` (no API change).

## 13. Deviations / notes to report

- **Declaration binding:** the shared schema pins `declarationAccepted` to `literal(true)`, which a
  checkbox cannot bind to. The form `extend`s the shared schema **only** to make it a boolean that must
  be `true` (same message); every other field rule and message comes straight from the shared schema, and
  the outgoing payload sets `declarationAccepted: true` explicitly.
- **New dependencies:** `react-hook-form`, `@hookform/resolvers`, explicit `zod`. Radix `label`/`checkbox`
  intentionally avoided by hand-vendoring native-element primitives.
- **`ApiError.details`** added and populated by `apiFetch` (a change to two existing `lib` files).
- **Shared `ROLES` constant** added to `packages/shared` (the only shared change).
- **Client validates the default ID pattern**, not the admin-configured one (unreadable by Scholars —
  `GET /api/settings` is Admin-only). The configured pattern's `400` is mapped back inline. Explicit,
  documented limitation.
- **`VITE_REGISTRAR_CONTACT` is deploy config**, not an admin-managed setting (deliberate scope choice).
- **`RoleActions`/Home unchanged** — the screen adapts to the active-roster case instead.
- **Bundle:** the Vite `>500 kB` chunk warning from Phase 12 persists (pre-existing, not addressed here).

## 14. Out of scope

- Any API/DB/bot change; fetching/listing past `join_requests` or decline history; the invite-link flow
  itself (the bot owns it); roster/content/admin/audit screens; offline/PWA; E2E in CI.
