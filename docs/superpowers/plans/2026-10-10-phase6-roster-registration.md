# Phase 6: Roster & Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `POST /api/registrations` and the roster endpoints (GET/POST/PATCH) per `workflows.md` #1/#2 and `api-reference.md`, with a single-transaction registration decision, audit logging, an access-review flag, a per-`telegram_id` rate limit, a repeated-failure hook, and integration tests on a test DB.

**Architecture:** Thin Express controllers → services (no Express imports) → repositories (raw `pg`, snake_case↔camelCase at the boundary) that accept an optional `Db` so multi-write operations compose inside `withTransaction`. Shared zod schemas in `packages/shared` drive validation on both ends; the registration-ID pattern is read from the `settings` table at request time.

**Tech Stack:** Node 20, Express 5, `pg`, `zod` (v4), `express-rate-limit`, Vitest, `@thd/shared`.

**Spec:** `docs/superpowers/specs/2026-10-10-phase6-roster-registration-design.md`

## Global Constraints

- Prettier: single quotes, semicolons, trailing commas (`all`), print width 100.
- ESLint: `@typescript-eslint/no-explicit-any` is an **error** — never use `any`; use `unknown`, `vi.hoisted`, or precise generics.
- `@thd/shared` resolves from `packages/shared/dist` → run `npm run build:shared` before any API typecheck/build/test.
- Migrations are append-only: the next file is `0007_roster_access_review.sql`; never edit `0001`–`0006`.
- Repository functions convert `bigint` → `Number` and snake_case → camelCase; no layer above repositories sees snake_case.
- Services never import `express`.
- Tests are colocated: unit `*.test.ts` (DB-free), integration `*.int.test.ts` (real test DB).
- Do not commit unless explicitly asked (steps that say "commit" are optional checkpoints).
- Out of scope: Bot Service calls, `/internal/*`, invite links, `GET /api/members`, settings endpoints, content endpoints.

---

### Task 1: Shared contract

**Files:**
- Modify: `packages/shared/src/types/entities.ts`
- Modify: `packages/shared/src/schemas/roster.ts`
- Modify: `packages/shared/src/schemas/registration.ts`
- Test: `packages/shared/src/schemas/roster.test.ts`, `packages/shared/src/schemas/registration.test.ts` (create)

**Interfaces:**
- Produces: `RosterEntry` gains `accessReviewPending: boolean`, `accessReviewFlaggedAt: string | null`; `RosterQuery`/`rosterQuerySchema`; `RegistrationResult`.

- [ ] **Step 1: Add `accessReviewPending`/`accessReviewFlaggedAt` to `RosterEntry`**

