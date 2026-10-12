# Phase 12 — Mini App Foundation — Design Spec

Date: 2026-10-12
Status: Implemented — verified (lint, typecheck, build, 25 unit tests across 5 files)
Depends on: Phases 5–11 (auth `/api/me`, roster/registration, bot, content, admin endpoints, jobs/notifications)

## 1. Goal

Stand up `apps/miniapp` as a real, runnable Telegram Mini App: a mobile-first React 19 + TypeScript
app with a designed token system (light + dark driven by `Telegram.WebApp.colorScheme`), a typed API
client that authenticates with Telegram `initData`, role-gated routing, an app shell with role-aware
navigation, a shared motion config, and the shared presentational primitives every later feature
screen will reuse. The `Home` screen is **wired to `GET /api/me`** and renders the signed-in user's
role, roster status, and role-specific action cards. Every other route is a designed placeholder for
its future feature phase.

This phase establishes the foundation only. It builds **no feature logic** (no registration form, no
roster edits, no content posting, no join-request review, no admin/audit actions).

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| D1 | **Telegram SDK + server state:** official `@telegram-apps/sdk-react` (v3) for `initData`/theme/viewport/back button + **TanStack Query v5** for all server state. |
| D2 | **Routing:** React Router v7 (data router, `createHashRouter`) + a single `<RequireRole roles={[...]}>` guard that reads the `/api/me` query. Hash routing is used so the static build deep-links without a server rewrite inside Telegram's webview. |
| D3 | **Shared package:** Vite alias + tsconfig `paths` map `@thd/shared` → `packages/shared/src`. No `build:shared` step needed for the miniapp; full HMR into shared. Only miniapp config changes; `api`/`bot` untouched. |
| D4 | **Testing:** Vitest + React Testing Library + jsdom. API mocked at the module boundary (`vi.mock('@/lib/api')`). Covers guard behavior, primitives, the client's header logic, and the Home screen's three states. No E2E. |
| D5 | **Scope boundary:** app shell + role-aware nav + primitives + a **wired role-aware Home**. All other routes are designed "coming soon" placeholders. |
| D6 | **Auth header:** the client sends `Authorization: tma <initData>` to match `apps/api/src/middleware/auth.ts`. When running outside Telegram against a dev API with `AUTH_MOCK_ENABLED=true`, it sends `x-mock-user: {"id":…,"firstName":…}` from `VITE_MOCK_USER` instead. |
| D7 | **Architecture:** config-driven shell. One route/nav module is the single source of truth for `{ path, screen, roles, nav }`; the router and the nav both read it, so guards and visible links can never drift. |
| D8 | **Styling:** Tailwind v4 (`@tailwindcss/vite`, CSS-first `@theme`) + shadcn/ui tokens, hand-defined as CSS variables. No hardcoded hex in components. |
| D9 | **Motion:** one shared `transitions.ts` config; Framer Motion used only for route transitions, initial list stagger, and confirm/success moments — never on every hover/re-render. |
| D10 | **Mock data is not shipped:** the Home screen always calls the real `/api/me`; there is no fake-data path in production code. |

## 3. Design direction (UI/UX Pro Max + `ui-context.md`)

Reviewed with the UI/UX Pro Max skill and reconciled with `docs/context/ui-context.md` (governing):

- **Style:** *Swiss Modernism 2.0* — strict spacing scale, mathematical layout, strong type hierarchy,
  high contrast, minimal decoration, a **single accent**. (The generic product search returned
  "Vibrant & Block-based / cyan"; rejected as wrong for a calm, credible academic tool.)
- **Color:** one deliberate **institutional blue** (`--primary` = `#1C4E80` light / `#4E86C4` dark) —
  deliberately **not** Tailwind's raw `blue-500`. Blue accents; neutrals carry the surfaces.
  Semantic `success` / `warning` / `destructive` are distinct hues so role-critical states
  ("declined", "withdrawn", "flagged") are never confused with navigation.
- **Type:** the skill suggested Crimson Pro + Atkinson Hyperlegible, but `ui-context.md` explicitly
  blesses the **system UI stack** for a fast, Telegram-native Mini App and warns on latency. The
  system stack is used as the single typeface; the serif option is noted as a possible future brand
  layer, not adopted now.
