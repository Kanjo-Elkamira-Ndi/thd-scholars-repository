# Code Standards

## Language & tooling baseline
- TypeScript everywhere (`api`, `bot`, `miniapp`, `packages/shared`). `strict: true` in every `tsconfig.json`.
- Node.js LTS for `api` and `bot`.
- ESLint + Prettier, shared base config at the workspace root, extended per app only where genuinely needed (e.g., React-specific rules in `miniapp`).
- No `any` without a comment explaining why it's unavoidable (e.g., a third-party type gap). Prefer `unknown` + narrowing over `any`.

## Naming conventions
- Files: `kebab-case.ts` (e.g., `roster.repository.ts`, `registration.service.ts`).
- React components: `PascalCase.tsx` (e.g., `RosterTable.tsx`).
- Types/interfaces: `PascalCase` (e.g., `RosterEntry`, `JoinRequestStatus`).
- Functions/variables: `camelCase`.
- Database columns: `snake_case` (Postgres convention) — mapped to `camelCase` at the repository boundary, never leaking `snake_case` past the repository layer into services/controllers.
- Constants/enums-as-literals: `SCREAMING_SNAKE_CASE` for true constants (`MAX_UPLOAD_SIZE_BYTES`), `camelCase` string literal unions for role/status types (matches `packages/shared` conventions).

## Backend (`api`) conventions
- **Controllers** parse/validate input, call one service method, shape the response. No direct `pg` calls, no business logic.
- **Services** contain business logic, orchestrate one or more repositories, never import `express` types.
- **Repositories** are the only place raw SQL lives. One file per table. Every exported function takes/returns typed objects, not raw `pg` row shapes (map `snake_case` → `camelCase` here).
- Every mutating service method that should be audited writes to `audit_logs` within the same database transaction as its primary write — use a transaction wrapper utility rather than two sequential un-transacted calls.
- Errors are thrown as typed `AppError` instances (`code`, `message`, `httpStatus`) and caught by a single central error-handling middleware — controllers do not individually format error responses.

## Bot (`bot`) conventions
- Handlers stay thin: parse the Telegram event, call the API (or an internal service wrapper), send the resulting message. No roster/RBAC logic duplicated here — the API already decided; the bot executes Telegram-side actions and reports back.
- Message copy lives in `templates/`, not inline in handler functions — keeps tone/wording consistent and editable without touching logic.

## Frontend (`miniapp`) conventions
- Functional components with hooks only — no class components.
- Feature-based organization (`features/registration`, `features/roster`, etc.) — a feature folder owns its own components, hooks, and API calls; shared, truly generic pieces move to `components/shared` once reused in two or more features.
- Data fetching through a thin typed API client (`lib/api.ts`) built once, not `fetch` calls scattered through components.
- Forms validated against the same `zod` schemas from `packages/shared/src/schemas` used server-side.
- shadcn components (`components/ui/`) are treated as generated/vendored code — customize via composition and Tailwind classes, not by hand-editing internals, so future shadcn CLI updates don't conflict.
- Framer Motion used deliberately, not everywhere — see `ui-context.md` for where animation is appropriate versus noise.

## Shared package (`packages/shared`) conventions
- Only truly cross-cutting types, constants, and `zod` schemas live here (roles, statuses, discipline/format tag lists, registration/content validation schemas). App-specific types stay in their own app.
- Treat this package as a contract — changing a shared type is a breaking change across three apps; check all three before merging.

## Git & commit conventions
- Conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.
- One logical change per PR where reasonably possible; migrations ship in the same PR as the code that depends on them.
- Branch naming: `feature/short-description`, `fix/short-description`.

## Testing expectations
- Services: unit tests for business logic, especially registration decisioning (match/no-match/status checks) and RBAC boundary checks.
- Repositories: integration tests against a test database (not mocked `pg` — SQL correctness matters here).
- API: integration tests hitting real routes with a test DB for the critical paths (registration, roster update, role change).
- Mini App: component tests for forms and role-gated rendering; full E2E is a nice-to-have, not a blocker for early phases.

## Documentation expectations
- Every new API endpoint gets added to `api-reference.md` in the same PR.
- Every new table or column gets added to `database-schema.md` in the same PR that adds the migration.
- A new workflow (new user journey) gets documented in `workflows.md`.
- These context docs are living documents — agents working on this codebase should update them as part of the change, not as a separate follow-up task that may never happen.

## What "good" looks like here
Code that a Registrar's status update cannot accidentally skip the audit log, that a Faculty member cannot edit another Faculty member's post by guessing an ID in the URL, and that a new developer (human or AI agent) can find the one place a given rule lives by checking the file structure above — not by grepping the whole codebase.