```ts
export interface RosterEntry {
  id: string;
  userId: string | null;
  registrationId: string;
  cohortYear: number;
  programTrack: string;
  supervisorName: string | null;
  status: RosterStatus;
  accessReviewPending: boolean;
  accessReviewFlaggedAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add `rosterQuerySchema` to `roster.ts`**

```ts
export const rosterQuerySchema = z.object({
  status: z.enum(ROSTER_STATUS_VALUES).optional(),
  cohortYear: z.coerce.number().int().min(1900).max(2100).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RosterQuery = z.infer<typeof rosterQuerySchema>;
```

- [ ] **Step 2b: Add `RegistrationResult` to `schemas/registration.ts`**

```ts
export interface RegistrationResult {
  decision: 'approved' | 'declined';
  reason: string | null;
}
```

- [ ] **Step 2: Write tests** asserting `rosterQuerySchema.parse({})` → `{ page: 1, pageSize: 20 }`, `rosterQuerySchema.parse({ cohortYear: '2025', page: '2' })` coerces to numbers, `pageSize: 101` fails, and a bad `status` fails.

- [ ] **Step 3: Run tests to confirm they fail first, then build shared**

Run: `npm run build:shared && npm run test --workspace=apps/api -- --run` (no API tests depend on these yet) then `npm --workspace=packages/shared run typecheck`
Expected: typecheck passes.

- [ ] **Step 4: Commit** (optional): `feat(shared): roster access-review fields + roster query schema`

---

### Task 2: Migration 0007, env vars, schema doc

**Files:**
- Create: `apps/api/src/db/migrations/0007_roster_access_review.sql`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/vitest.config.ts` (add the four env vars to `test.env`)
- Modify: `docs/context/database-schema.md`

**Interfaces:**
- Produces: env `REGISTRATION_RATE_LIMIT_WINDOW_SECONDS`, `REGISTRATION_RATE_LIMIT_MAX`, `REPEATED_REGISTRATION_FAILURE_THRESHOLD`, `REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS`.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE roster
  ADD COLUMN access_review_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN access_review_flagged_at timestamptz;

CREATE INDEX idx_join_requests_user_created ON join_requests (user_id, created_at);
```

- [ ] **Step 2: Add env vars** to `EnvSchema` (after `AUTH_MOCK_ENABLED`):

```ts
    REGISTRATION_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
    REGISTRATION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    REPEATED_REGISTRATION_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
    REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS: z.coerce.number().int().positive().default(86400),
```

- [ ] **Step 3: Mirror the same keys** into `apps/api/.env.example` (after `AUTH_MOCK_ENABLED`) and into `apps/api/vitest.config.ts` `test.env` (`REGISTRATION_RATE_LIMIT_MAX: '1000'`, others at defaults) so module-load env validation and unit tests stay deterministic.

- [ ] **Step 4: Docs** — in `docs/context/database-schema.md`, add the two `roster` columns to the `roster` table, and add `join_requests(user_id, created_at)` to "Indexing guidance".

- [ ] **Step 5: Verify migration applies**

Run: `npm run migrate --workspace=apps/api`
Expected: `applied 0007_roster_access_review.sql`, ends with `All migrations are up to date.`

- [ ] **Step 6: Commit** (optional) — `feat(api): migration 0007 + phase 6 env vars`

---

### Task 2b: Test-DB harness

**Files:**
- Create: `apps/api/src/db/testing/test-database.ts`
- Create: `apps/api/src/db/testing/global-setup.ts`
- Create: `apps/api/vitest.integration.config.ts`
- Modify: `apps/api/vitest.config.ts` (exclude `**/*.int.test.ts`)
- Modify: `apps/api/package.json` (add `test:integration`)

**Interfaces:**
- Produces: `resolveTestDatabaseInfo()`, `recreateTestDatabase()`, `migrateTestDatabase()`, `resetTestDatabase()`.

- [ ] **Step 1: Write `test-database.ts`**

```ts
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import pool from '../pool';

loadEnv({ path: path.join(__dirname, '..', '..', '..', '.env') });

export interface TestDbInfo {
  url: string;
  databaseName: string;
  adminUrl: string;
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

export const resolveTestDatabaseInfo = (): TestDbInfo => {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required to derive the test database');
  const parsed = new URL(base);
  const source = parsed.pathname.replace(/^\//, '');
  const databaseName = source.endsWith('_test') ? source : `${source}_test`;
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to use non-test database "${databaseName}"`);
  }
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  return { url: url.toString(), databaseName, adminUrl: adminUrl.toString() };
};

const resolveMigrationsDir = (): string => {
  const candidates = [
    path.join(__dirname, '..', 'migrations'),
    path.join(__dirname, '..', '..', '..', 'src', 'db', 'migrations'),
  ];
  const dir = candidates.find((candidate) => existsSync(candidate));
  if (!dir) throw new Error(`Migrations directory not found: ${candidates.join(', ')}`);
  return dir;
};

export const recreateTestDatabase = async (): Promise<void> => {
  const { adminUrl, databaseName } = resolveTestDatabaseInfo();
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
  } finally {
    await client.end();
  }
};

export const migrateTestDatabase = async (): Promise<void> => {
  const { url } = resolveTestDatabaseInfo();
  const dir = resolveMigrationsDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of files) {
      await client.query(await readFile(path.join(dir, file), 'utf8'));
    }
  } finally {
    await client.end();
  }
};

export const resetTestDatabase = async (): Promise<void> => {
  await pool.query(
    'TRUNCATE users, roster, join_requests, invite_links, content_posts, audit_logs RESTART IDENTITY CASCADE',
  );
};
```

- [ ] **Step 2: Global setup** — `src/db/testing/global-setup.ts`:

```ts
import { migrateTestDatabase, recreateTestDatabase, resolveTestDatabaseInfo } from './test-database';

export default async function setup(): Promise<void> {
  process.env.DATABASE_URL = resolveTestDatabaseInfo().url;
  await recreateTestDatabase();
  await migrateTestDatabase();
}
```

- [ ] **Step 3: Integration config** — `apps/api/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseInfo } from './src/db/testing/test-database';

const { url } = resolveTestDatabaseInfo();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['./src/db/testing/global-setup.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      BOT_TOKEN: 'test-bot-token',
      API_INTERNAL_TOKEN: 'test-internal-token',
      MINIAPP_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: url,
      AUTH_MOCK_ENABLED: 'false',
      REGISTRATION_RATE_LIMIT_MAX: '1000',
      REGISTRATION_RATE_LIMIT_WINDOW_SECONDS: '900',
      REPEATED_REGISTRATION_FAILURE_THRESHOLD: '3',
      REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS: '86400',
    },
  },
});
```

- [ ] **Step 4: Exclude integration tests from the unit run** — in `apps/api/vitest.config.ts` import `configDefaults` and add `exclude: [...configDefaults.exclude, '**/*.int.test.ts']`.

- [ ] **Step 5: Script** — add to `apps/api/package.json`: `"test:integration": "vitest run -c vitest.integration.config.ts"`.

- [ ] **Step 6: Verify** — `npm run typecheck --workspace=apps/api` and `npm test` (unit; must still pass and must not touch the DB). `npm run test:integration` should run 0 files cleanly for now.

---

### Task 2b.1: Transaction helper

**Files:**
- Create: `apps/api/src/db/transaction.ts`

**Interfaces:**
- Produces: `Db = Pool | PoolClient`; `withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>`.

- [ ] **Step 1: Implement**

```ts
import type { Pool, PoolClient } from 'pg';
import pool from './pool';

export type Db = Pool | PoolClient;

export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
```

- [ ] **Step 2: Verify** — `npm run typecheck --workspace=apps/api` (rollback behavior is proven in Task 10's `atomicity.int.test.ts`).

---

### Task 3: Simple repositories (settings, join-requests, audit-logs)

**Files:**
- Create: `apps/api/src/repositories/settings.repository.ts`
- Create: `apps/api/src/repositories/join-requests.repository.ts`
- Create: `apps/api/src/repositories/audit-logs.repository.ts`

**Interfaces:**
- Consumes: `Db` from `db/transaction.ts`.
- Produces: `getSetting<T>(key, db?)`, `getRegistrationIdPattern(db?)`; `insertJoinRequest(input, db?)`, `countRecentDeclines(userId, since, db?)`; `insertAuditLog(input, db?)`.

- [ ] **Step 1: `settings.repository.ts`**

```ts
import pool from '../db/pool';
import type { Db } from '../db/transaction';

export const getSetting = async <T>(key: string, db: Db = pool): Promise<T | null> => {
  const { rows } = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
};

export const getRegistrationIdPattern = async (db: Db = pool): Promise<string> => {
  const value = await getSetting<string>('registrationIdPattern', db);
  if (typeof value !== 'string' || !value) {
    throw new Error('settings.registrationIdPattern is missing');
  }
  return value;
};
```

- [ ] **Step 2: `join-requests.repository.ts`**

```ts
import type { JoinRequest, JoinRequestStatus } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

interface JoinRequestRow {
  id: string;
  user_id: string;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  reason: string | null;
  created_at: Date;
}

const mapJoinRequestRow = (row: JoinRequestRow): JoinRequest => ({
  id: row.id,
  userId: row.user_id,
  status: row.status as JoinRequestStatus,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  reason: row.reason,
  createdAt: row.created_at.toISOString(),
});

export const insertJoinRequest = async (
  input: {
    userId: string;
    status: JoinRequestStatus;
    decidedBy: string | null;
    reason: string | null;
  },
  db: Db = pool,
): Promise<JoinRequest> => {
  const { rows } = await db.query<JoinRequestRow>(
    `INSERT INTO join_requests (user_id, status, decided_by, decided_at, reason)
     VALUES ($1, $2, $3, CASE WHEN $2 = 'pending' THEN NULL ELSE now() END, $4)
     RETURNING id, user_id, status, decided_by, decided_at, reason, created_at`,
    [input.userId, input.status, input.decidedBy, input.reason],
  );
  return mapJoinRequestRow(rows[0]);
};

export const countRecentDeclines = async (
  userId: string,
  since: Date,
  db: Db = pool,
): Promise<number> => {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM join_requests
     WHERE user_id = $1 AND status = 'declined' AND created_at >= $2`,
    [userId, since],
  );
  return Number(rows[0].count);
};
```

- [ ] **Step 3: `audit-logs.repository.ts`**

```ts
import type { AuditLog } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
}