- **Layout:** mobile-first, `viewport-fit=cover`, safe-area insets respected; bottom navigation
  capped at 5 items; generous-but-efficient spacing on Tailwind's scale.

21st.dev MCP was used for layout starting points (referenced, not vendored): Bottom Nav Bar (id
8343), Empty Styled (id 30195), Shapes Skeleton (id 29863).

## 4. Token system (`src/index.css`)

Light (`:root`) and dark (`.dark`) define the same variable names. Tailwind v4 `@theme inline` maps
them to utilities (`bg-background`, `text-primary-foreground`, `bg-success`, …).

| Token | Light | Dark |
|---|---|---|
| `--background` / `--foreground` | `#F7F9FC` / `#0F172A` | `#0B1220` / `#E6EAF2` |
| `--card` / `--card-foreground` | `#FFFFFF` / `#0F172A` | `#111A2B` / `#E6EAF2` |
| `--primary` / `--primary-foreground` | `#1C4E80` / `#FFFFFF` | `#4E86C4` / `#08111F` |
| `--secondary` / `--secondary-foreground` | `#E9EFF6` / `#1C4E80` | `#1A2436` / `#CBD5E1` |
| `--muted` / `--muted-foreground` | `#EEF2F7` / `#5A6B7E` | `#1A2436` / `#93A2B5` |
| `--accent` / `--accent-foreground` | `#E9EFF6` / `#163E66` | `#1E2A3E` / `#E6EAF2` |
| `--destructive` / `--destructive-foreground` | `#C0392B` / `#FFFFFF` | `#E06C6C` / `#1A0F0F` |
| `--success` / `--success-foreground` | `#1E8E5A` / `#FFFFFF` | `#43C08D` / `#06231A` |
| `--warning` / `--warning-foreground` | `#B7791F` / `#FFFFFF` | `#E0B25C` / `#241A06` |
| `--border` / `--input` / `--ring` | `#DCE3EC` / `#DCE3EC` / `#1C4E80` | `#22304A` / `#22304A` / `#4E86C4` |

`--radius: 0.75rem`. Font: system sans stack (`--font-sans`), system mono for code. The active theme
is `colorScheme` from Telegram; the shell applies `.dark` on `<html>` and also honors
`prefers-color-scheme` when no Telegram context exists (plain browser dev).

## 4b. Tailwind integration

Tailwind v4, no `tailwind.config.js`. `src/index.css` does `@import "tailwindcss";`, declares the
tokens in `:root`/`.dark`, and exposes them via `@theme inline { --color-*: var(--*) … }` so shadcn
class names (`bg-primary`, `text-muted-foreground`, `border-input`, `ring-ring`) resolve. shadcn is
configured through `components.json` pointed at `src/index.css`; components are added with the CLI
into `components/ui/`.

## 5. File structure (`apps/miniapp`)

```
apps/miniapp/
  index.html
  package.json
  tsconfig.json  tsconfig.node.json
  vite.config.ts  components.json  .env.example
  src/
    main.tsx  App.tsx  index.css  vite-env.d.ts
    lib/        utils.ts  api.ts  telegram.ts  query-client.ts  errors.ts
    hooks/      use-telegram.ts  use-me.ts  use-role.ts
    motion/     transitions.ts
    router/     routes.tsx   (single source of truth)  index.tsx (createHashRouter)
    components/
      ui/       (shadcn: button, card, badge, skeleton, separator, avatar…)
      shared/   RoleBadge  StatusPill  EmptyState  ErrorState  LoadingSkeletons
                AccessDenied  AppHeader  BottomNav  PageTransition
      layout/   AppShell  RequireRole
    features/
      home/     HomeScreen.tsx  components/{ProfileCard,RoleActionCard,StatusStrip}.tsx
      placeholder/ PlaceholderScreen.tsx   (shared designed "coming soon" screen)
    test/       setup.ts
```

`lib/` = cross-feature infrastructure. `components/shared` = primitives reused in ≥2 features.
`features/*` own their screen + subcomponents.

## 6. Data layer

### 6.1 `lib/api.ts` (typed, single fetch chokepoint)
- `apiFetch<T>(path, { method, body, signal })` → prepends `VITE_API_BASE_URL`, attaches auth
  (D6), parses the `{ error: { code, message } }` envelope into a typed `ApiError`.
