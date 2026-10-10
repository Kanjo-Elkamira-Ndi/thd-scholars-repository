# File Structure

This project is a **monorepo** using npm/pnpm workspaces. Three deployable apps (`api`, `bot`, `miniapp`) share a `packages/shared` library for types, constants, and validation schemas, so the three never drift out of sync on what a "role" or a "registration payload" looks like.

```
thd-scholars-repository/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── auth/                # framework-free initData verifier/signer + constant-time compare
│   │   │   ├── config/              # env loading, constants
│   │   │   ├── controllers/         # thin HTTP handlers, one file per resource (me, registrations, roster)
│   │   │   ├── services/            # business logic (registration, roster, notifications, content, roles)
│   │   │   ├── repositories/        # raw `pg` query modules, one per table (users, roster, join-requests, audit-logs, settings, ...)
│   │   │   ├── middleware/          # auth (initData verify), RBAC guard, internal token, registration rate limit, error handler
│   │   │   ├── routes/              # express routers, one per resource, mounted in app.ts
│   │   │   ├── validators/          # zod schemas for request bodies (imports from packages/shared where shared)
│   │   │   ├── types/               # API-only types
│   │   │   ├── utils/               # pure helper functions
│   │   │   ├── jobs/                # node-cron jobs (quarterly audit, graduation review)
│   │   │   ├── db/
│   │   │   │   ├── migrations/      # 0001_init_users_roster.sql ... 0007_roster_access_review.sql (sequential, never edited after merge)
│   │   │   │   ├── seeds/           # dev-only seed data (dev-users.ts fixtures, seed-users.ts runner)
│   │   │   │   ├── testing/         # test-DB harness: test-database.ts (create/migrate/reset), global-setup.ts, fixtures.ts
│   │   │   │   ├── migrate.ts       # migration runner (tracks applied files in schema_migrations)
│   │   │   │   ├── transaction.ts   # Db type + withTransaction(fn) (pool-or-client, commit/rollback)
│   │   │   │   └── pool.ts          # pg Pool instance, single source
│   │   │   ├── app.ts               # express app assembly (middleware + routes)
│   │   │   └── server.ts            # entrypoint, listens on PORT
│   │   ├── scripts/                 # tsx dev scripts (make-init-data.ts signs dev initData)
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   ├── .env.example
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── bot/
│   │   ├── src/
│   │   │   ├── commands/            # /start, /help, /mystatus
│   │   │   ├── handlers/            # chat_join_request handler, callback_query handler
│   │   │   ├── templates/           # message template builders (approval, decline, content post)
│   │   │   ├── services/            # thin wrappers calling the API service
│   │   │   ├── middleware/          # logging, error handling
│   │   │   ├── bot.ts               # Telegraf instance assembly
│   │   │   └── index.ts             # entrypoint (polling in dev, webhook in prod)
│   │   ├── .env.example
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── miniapp/
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/              # shadcn-generated primitives — do not hand-edit generated internals, extend via props/wrappers
│       │   │   └── shared/          # app-specific reusable components (RoleBadge, StatusPill, EmptyState, etc.)
│       │   ├── features/
│       │   │   ├── registration/    # form, validation, submit flow
│       │   │   ├── roster/          # registrar views
│       │   │   ├── content/         # browse/search + faculty post composer
│       │   │   ├── admin/           # role management, audit log viewer, settings
│       │   │   └── dashboard/       # role-aware landing view
│       │   ├── hooks/               # useTelegramInitData, useRole, useApi, etc.
│       │   ├── lib/                 # api client, telegram SDK wrapper, utils
│       │   ├── routes/              # route definitions (if using a router) or pages/
│       │   ├── styles/              # tailwind config entry, design tokens
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── public/
│       ├── index.html
│       ├── tailwind.config.ts
│       ├── components.json          # shadcn CLI config
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/               # Role, UserStatus, ContentFormat, etc.
│       │   ├── constants/           # discipline tags, format tags, regex patterns
│       │   └── schemas/             # zod schemas used by both api validators and miniapp forms
│       ├── tsconfig.json
│       └── package.json
│
├── docs/
│   └── context/                     # this context pack lives here — the 10 md files
│       ├── api-reference.md
│       ├── architecture.md
│       ├── code-standards.md
│       ├── database-schema.md
│       ├── developer-map.md
│       ├── file-structure.md
│       ├── project-overview.md
│       ├── security.md
│       ├── ui-context.md
│       └── workflows.md
│
├── .github/
│   └── workflows/                   # CI: lint, typecheck, test on PR
│
├── package.json                     # workspace root, defines workspaces array
├── package-lock.json                # npm lockfile — commit it
├── tsconfig.base.json               # shared compiler options (strict), extended by each app
├── eslint.config.mjs                # shared ESLint flat config (typescript-eslint + Prettier)
├── .prettierrc.json                 # shared Prettier config
├── .prettierignore
├── .editorconfig
├── .gitignore
└── README.md
```

**API dev scripts:** `npm run seed --workspace=apps/api` applies the `src/db/seeds` fixtures (one user per role; refuses to run with `NODE_ENV=production`), and `npm run make:init-data --workspace=apps/api -- --role=<role>` prints a signed `Authorization: tma <initData>` header for testing the API locally. Unit tests (`vitest`) live next to the code as `*.test.ts` and run with `npm test` (DB-free). Integration tests are colocated as `*.int.test.ts` and run with `npm run test:integration --workspace=apps/api` against a disposable database derived from `DATABASE_URL` (a `_test` suffix is appended, then created/migrated/reset per run).

## Conventions for this structure
- **One table, one repository file.** `repositories/roster.repository.ts` only talks to `roster`. If a query needs a join, it still lives in the repository of the "owning" resource for that operation.
- **Controllers stay thin.** A controller parses the request, calls a service, returns the response. No business logic in controllers.
- **Services never import `express`.** Keeps business logic testable and reusable from the bot's internal calls if ever needed.
- **Migrations are append-only.** Never edit a merged migration file — write a new one. See `database-schema.md`.
- **`packages/shared` is the contract.** If the bot, API, and Mini App all need to agree on what a `Role` enum contains, it is defined once in `packages/shared/src/types` and imported everywhere else.
- **shadcn components are generated, not authored.** Add new ones via the shadcn CLI into `components/ui/`; app-specific composition happens in `components/shared/` or inside `features/*`.