export const insertAuditLog = async (
  input: {
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    details: Record<string, unknown> | null;
  },
  db: Db = pool,
): Promise<AuditLog> => {
  const { rows } = await db.query<AuditLogRow>(
    `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, actor_user_id, action, target_type, target_id, details, created_at`,
    [input.actorUserId, input.action, input.targetType, input.targetId, input.details],
  );
  const row = rows[0];
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details,
    createdAt: row.created_at.toISOString(),
  };
};
```

- [ ] **Step 4: Verify** — `npm run typecheck --workspace=apps/api` (behavior covered by integration tests in Task 10).

---

### Task 4: Extend roster + users repositories

**Files:**
- Modify: `apps/api/src/repositories/roster.repository.ts`
- Modify: `apps/api/src/repositories/users.repository.ts`

**Interfaces:**
- Produces: `findByRegistrationId(registrationId, db?)`, `getRosterById(id, db?)`, `setRosterUserId(rosterId, userId, db?)`, `createRosterEntry(input, db?)`, `updateRosterEntry(id, patch, db?)`, `listRoster(params, db?)`; `updateUserProfile(userId, profile, db?)`.

- [ ] **Step 1: Roster row + mapping** — extend `RosterRow` with `access_review_pending: boolean` and `access_review_flagged_at: Date | null`, and `mapRosterRow` to include them (`accessReviewPending: row.access_review_pending`, `accessReviewFlaggedAt: row.access_review_flagged_at?.toISOString() ?? null`). Refactor `getRosterByUserId` to use `mapRosterRow` and add a `db: Db = pool` param.

- [ ] **Step 2: Lookups + writes**

```ts
const ROSTER_COLUMNS = `id, user_id, registration_id, cohort_year, program_track, supervisor_name,
  status, access_review_pending, access_review_flagged_at, updated_by, updated_at, created_at`;

export const findByRegistrationId = async (registrationId: string, db: Db = pool) => {
  const { rows } = await db.query<RosterRow>(
    `SELECT ${COLUMNS.cols} FROM roster WHERE registration_id = $1`,
    [registrationId],
  );
  return rows.length ? mapRosterRow(rows[0]) : null;
};

export const getRosterById = async (id: string, db: Db = pool) => { /* SELECT ... WHERE id = $1 */ };

export const setRosterUserId = async (rosterId: string, userId: string, db: Db = pool): Promise<void> => {
  await db.query('UPDATE roster SET user_id = $2, updated_at = now() WHERE id = $1', [rosterId, userId]);
};

export const createRosterEntry = async (
  input: { registrationId: string; cohortYear: number; programTrack: string; supervisorName: string | null },
  db: Db = pool,
): Promise<RosterEntry> => {
  const { rows } = await db.query<RosterRow>(
    `INSERT INTO roster (registration_id, cohort_year, program_track, supervisor_name)
     VALUES ($1, $2, $3, $4) RETURNING ${ROSTER_COLUMNS}`,
    [input.registrationId, input.cohortYear, input.programTrack, input.supervisorName],
  );
  return mapRosterRow(rows[0]);
};

export const updateRosterEntry = async (
  id: string,
  patch: {
    status?: string;
    cohortYear?: number;
    programTrack?: string;
    supervisorName?: string;
    accessReviewPending?: boolean;
    accessReviewFlaggedAt?: Date | null;
    updatedBy: string;
  },
  db: Db = pool,
): Promise<RosterEntry | null> => {
  const { rows } = await db.query<RosterRow>(
    `UPDATE roster SET
       status = COALESCE($2, status),
       cohort_year = COALESCE($3, cohort_year),
       program_track = COALESCE($4, program_track),
       supervisor_name = COALESCE($5, supervisor_name),
       access_review_pending = COALESCE($6, access_review_pending),
       access_review_flagged_at = CASE WHEN $6 IS NULL THEN access_review_flagged_at ELSE $7 END,
       updated_by = $8,
       updated_at = now()
     WHERE id = $1
     RETURNING ${ROSTER_COLUMNS}`,
    [
      id, patch.status ?? null, patch.cohortYear ?? null, patch.programTrack ?? null,
      patch.supervisorName ?? null,
      patch.accessReviewPending === undefined ? null : patch.accessReviewPending,
      patch.accessReviewFlaggedAt ?? null,
      patch.updatedBy,
    ],
  );
  return rows.length ? mapRosterRow(rows[0]) : null;
};
```

- [ ] **Step 2b: `listRoster`**

```ts
export interface ListRosterParams {
  status?: string;
  cohortYear?: number;
  search?: string;
  page: number;
  pageSize: number;
}