- `getMe(): Promise<UserStatusResponse>` — `GET /me`.
- Types come from `@thd/shared` (`UserStatusResponse`, `User`, `RosterEntry`, `Role`,
  `RosterStatus`), so the client can't drift from the server contract.
- Throws `ApiError { status, code, message }`; `401` is surfaced distinctly (auth failure vs.
  network failure) so the shell can render the right state.

### 6.2 `lib/telegram.ts`
- Reads `initData` from the SDK; falls back to `VITE_MOCK_USER` (JSON) outside Telegram.
- Exposes `isTelegramEnvironment()` and `getInitData()`. No React here.

### 6.3 `hooks`
- `useTelegram()` — wraps SDK launch params / theme / viewport; exposes `{ user, colorScheme, ... }`.
- `useMe()` — `useQuery({ queryKey: ['me'], queryFn: getMe, retry: false })`; the shell's single
  source of identity + role.
- `useRole()` — derives `{ role, isScholar, isFaculty, isRegistrar, isAdmin, hasRole(...) }` from `useMe()`.

### 6.4 Query client
`lib/query-client.ts` — one `QueryClient` (staleTime ~30s, `retry: 1`, no refetch on window focus —
Mini Apps don't behave like a browser tab).

## 7. Routing, shell, and role gating

### 7.1 `router/routes.tsx` — the single source of truth
Each entry: `{ path, element, roles: Role[], nav?: { label, icon, order }, title }`. Consumed by both
the router (to wrap in `<RequireRole>`) and `BottomNav`/`AppHeader` (to filter visible items).

Initial routes: `Home` (all roles), plus designed placeholders — `Registration` (Scholar, when not
yet on roster), `Roster` (Registrar, Admin), `Content` (all roles, view), `Join Requests`
(Registrar, Admin), `Members` (Admin), `Audit Log` (Admin), `Settings` (Admin).

### 7.2 `RequireRole`
Reads `useMe()`: while loading → skeleton; on unauthenticated/`401` → `UnauthorizedScreen`; on a role
not in `roles` → `AccessDenied`. It never decides *what* data a role may fetch — the API already
enforces RBAC; the guard only keeps the UI honest.

### 7.3 `AppShell`
Header (`AppHeader`: screen title + `RoleBadge` + Telegram user) + animated route content
(`PageTransition`) + `BottomNav` (role-filtered, ≤5 items, icon + label, active indicator, safe-area
padding). Back button wired to Telegram's native BackButton.

## 8. Shared primitives

- **`RoleBadge`** — color-coded per role (Scholar / Faculty / Registrar / Admin), legible at a glance.
- **`StatusPill`** — one component covering roster status, join-request status, and content-status
  shapes, mapped through the semantic palette.
- **`EmptyState`** — icon + title + description + optional action; every list view uses it.
- **`LoadingSkeletons`** — card/list/screen skeletons (shimmer), used over spinners where layout is
  predictable.
- **`ErrorState`** / **`AccessDenied`** / **`UnauthorizedScreen`** — deliberate dead-ends, no raw text.
- **`PageTransition`** — applies the shared motion config.

## 9. Home screen (the one wired screen)

Calls `useMe()` and renders three states:
1. **Loading** — skeleton matching the final layout.
2. **Error** — `ErrorState` with retry (`refetch`).
3. **Loaded** — `ProfileCard` (name, `RoleBadge`, cohort/program from roster), a `StatusStrip`
   (`StatusPill` for roster status + access-review flag), and role-specific `RoleActionCard`s that
   link to the (placeholder) feature routes. No fabricated numbers — only data from `/api/me`.

## 10. Motion

`motion/transitions.ts` exports the shared `pageTransition`, `listStagger`, and `confirmPop` variants
(150–250 ms, consistent easing). Framer Motion wraps only: route changes, first render of a data
list, and confirm/success moments. `prefers-reduced-motion` is respected via
`useReducedMotion()`.

## 11. Config & tooling changes

- `apps/miniapp/package.json`: real deps + scripts `dev`, `build`, `preview`, `test`, `typecheck`.
- `apps/miniapp/vite.config.ts`: `@vitejs/plugin-react` + `@tailwindcss/vite`; aliases `@` → `src`,
  `@thd/shared` → `../../packages/shared/src`; `server.port` 5173; Vitest `test` block (jsdom,
  setup file).
- `apps/miniapp/tsconfig.json`: `paths` (`@/*`, `@thd/shared`), `types` (`vite/client`,
  `vitest/globals`, `node`); `tsconfig.node.json` for the Vite config.
- Root `eslint.config.mjs`: add React-specific rules (`eslint-plugin-react-hooks`) scoped to
  `apps/miniapp/**` only (`code-standards.md`: "extended per app only where genuinely needed").
- `apps/miniapp/.env.example`: `VITE_API_BASE_URL`, `VITE_MOCK_USER`.
- Docs: extend `docs/context/file-structure.md` with the miniapp tree and add miniapp run
  instructions to the root `README.md`. Note that the API's `MINIAPP_ORIGIN` must include the dev
  origin (default `http://localhost:5173`).
- Root `npm run build` already fans out with `--if-present`; `npm test`/`typecheck` pick up the new
  workspace scripts automatically.

## 12. Testing plan

- `lib/api.test.ts` — sends `Authorization: tma …` with initData, `x-mock-user` in mock mode, parses
  the error envelope, maps `401`.
- `components/shared/RoleBadge.test.tsx`, `StatusPill.test.tsx` — render the right label/color per
  value.
- `components/layout/RequireRole.test.tsx` — loading skeleton; allowed role renders children; other
  role renders `AccessDenied`; unauth renders `UnauthorizedScreen`.
- `features/home/HomeScreen.test.tsx` — loading → loaded (with a mocked `getMe`) shows name + role +
  status; error → retry path.

## 12b. `apps/miniapp/.env.example`

```
VITE_API_BASE_URL=http://localhost:3000/api
# Dev only — pairs with the API's AUTH_MOCK_ENABLED=true. JSON, or empty when inside Telegram.
VITE_MOCK_USER=
```

## 13. Deviations / notes to report

- Added `eslint-plugin-react-hooks@7.1.1` to the **root** dev dependencies and wired its flat
  `recommended-latest` config, scoped to `apps/miniapp/**/*.{ts,tsx}` only, per `code-standards.md`.
  Full-repo `npm run lint` stays clean with the hook rules active.
- Hash routing chosen over browser routing (static-host deep-link friendliness inside Telegram).
- System font stack chosen over the skill's academic serif pairing, per `ui-context.md`'s
  performance/native guidance; recorded here as a deliberate trade-off.
- shadcn primitives (`button`, `card`, `badge`, `skeleton`, `separator`) were **vendored** in the
  canonical shadcn form rather than pulled with the CLI, so the build is offline/reproducible. No
  `avatar` yet (the header/profile use initials; `avatar` arrives with the roster UI).
- `@telegram-apps/sdk-react` (3.3.9) is used as chosen, but note the upstream packages are
  deprecated in favour of the `@tma.js/*` rename. Pinned and working; migration is a future task.
- File-name deltas from §5: the Home subcomponents are `ProfileCard.tsx`, `StatusCard.tsx`,
  `RoleActions.tsx` (not `RoleActionCard`/`StatusStrip`); a single `tsconfig.json` is used (no
  `tsconfig.node.json` — `vite.config.ts` is covered by the main `include`); `test/render.tsx`
  (a QueryClient + Router test wrapper) was added alongside `test/setup.ts`.
- Tests realised: `lib/api.test.ts`, `lib/telegram.test.ts`, `router/routes.test.ts`,
  `components/layout/RequireRole.test.tsx`, `features/home/HomeScreen.test.tsx` (25 tests). The
  RoleBadge/StatusPill label+colour mapping is asserted through the HomeScreen/router tests rather
  than dedicated component test files.
- `hooks/use-telegram.ts` exposes three focused hooks (`useTelegramUser`, `useColorScheme`,
  `useTheme`) instead of one god-hook. `useRole()` returns the `Role`; a companion `useHasRole(...)`
  covers the flag checks.
- `useMe()` relies on the shared query-client defaults (`retry: 1`) rather than overriding with
  `retry: false`.
- Vite config sets `build.sourcemap: true`; expected, harmless `chunk > 500 kB` warning from the
  initial (un-split) bundle — code-splitting is a later-phase concern.

## 14. Non-goals

Feature logic (registration, roster edits, content posting, join-request review, admin actions,
audit browsing, settings writes); notification inbox/read-state; offline/PWA; E2E tests; server-side
rendering.