export const listRoster = async (
  params: ListRosterParams,
  db: Db = pool,
): Promise<{ items: RosterEntry[]; total: number }> => {
  const like = params.search
    ? `%${params.search.replace(/[\\%_]/g, '\\$&')}%`
    : null;
  const filters = `
    ($1::text IS NULL OR r.status = $1)
    AND ($2::int IS NULL OR r.cohort_year = $2)
    AND ($3::text IS NULL OR r.registration_id ILIKE $3 OR u.full_name ILIKE $3)`;
  const values = [params.status ?? null, params.cohortYear ?? null, like];
  const { rows } = await db.query<RosterRow & { user_full_name: string | null }>(
    `SELECT r.* FROM roster r LEFT JOIN users u ON u.id = r.user_id
     WHERE ${filters}
     ORDER BY r.created_at DESC
     LIMIT $4 OFFSET $5`,
    [...values, params.pageSize, (params.page - 1) * params.pageSize],
  );
  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM roster r LEFT JOIN users u ON u.id = r.user_id WHERE ${filters}`,
    values,
  );
  return { items: rows.map(mapRosterRow), total: Number(rows[0] ? countRowTotal(rows, total) : 0) };
};
```

> Implementer note: count with the same three `values` (no limit/offset); return `items: rows.map(mapRosterRow)` and `total: Number(countRows[0].total)`. (The `COUNT(*)` query uses `$1..$3` only.)

- [ ] **Step 3: `users.updateUserProfile`**

```ts
export const updateUserProfile = async (
  userId: string,
  profile: { fullName: string; email: string; telegramUsername: string | null },
  db: Db = pool,
): Promise<User> => {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
     SET full_name = $2, email = $3, telegram_username = COALESCE($4, telegram_username), updated_at = now()
     WHERE id = $1
     RETURNING id, telegram_id, telegram_username, full_name, email, role, created_at, updated_at`,
    [userId, profile.fullName, profile.email, profile.telegramUsername],
  );
  return mapUserRow(rows[0]);
};
```

- [ ] **Step 3b: Verify `Db = Pool | PoolClient` is callable.** If `db.query<Row>(...)` fails to typecheck on the union, change `Db` to a small interface:

```ts
import type { QueryResult, QueryResultRow } from 'pg';
export interface Db {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}
```
(`Pool` and `PoolClient` both satisfy this.)

- [ ] **Step 4: Verify** — `npm run typecheck --workspace=apps/api`.

---

### Task 5: Notifications stub + registration service

**Files:**
- Create: `apps/api/src/services/notifications.service.ts`
- Create: `apps/api/src/services/registration.service.ts`
- Test: `apps/api/src/services/registration.service.test.ts`

**Interfaces:**
- Consumes: repos from Tasks 3–4; `createRegistrationPayloadSchema`, `RegistrationResult`, `User` from `@thd/shared`.
- Produces: `notifyRepeatedRegistrationFailure(notice)`, `submitRegistration({ user, payload })`.

- [ ] **Step 1: Notifications stub**

```ts
import { logger } from '../utils/logger';

export interface RepeatedFailureNotice {
  userId: string;
  telegramId: number;
  failureCount: number;
}

export const notifyRepeatedRegistrationFailure = async (
  notice: RepeatedFailureNotice,
): Promise<void> => {
  logger.warn(
    { userId: notice.userId, telegramId: notice.telegramId, failureCount: notice.failureCount },
    'Repeated registration failure detected — notification wiring pending (FR27)',
  );
};
```

- [ ] **Step 2: Write the failing unit test** (`registration.service.test.ts`) with `vi.mock` of the repositories and `../config/env`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRegistrationIdPattern: vi.fn(),
  findByRegistrationId: vi.fn(),
  setRosterUserId: vi.fn(),
  insertJoinRequest: vi.fn(),
  insertAuditLog: vi.fn(),
  updateUserProfile: vi.fn(),
  countRecentDeclines: vi.fn(),
  notifyRepeatedRegistrationFailure: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../repositories/settings.repository', () => ({
  getRegistrationIdPattern: mocks.getRegistrationIdPattern,
}));
vi.mock('../repositories/roster.repository', () => ({
  findByRegistrationId: mocks.findByRegistrationId,
  setRosterUserId: mocks.setRosterUserId,
}));
vi.mock('../repositories/join-requests.repository', () => ({
  insertJoinRequest: mocks.insertJoinRequest,
  countRecentDeclines: mocks.countRecentDeclines,
}));
vi.mock('../repositories/audit-logs.repository', () => ({
  insertAuditLog: mocks.insertAuditLog,
}));
vi.mock('../repositories/users.repository', () => ({
  updateUserProfile: mocks.updateUserProfile,
}));
vi.mock('./notifications.service', () => ({
  notifyRepeatedRegistrationFailure: mocks.notifyRepeatedRegistrationFailure,
}));
vi.mock('../db/transaction', () => ({
  withTransaction: mocks.withTransaction,
}));
vi.mock('../config/env', () => ({
  env: {
    REPEATED_REGISTRATION_FAILURE_THRESHOLD: 3,
    REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS: 86400,
  },
}));

import { submitRegistration } from './registration.service';

const baseUser = {
  id: 'user-1',
  telegramId: 111,
  telegramUsername: 'dev_scholar',
  fullName: 'Dev Scholar',
  email: null,
  role: 'scholar' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const payload = {
  fullName: 'Dev Scholar',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  email: 'dev@example.com',
  telegramUsername: 'dev_scholar',
  programTrack: 'Theology',
  declarationAccepted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRegistrationIdPattern.mockResolvedValue('^DIBI-THD-\\d{4}$');
  mocks.withTransaction.mockImplementation(async (fn: (c: unknown) => unknown) => fn('client'));
  mocks.insertJoinRequest.mockResolvedValue({ id: 'jr-1' });
  mocks.insertAuditLog.mockResolvedValue({ id: 'al-1' });
  mocks.countRecentDeclines.mockResolvedValue(0);
  mocks.updateUserProfile.mockResolvedValue(baseUser);
});

describe('submitRegistration', () => {
  it('approves when the roster entry is active and stamps/links the profile', async () => {
    mocks.findByRegistrationId.mockResolvedValue({
      id: 'r-1', userId: null, registrationId: 'DIBI-THD-0042', cohortYear: 2025,
      programTrack: 'Theology', supervisorName: null, status: 'active',
      accessReviewPending: false, accessReviewFlaggedAt: null,
      updatedBy: null, updatedAt: '', createdAt: '',
    });

    const result = await submitRegistration({ user: baseUser, payload });

    expect(result).toEqual({ decision: 'approved', reason: null });
    expect(mocks.setRosterUserId).toHaveBeenCalledWith('r-1', 'user-1', 'client');
    expect(mocks.updateUserProfile).toHaveBeenCalledWith(
      'user-1',
      { fullName: payload.fullName, email: payload.email, telegramUsername: payload.telegramUsername },
      'client',
    );
    expect(mocks.insertJoinRequest).toHaveBeenCalledWith(
      { userId: 'user-1', status: 'approved', decidedBy: null, reason: null },
      'client',
    );
    expect(mocks.insertAuditLog.mock.calls[0][0].action).toBe('approve_join_request');
    expect(mocks.notifyRepeatedRegistrationFailure).not.toHaveBeenCalled();
  });

  it('declines with a reason when there is no match', async () => {
    mocks.findByRegistrationId.mockResolvedValue(null);
    const result = await submitRegistration({ user: baseUser, payload });
    expect(result.decision).toBe('declined');
    expect(result.reason).toMatch(/no matching roster/i);
    expect(mocks.setRosterUserId).not.toHaveBeenCalled();
    expect(mocks.updateUserProfile).not.toHaveBeenCalled();
    expect(mocks.insertAuditLog.mock.calls[0][0].action).toBe('decline_join_request');
  });

  it('declines when the match is not active', async () => {
    mocks.findByRegistrationId.mockResolvedValue({ status: 'pending' });
    const result = await submitRegistration({ user: baseUser, payload });
    expect(result.reason).toMatch(/pending/);
  });

  it('throws VALIDATION_ERROR on a bad registration id', async () => {
    await expect(
      submitRegistration({ user: baseUser, payload: { ...payload, registrationId: 'nope' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it('notifies when declines reach the threshold', async () => {
    mocks.findByRegistrationId.mockResolvedValue(null);
    mocks.countRecentDeclines.mockResolvedValue(3);
    await submitRegistration({ user: baseUser, payload });
    expect(mocks.notifyRepeatedRegistrationFailure).toHaveBeenCalledWith({
      userId: 'user-1', telegramId: 111, failureCount: 3,
    });
  });
});
```

- [ ] **Step 3: Run it — verify it fails** (`submitRegistration` not defined): `npm test --workspace=apps/api -- registration.service`.

- [ ] **Step 4: Implement `registration.service.ts`**

```ts
import { createRegistrationPayloadSchema, type RegistrationResult, type User } from '@thd/shared';
import { withTransaction } from '../db/transaction';
import { env } from '../config/env';
import * as settingsRepo from '../repositories/settings.repository';
import * as rosterRepo from '../repositories/roster.repository';
import * as joinRepo from '../repositories/join-requests.repository';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as usersRepo from '../repositories/users.repository';
import { AppError } from '../utils/errors';
import { notifyRepeatedRegistrationFailure } from './notifications.service';

export interface RegistrationInput {
  user: User;
  payload: unknown;
}

export const submitRegistration = async ({
  user,
  payload,
}: RegistrationInput): Promise<RegistrationResult> => {
  const pattern = await settingsRepo.getRegistrationIdPattern();
  const parsed = createRegistrationPayloadSchema(pattern).safeParse(payload);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const body = parsed.data;

  const result = await withTransaction(async (client) => {
    const matched = await rosterRepo.findByRegistrationId(body.registrationId, client);
    const approved = matched?.status === 'active';
    const reason = approved
      ? null
      : matched
        ? `Roster record is not active (status: ${matched.status})`
        : 'No matching roster entry found';

    const joinRequest = await joinRepo.insertJoinRequest(
      { userId: user.id, status: approved ? 'approved' : 'declined', decidedBy: null, reason },
      client,
    );

    if (approved && matched) {
      if (!matched.userId) await rosterRepo.setRosterUserId(matched.id, user.id, client);
      await usersRepo.updateUserProfile(
        user.id,
        {
          fullName: body.fullName,
          email: body.email,
          telegramUsername: body.telegramUsername.replace(/^@/, ''),
        },
        client,
      );
    }

    await auditRepo.insertAuditLog(
      {
        actorUserId: null,
        action: approved ? 'approve_join_request' : 'decline_join_request',
        targetType: 'join_requests',
        targetId: joinRequest.id,
        details: {
          registrationId: body.registrationId,
          matched: Boolean(matched),
          rosterStatus: matched?.status ?? null,
          reason,
        },
      },
      client,
    );

    return { decision: approved ? 'approved' : 'declined', reason } as RegistrationResult;
  });

  if (result.decision === 'declined') {
    const since = new Date(Date.now() - env.REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS * 1000);
    const failureCount = await joinRepo.countRecentDeclines(user.id, since);
    if (failureCount >= env.REPEATED_REGISTRATION_FAILURE_THRESHOLD) {
      await notifyRepeatedRegistrationFailure({
        userId: user.id,
        telegramId: user.telegramId,
        failureCount,
      });
    }
  }

  return result;
};
```

- [ ] **Step 5: Run tests to green** — `npm test --workspace=apps/api -- registration.service`.

---

### Task 6: Roster service

**Files:**
- Create: `apps/api/src/services/roster.service.ts`
- Test: `apps/api/src/services/roster.service.test.ts`

**Interfaces:**
- Produces: `listRoster(query)`, `createRosterEntry({ actorUserId, input })`, `updateRosterEntry({ actorUserId, id, patch })`.

- [ ] **Step 1: Implement** (repos imported as namespaces; `rosterRepo.updateRosterEntry` is the DB write, the service function is `updateRosterEntry`):

```ts
import { createRosterCreateSchema, rosterUpdateSchema, type RosterUpdateInput } from '@thd/shared';
import { withTransaction } from '../db/transaction';
import * as settingsRepo from '../repositories/settings.repository';
import * as rosterRepo from '../repositories/roster.repository';
import * as auditRepo from '../repositories/audit-logs.repository';
import { AppError } from '../utils/errors';
import type { PoolClient } from 'pg';

const FLAGGING_STATUSES = new Set(['graduated', 'withdrawn']);

export const listRoster = (query: {
  status?: string;
  cohortYear?: number;
  search?: string;
  page: number;
  pageSize: number;
}) => rosterRepo.listRoster(query);

export const createRosterEntry = async (args: { actorUserId: string; input: unknown }) => {
  const pattern = await settingsRepo.getRegistrationIdPattern();
  const parsed = createRosterCreateSchema(pattern).safeParse(args.input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  try {
    return await withTransaction(async (client) => {
      const entry = await rosterRepo.createRosterEntry(
        { ...parsed.data, supervisorName: parsed.data.supervisorName ?? null },
        client,
      );
      await auditRepo.insertAuditLog(
        {
          actorUserId: args.actorUserId,
          action: 'create_roster_entry',
          targetType: 'roster',
          targetId: entry.id,
          details: { registrationId: entry.registrationId, cohortYear: entry.cohortYear },
        },
        client,
      );
      return entry;
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AppError('CONFLICT', 'A roster entry with that registration ID already exists', 409);
    }
    throw error;
  }
};

export const updateRosterEntry = async (args: {
  actorUserId: string;
  id: string;
  patch: unknown;
}) => {
  const parsed = rosterUpdateSchema.safeParse(args.patch);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const patch: RosterUpdateInput = parsed.data;

  return withTransaction(async (client: PoolClient) => {
    const existing = await rosterRepo.getRosterById(args.id, client);
    if (!existing) throw new AppError('NOT_FOUND', 'Roster entry not found', 404);

    const statusChanged = patch.status !== undefined && patch.status !== existing.status;
    const flagged = patch.status ? FLAGGING_STATUSES.has(patch.status) : false;
    const cleared = patch.status === 'active';

    const updated = await rosterRepo.updateRosterEntry(
      args.id,
      {
        status: patch.status,
        cohortYear: patch.cohortYear,
        programTrack: patch.programTrack,
        supervisorName: patch.supervisorName,
        accessReviewPending: patch.status ? flagged : undefined,
        accessReviewFlaggedAt: patch.status ? (flagged ? new Date() : cleared ? null : undefined) : undefined,
        updatedBy: args.actorUserId,
      },
      client,
    );

    await auditRepo.insertAuditLog(
      {
        actorUserId: args.actorUserId,
        action: statusChanged ? 'update_roster_status' : 'update_roster_entry',
        targetType: 'roster',
        targetId: args.id,
        details: statusChanged
          ? { from: existing.status, to: patch.status, accessReviewPending: updated?.accessReviewPending ?? false }
          : { fields: Object.keys(patch) },
      },
      client,
    );

    return updated;
  });
};
```

- [ ] **Step 2: Unit test** (`roster.service.test.ts`, repos mocked as namespaces via `vi.mock`): status `active`→`graduated` passes `accessReviewPending: true` and logs `update_roster_status` with `{ from: 'active', to: 'graduated', … }`; `graduated`→`active` clears the flag (`accessReviewPending: false`); non-status patch logs `update_roster_entry`; missing entry → `NOT_FOUND`; duplicate create (`code: '23505'`) → `CONFLICT`.

- [ ] **Step 3: Run to green** — `npm test --workspace=apps/api -- roster.service`.

---

### Task 7: Rate-limit middleware

**Files:**
- Create: `apps/api/src/middleware/registration-rate-limit.ts`
- Test: `apps/api/src/middleware/registration-rate-limit.test.ts`

**Interfaces:**
- Produces: `registrationRateLimiter` (Express middleware).

- [ ] **Step 1: Implement**

```ts
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const registrationRateLimiter = rateLimit({
  windowMs: env.REGISTRATION_RATE_LIMIT_WINDOW_SECONDS * 1000,
  max: env.REGISTRATION_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? String(req.user.telegramId) : 'anonymous'),
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: { code: 'RATE_LIMITED', message: 'Too many registration attempts' } });
  },
});
```

- [ ] **Step 2: Test** — build a small Express app that sets `req.user = { telegramId }` then applies the limiter; assert the 4th request (with `max` mocked to 3 via `vi.mock('../config/env')`) returns 429 with `code: 'RATE_LIMITED'`, and a different `telegramId` is unaffected. Use `supertest`-free approach: call the middleware chain with mock req/res, or install `supertest` as a devDependency (preferred for realism).

- [ ] **Step 3: Run to green** — `npm test --workspace=apps/api -- registration-rate-limit`.

---

### Task 8: Controllers, routes, app wiring

**Files:**
- Create: `apps/api/src/controllers/registrations-controller.ts`
- Create: `apps/api/src/controllers/roster-controller.ts`
- Create: `apps/api/src/routes/registrations-routes.ts`
- Create: `apps/api/src/routes/roster-routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/controllers/roster-controller.test.ts` (UUID validation)

**Interfaces:**
- Consumes: services from Tasks 5–6; `registrationRateLimiter` from Task 7; `requireRole` from Phase 5.

- [ ] **Step 1: Registrations controller**

```ts
import type { Request, Response } from 'express';
import { submitRegistration } from '../services/registration.service';
import { AppError } from '../utils/errors';

export const postRegistration = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const result = await submitRegistration({ user: req.user, payload: req.body });
  res.status(201).json(result);
};
```

- [ ] **Step 2: Roster controller**

```ts
import type { Request, Response } from 'express';
import { rosterQuerySchema } from '@thd/shared';
import * as rosterService from '../services/roster.service';
import { AppError } from '../utils/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getRoster = async (req: Request, res: Response): Promise<void> => {
  const query = rosterQuerySchema.parse(req.query);
  const { items, total } = await rosterService.listRoster(query);
  res.status(200).json({ items, total, page: query.page, pageSize: query.pageSize });
};

export const postRoster = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const rosterEntry = await rosterService.createRosterEntry({ actorUserId: req.user.id, input: req.body });
  res.status(201).json({ rosterEntry });
};

export const patchRoster = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  if (!UUID_RE.test(req.params.id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid roster id', 400);
  }
  const rosterEntry = await rosterService.updateRosterEntry({
    actorUserId: req.user.id,
    id: req.params.id,
    patch: req.body,
  });
  res.status(200).json({ rosterEntry });
};
```

- [ ] **Step 3: Routes**

```ts
// registrations-routes.ts
import { Router } from 'express';
import { postRegistration } from '../controllers/registrations-controller';
import { asyncHandler } from '../middleware/async-handler';
import { registrationRateLimiter } from '../middleware/registration-rate-limit';

const router = Router();
router.post('/registrations', registrationRateLimiter, asyncHandler(postRegistration));
export default router;
```

```ts
// roster-routes.ts
import { Router } from 'express';
import { getRoster, patchRoster, postRoster } from '../controllers/roster-controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireRole } from '../middleware/require-role';

const router = Router();
router.use(requireRole('registrar', 'admin'));
router.get('/roster', asyncHandler(getRoster));
router.post('/roster', asyncHandler(postRoster));
router.patch('/roster/:id', asyncHandler(patchRoster));
export default router;
```

- [ ] **Step 4: Wire `app.ts`** — after the health mount and `authRoutes`:

```ts
app.use('/api', authUser, registrationsRoutes);
app.use('/api', authUser, rosterRoutes);
```

- [ ] **Step 5: Controller test** — assert `patchRoster` with a non-UUID `:id` throws `VALIDATION_ERROR` (400) before any service call.

- [ ] **Step 6: Verify** — `npm run lint && npm run typecheck --workspace=apps/api && npm run build --workspace=apps/api && npm test`.

---

### Task 9: Integration tests (test DB)

**Files:**
- Create: `apps/api/src/db/testing/fixtures.ts`
- Create: `apps/api/src/services/registration.int.test.ts`
- Create: `apps/api/src/services/roster.int.test.ts`
- Create: `apps/api/src/db/transaction.int.test.ts`

**Interfaces:**
- Consumes: `resetTestDatabase` (Task 2b), repos, services.

- [ ] **Step 1: Fixtures helper**

```ts
import type { Role, User } from '@thd/shared';
import pool from '../pool';
import { upsertByTelegram } from '../../repositories/users.repository';

export const createUser = async (telegramId: number, role: Role): Promise<User> => {
  const user = await upsertByTelegram({ telegramId, username: `dev_${role}`, fullName: `Dev ${role}` });
  if (role !== 'scholar') {
    await pool.query('UPDATE users SET role = $2 WHERE id = $1', [user.id, role]);
    user.role = role;
  }
  return user;
};

export const insertRosterRow = async (input: {
  registrationId: string;
  cohortYear?: number;
  programTrack?: string;
  status?: string;
  userId?: string | null;
}): Promise<string> => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO roster (registration_id, cohort_year, program_track, status, user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.registrationId, input.cohortYear ?? 2025, input.programTrack ?? 'Theology', input.status ?? 'active', input.userId ?? null],
  );
  return rows[0].id;
};
```

- [ ] **Step 2: `registration.int.test.ts`** — `beforeEach(resetTestDatabase)`. Cases:
  - **match/active** → `{decided:'approved'}`; `join_requests` row `approved`; `audit_logs` row action `approve_join_request`; roster `user_id` set; `users.email` stamped.
  - **no-match** → `declined`, reason `No matching roster entry found`; audit action `decline_join_request`.
  - **inactive** (`pending`, `graduated`, `withdrawn`) → declined with `status: <x>`; no profile stamp.
  - **validation failure** → throws `VALIDATION_ERROR`; zero `join_requests` rows.

```ts
const payload = {
  fullName: 'Dev Scholar', registrationId: 'DIBI-THD-0042', cohortYear: 2025,
  email: 'dev@example.com', telegramUsername: 'dev_scholar',
  programTrack: 'Theology', declarationAccepted: true,
};

it('approves an active match and writes join_request + audit_log', async () => {
  const user = await createUser(1111111111, 'scholar');
  await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active' });
  const result = await submitRegistration({ user, payload });
  expect(result).toEqual({ decision: 'approved', reason: null });
  const jr = await pool.query("SELECT status FROM join_requests WHERE user_id = $1", [user.id]);
  expect(result.decision).toBe('approved'); void jr; // assert rows[0].status === 'approved'
  const audit = await pool.query("SELECT action FROM audit_logs WHERE target_type = 'join_requests'");
  expect(audit.rows[0].action).toBe('approve_join_request');
});
```
(Write the remaining cases in the same style with explicit `SELECT` assertions.)

- [ ] **Step 3: `roster.int.test.ts`** — `beforeEach(resetTestDatabase)`; create a registrar `User`. Cases: create (audit `create_roster_entry`, 201-shape entry); duplicate `registration_id` → `CONFLICT`; list search by `registrationId` and by linked `users.full_name`; status/cohort filters; pagination (`pageSize=1` returns 1 item, `total` reflects all); `PATCH status active→graduated` → audit `{from:'active',to:'graduated'}` and `accessReviewPending === true`; `graduated→active` clears to `false`.

- [ ] **Step 3b: `roster.service.listRoster` search join** — ensure a roster row linked to a user is found by the user's `full_name`.

- [ ] **Step 4: `transaction.int.test.ts`** — atomicity:

```ts
it('rolls back all writes when a later statement in the transaction throws', async () => {
  const user = await createUser(2222222222, 'scholar');
  await expect(
    withTransaction(async (client) => {
      await insertJoinRequest({ userId: user.id, status: 'declined', decidedBy: null, reason: 'x' }, client);
      await insertAuditLog(
        { actorUserId: null, action: 'decline_join_request', targetType: 'join_requests', targetId: null, details: null },
        client,
      );
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  const { rows } = await pool.query('SELECT id FROM join_requests');
  expect(rows).toHaveLength(0);
});
```

- [ ] **Step 5: Run** — `npm run test:integration` (all three files green).

---

### Task 10: Docs alignment

**Files:**
- Modify: `docs/context/api-reference.md`
- Modify: `docs/context/file-structure.md`
- Modify: `README.md`
- Modify: `docs/context/workflows.md` (note bot call deferred)

- [ ] **Step 1: `api-reference.md`** — for `POST /api/registrations` add: status `201`, response `{ decision, reason }`, error codes (`VALIDATION_ERROR` 400, `RATE_LIMITED` 429), per-`telegram_id` rate limit; for `GET /api/roster` add query params + `{ items, total, page, pageSize }`; `POST /api/roster` → `201 { rosterEntry }`; `PATCH /api/roster/:id` → `200 { rosterEntry }` and note `accessReviewPending`.
- [ ] **Step 2: `file-structure.md`** — add `services/` files, the three new repositories, the registrations/roster controllers + routes, `db/transaction.ts`, `db/testing/`, and the `*.int.test.ts` convention + `test:integration` script.
- [ ] **Step 3: `README.md`** — add the four new env vars to the API env table and document `npm run test:integration --workspace=apps/api`.
- [ ] **Step 4: `workflows.md`** — annotate step 5/6 that the Bot call + `/internal` confirmation land in a later phase; the API records the decision now.

---

### Task 11: Final verification gate

- [ ] **Step 1:** `npm run build:shared && npm run lint && npm run typecheck && npm run build`
- [ ] **Step 2:** `npm test` (unit) — all green, DB untouched.
- [ ] **Step 3:** `npm run test:integration --workspace=apps/api` — all green against the derived `_test` DB.
- [ ] **Step 4:** Report (what was built + verification evidence + deviations) and the Postman list (below), mirroring Phase 5.

## Postman matrix (fill expected results from the executed tests)

| # | Request | Auth | Expected |
|---|---|---|---|
| 1 | `POST /api/registrations` (active match) | `tma <initData>` | `201 { decision: 'approved', reason: null }` |
| 2 | `POST /api/registrations` (no match) | `tma` | `201 { decision: 'declined', reason: 'No matching roster entry found' }` |
| 3 | `POST /api/registrations` (pending match) | `tma` | `201 { decision: 'declined', reason: 'Roster record is not active (status: pending)' }` |
| 4 | `POST /api/registrations` (bad id format) | `tma` | `400 VALIDATION_ERROR` |
| 5 | `POST /api/registrations` ×6 (same user) | `tma` | first N `201`, then `429 RATE_LIMITED` |
| 6 | `GET /api/roster` as scholar | `tma` (scholar) | `403 FORBIDDEN` |
| 7 | `GET /api/roster?search=DIBI&page=1&pageSize=20` as registrar | `tma` (registrar) | `200 { items, total, page, pageSize }` |
| 8 | `POST /api/roster` (new id) as registrar | `tma` (registrar) | `201 { rosterEntry }` |
| 9 | `POST /api/roster` (duplicate id) | registrar | `409 CONFLICT` |
| 10 | `PATCH /api/roster/:id { status: 'graduated' }` | registrar | `200 { rosterEntry.accessReviewPending: true }` |
| 11 | `PATCH /api/roster/:id { status: 'active' }` | registrar | `200 { rosterEntry.accessReviewPending: false }` |
| 12 | `PATCH /api/roster/not-a-uuid` | registrar | `400 VALIDATION_ERROR` |
| 13 | `PATCH /api/roster/:id` as faculty | `tma` (faculty) | `403 FORBIDDEN` |
