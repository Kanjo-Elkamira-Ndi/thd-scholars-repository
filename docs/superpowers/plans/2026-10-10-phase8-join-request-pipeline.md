# Phase 8 — Join-Request Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the join-request loop end-to-end: the bot records `chat_join_request` and DMs the Mini App link; `POST /api/registrations` enqueues the approve/decline delivery; the bot claims, executes the Telegram action (or issues a single-use invite link), and confirms; delivery retries/backoff so a bot outage never drops a decision.

**Architecture:** Extend `join_requests` with channel-event + delivery/queue columns (no new tables). The API is the queue owner and exposes internal endpoints (record / claim / complete) behind `X-Internal-Token`. The bot polls `claim`, executes, then `complete`. Leased claim + at-least-once semantics; a request-gone approve falls back to `getChatMember` → invite link.

**Tech Stack:** TypeScript, Express 5, `pg`, Zod, Vitest, Telegraf 4, npm workspaces. Shared types/schemas in `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-10-10-phase8-join-request-pipeline-design.md`

## Global Constraints

- Node ≥20; npm workspaces (`apps/api`, `apps/bot`, `packages/shared`).
- Run `npm run build:shared` before any typecheck/build/test that imports `@thd/shared`.
- ESLint `@typescript-eslint/no-explicit-any` is an **error**; Prettier single quotes, semicolons, trailing commas `all`, width 100.
- Tests are colocated: `*.test.ts` (unit, DB-free) and `*.int.test.ts` (integration, test DB). Integration config: `apps/api/vitest.integration.config.ts`.
- No comments unless they explain a non-obvious "why". No `any`.
- Invite-link expiry source: `settings.inviteLinkExpirySeconds` (seeded `86400`), fallback 86400.
- Never overwrite `users.full_name` from the Telegram name path (reuse `upsertByTelegram`).
- **Do NOT start Phase 9.** Do not commit unless explicitly asked.
- Verification gate (run at the end): `npm run build:shared && npm run lint && npm run typecheck && npm run test && npm run build` and `npm run test:integration --workspace=apps/api`.

**Spec amendments carried verbatim:** A1 (pending DM → `user_chat_id`, non-fatal), A2 (request-gone → `getChatMember` → delivered-or-invite; decline request-gone = delivered), A3 (approve/decline DM non-fatal; invite-path DM failure = failed attempt + revoke), A4 (idempotent `/complete`), A5 (never overwrite `full_name`), A6 (24h expiry from settings), A7 (no "LLM-free" wording).

---

## File structure

**Shared (`packages/shared/src`):**
- `types/enums.ts` — add `JoinRequestDeliveryStatus`.
- `types/entities.ts` — extend `JoinRequest`; add `JoinRequestDeliveryTask`.
- `types/internal.ts` (new) — `ClaimJoinRequestsResponse`.
- `schemas/join-requests.ts` (new) — record/claim/complete schemas.
- `index.ts` — export the new modules.

**API (`apps/api/src`):**
- `db/migrations/0008_join_request_delivery.sql` — additive columns + indexes.
- `repositories/join-requests.repository.ts` — extend row mapping; add `recordJoinRequest`, `decideJoinRequest`, `claimJoinRequests`, `getJoinRequestById`, `insertInviteLink`, `markProcessing`, `markDelivered`, `reschedule`, `markFailed`, `reclaimStaleLeases`.
- `services/join-request-delivery.service.ts` — orchestration + backoff.
- `utils/backoff.ts` — pure `computeBackoffSeconds`.
- `controllers/internal-join-requests-controller.ts` — record / claim / complete handlers.
- `routes/internal-routes.ts` — mount the 3 routes.
- `services/registration.service.ts` — use `decideJoinRequest`.
- `config/env.ts` + `.env.example` — 4 delivery vars.
- `repositories/settings.repository.ts` — `getInviteLinkExpirySeconds`.

**Bot (`apps/bot/src`):**
- `services/api-client.ts` — add 3 methods.
- `utils/telegram-errors.ts` — `isJoinRequestGone`.
- `templates/join-request-pending.ts`, `templates/invite-link.ts`, `templates/index.ts`.
- `handlers/join-request.ts`, `handlers/index.ts`.
- `services/delivery.ts` — poll loop + executor.
- `bot.ts`, `index.ts`, `config/env.ts`, `.env.example`.

**Docs:** `docs/context/{workflows,architecture,security,api-reference,database-schema,developer-map}.md`, `README.md`.

---

### Task 1: Shared types + schemas

**Files:**
- Modify: `packages/shared/src/types/enums.ts`, `packages/shared/src/types/entities.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/types/internal.ts`, `packages/shared/src/schemas/join-requests.ts`

**Interfaces (produces):**
- `JoinRequestDeliveryStatus = 'pending'|'processing'|'delivered'|'failed'`
- `JoinRequest` gains `chatId: number|null`, `telegramUserId: number|null`, `joinRequestedAt: string|null`, `deliveryStatus: JoinRequestDeliveryStatus`, `deliveryAttempts: number`, `nextAttemptAt: string|null`, `deliveredAt: string|null`, `deliveryError: string|null`.
- `JoinRequestDeliveryTask { id: string; decision: 'approved'|'declined'; reason: string|null; telegramId: number; telegramUserId: number; fullName: string; chatId: number|null; attempts: number }`
- `ClaimJoinRequestsResponse { items: JoinRequestDeliveryTask[]; inviteLinkExpirySeconds: number }`
- `recordJoinRequestSchema { telegramId:number; telegramUsername?:string; firstName?:string; lastName?:string; chatId:number; joinRequestedAt:string }` → type `RecordJoinRequestInput`
- `claimJoinRequestsSchema { limit?: number }` (positive int, ≤100) → `ClaimJoinRequestsInput`
- `completeJoinRequestSchema { outcome:'delivered'|'failed'; error?:string; inviteLink?:{link:string;expiresAt:string} }` → `CompleteJoinRequestInput`

- [ ] **Step 1: Add enum.** In `enums.ts`: `export type JoinRequestDeliveryStatus = 'pending' | 'processing' | 'delivered' | 'failed';`
- [ ] **Step 2: Extend `JoinRequest`** in `entities.ts` with the 8 fields above.
- [ ] **Step 3: Create `types/internal.ts`** with the two interfaces.
- [ ] **Step 4: Create `schemas/join-requests.ts`** using `z.object`, `.safeParse`-friendly, mirroring `schemas/users.ts` style.
- [ ] **Step 5: Export** both new modules from `index.ts`.
- [ ] **Step 6: `npm run build:shared`.** Expected: success.
- [ ] **Step 7: Commit** `feat(shared): join-request delivery types and schemas`.

---

### Task 2: Migration `0008`

**Files:** Create `apps/api/src/db/migrations/0008_join_request_delivery.sql`

**Produces:** columns `chat_id bigint`, `telegram_user_id bigint`, `join_requested_at timestamptz`, `delivery_status text NOT NULL DEFAULT 'pending'` with CHECK, `delivery_attempts int NOT NULL DEFAULT 0`, `next_attempt_at timestamptz`, `delivery_claimed_at timestamptz`, `delivered_at timestamptz`, `delivery_error text`; partial unique index `join_requests_one_pending_per_user` on `(user_id) WHERE status='pending'`; index `join_requests_delivery_queue` on `(next_attempt_at) WHERE status<>'pending' AND delivery_status='pending'`; index `join_requests_delivery_processing` on `(delivery_claimed_at) WHERE delivery_status='processing'`.

- [ ] **Step 1:** Write the migration (exact SQL in spec §2).
- [ ] **Step 2:** Verify it applies on a fresh test DB: run an existing `*.int.test.ts` (its `beforeEach` recreates + migrates). Expected: PASS.
- [ ] **Step 3: Commit** `feat(api): migration 0008 join-request delivery`.

---

### Task 3: Repository — decision + record

**Files:** Modify `apps/api/src/repositories/join-requests.repository.ts`; Test `apps/api/src/repositories/join-requests.repository.int.test.ts`

**Interfaces (produces):**
- `recordJoinRequest(input:{userId:string; chatId:number; telegramUserId:number; joinRequestedAt:string}, db=pool): Promise<JoinRequest>`
- `decideJoinRequest(input:{userId:string; decision:'approved'|'declined'; reason:string|null}, db=pool): Promise<JoinRequest>`

- [ ] **Step 1: Failing test** — record twice for one user → one row, second updates `chat_id`; `decideJoinRequest` on a pending row updates it in place (preserves `chatId`) and sets `deliveryStatus='pending'`, `attempts=0`; with no pending row → inserts a decided row with `chatId === null`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** `recordJoinRequest` uses `INSERT ... ON CONFLICT (user_id) WHERE status='pending' DO UPDATE SET chat_id, telegram_user_id, join_requested_at RETURNING ...`. `decideJoinRequest` tries the pending UPDATE, then INSERTs when `rowCount===0`. Extend `JoinRequestRow`/`mapJoinRequestRow` for all new columns.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5:** Update `registration.service.ts` to call `joinRepo.decideJoinRequest({ userId: user.id, decision, reason }, client)` instead of `insertJoinRequest`. Run `registration.int.test.ts` + `registration.service.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(api): join-request record + decision repository`.

---

### Task 4: Repository — claim / complete + backoff

**Files:** Modify `join-requests.repository.ts`, `constants`/`utils`; Test extend the int test.

**Interfaces (produces):**
- `claimJoinRequests(input:{limit:number; leaseSeconds:number}, db=pool): Promise<JoinRequestDeliveryTask[]>` — reclaims stale `processing` older than lease, then leases a batch `FOR UPDATE SKIP LOCKED`, incrementing `delivery_attempts`. Returns joined `telegram_id`/`full_name`.
- `getJoinRequestById(id, db): Promise<JoinRequest | null>`
- `markDelivered(id, db): Promise<void>`
- `insertInviteLink(input:{link:string; userId:string; expiresAt:string}, db): Promise<void>` (`ON CONFLICT (link) DO NOTHING`)
- `reschedule(id, input:{error:string; nextAttemptAt:Date}, db): Promise<void>`
- `markFailed(id, input:{error:string}, db): Promise<void>`
- `computeBackoffSeconds(attempts:number, baseSeconds:number, capSeconds=3600): number` in `apps/api/src/utils/backoff.ts` → `min(base·2^(attempts-1), cap)`.

- [ ] **Step 1: Failing tests** — claim returns only decided rows (`status<>'pending'`), sets `processing` + attempts+1; two concurrent claims never return the same id; a stale `processing` row (backdate `delivery_claimed_at`) is reclaimed; backoff = 60/120/240/… capped 3600.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** (§4.2 SQL in spec). Wrap the reclaim+claim in one transaction.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(api): join-request claim/complete repository`.

---

### Task 5: Delivery service + controllers + routes + env

**Files:** Create `services/join-request-delivery.service.ts`, `controllers/internal-join-requests-controller.ts`, `apps/api/src/services/internal-join-requests.int.test.ts`; Modify `routes/internal-routes.ts`, `config/env.ts`, `.env.example`, `settings.repository.ts`.

**Interfaces (produces):**
- `getInviteLinkExpirySeconds(db=pool): Promise<number>` (fallback 86400)
- `claimDeliveries({ limit }): Promise<ClaimJoinRequestsResponse>`
- `completeJoinRequest(input: CompleteJoinRequestInput & { id:string }): Promise<{ deliveryStatus: JoinRequestDeliveryStatus }>`
- Controllers: `postJoinRequest` (201 `{ joinRequestId }`), `postClaimJoinRequests` (200 `ClaimJoinRequestsResponse`), `postCompleteJoinRequest` (200 `{ deliveryStatus }`).
- Env: `JOIN_REQUEST_DELIVERY_MAX_ATTEMPTS=5`, `JOIN_REQUEST_DELIVERY_BACKOFF_BASE_SECONDS=60`, `JOIN_REQUEST_DELIVERY_LEASE_SECONDS=120`, `JOIN_REQUEST_DELIVERY_BATCH_SIZE=10`.

**Idempotency (A4):** complete on an already `delivered`/`failed` row → `200 { deliveryStatus }`, no side effects. Delivered + `inviteLink` → `insertInviteLink` (conflict-safe). Failed under max → `reschedule`; at/over max → `markFailed` + `insertAuditLog({ action:'join_request_delivery_failed', targetType:'join_requests', targetId, details:{ attempts, error } })`.

- [ ] **Step 1: Failing int tests** — enumerate spec §7 items 1–11 (record idempotence + full_name preserved; decision in place / insert; claim; concurrent claim; delivered; failed<max / terminal+audit; invite link once + repeat-complete no duplicate; stale reclaim; 401/400/404).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** controller + service + routes. Route `POST /internal/join-requests`, `POST /internal/join-requests/claim`, `POST /internal/join-requests/:id/complete` (uuid-validate `:id` → `VALIDATION_ERROR` 400).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(api): join-request delivery endpoints`.

---

### Task 5b: Full_name preservation test at the record endpoint

**Files:** Test `internal-join-requests.int.test.ts`

- [ ] **Step 1:** Seed a user with a DIBI `full_name` via `updateUserProfile`/`createUser` then POST record with Telegram names → assert `users.full_name` unchanged (A5).
- [ ] **Step 2:** Run, verify pass. **Commit** with Task 5.

---

### Task 6: API config wiring + docs (API side)

**Files:** Modify `apps/api/.env.example`, `apps/api/src/config/env.ts`

- [ ] **Step 1:** Add the 4 env vars (zod coerce ints positive with defaults).
- [ ] **Step 2:** `npm run typecheck --workspace=apps/api` (after `build:shared`). Expected: clean.
- [ ] **Step 3: Commit** `chore(api): join-request delivery env`.

---

### Task 7: Bot api-client + telegram error helper + templates

**Files:** Modify `apps/bot/src/services/api-client.ts`; Create `apps/bot/src/utils/telegram-errors.ts`, `templates/join-request-pending.ts`, `templates/invite-link.ts`; Modify `templates/index.ts`; Tests `*.test.ts`.

**Interfaces (produces):**
- `BotApiClient.recordJoinRequest(input: RecordJoinRequestInput): Promise<{ joinRequestId: string }>`
- `BotApiClient.claimJoinRequests(input: ClaimJoinRequestsInput): Promise<ClaimJoinRequestsResponse>`
- `BotApiClient.completeJoinRequest(id: string, input: CompleteJoinRequestInput): Promise<void>`
- `isJoinRequestGone(err: unknown): boolean` — true when the Telegram error description contains `HIDE_REQUESTER_MISSING`, `USER_ALREADY_PARTICIPANT`, or `no join request` (case-insensitive).
- `renderJoinRequestPending(): string`, `joinRequestPendingKeyboard(url): InlineKeyboardMarkup`
- `renderInviteLink({ name, link, expiresInHours }): string`

- [ ] **Step 1: Failing tests** — client method paths/verbs/headers (POST bodies); `isJoinRequestGone` positives/negatives; exact template copy (spec §5.3).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** (generalize the client to `request(path, { method, body })`).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(bot): delivery client, error helper, templates`.

---

### Task 8: Bot handlers + delivery loop + wiring

**Files:** Create `apps/bot/src/handlers/join-request.ts`, `handlers/index.ts`, `services/delivery.ts`; Modify `bot.ts`, `index.ts`, `config/env.ts`, `.env.example`; Tests.

**Interfaces (produces):**
- `joinRequestHandler(ctx, { api, miniAppUrl })` — `chat.type==='channel'` guard; records; DMs `user_chat_id` (A1, non-fatal on missing/throw).
- `startDeliveryLoop(deps)`, `stopDeliveryLoop()`; `executeTask(task, deps)` per spec §5.2.
- `TelegramDelivery` structural interface (approve/decline/getChatMember/createChatInviteLink/revokeChatInviteLink/sendMessage).
- Bot env: `BOT_CHANNEL_ID` (required, non-empty), `BOT_OUTBOX_POLL_INTERVAL_MS=5000`, `BOT_OUTBOX_BATCH_SIZE=10`.

**Execution rules (spec §5.2/A2/A3):** approve→success→DM (non-fatal) → delivered; approve→gone→`getChatMember(BOT_CHANNEL_ID, telegramUserId)` member → delivered (no link/DM); else invite path; decline→gone → delivered; invite DM failure → `revokeChatInviteLink` + report `failed`; approve/decline success → report `delivered`. `expire_date = floor(now/1000)+inviteLinkExpirySeconds`.

- [ ] **Step 1: Failing tests** — spec §7 bot items 1–8 (handler; four actions; crash-after-approve retry: attempt 2 gone+member → delivered, **no** `createChatInviteLink`; gone+non-member → invite; invite DM failure → revoke + `complete(failed)`; decline-gone → delivered; template exact copy; env required/defaults).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** handler, executor, loop, wiring. `index.ts` starts the loop after `setMyCommands`, stops it on `SIGINT`/`SIGTERM` before `bot.stop`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(bot): join-request handler and delivery loop`.

---

### Task 9: Docs

**Files:** `docs/context/{workflows,architecture,security,api-reference,database-schema,developer-map}.md`, `README.md`

- [ ] **Step 1:** `api-reference.md` — document the 3 internal endpoints + the registration enqueue note.
- [ ] **Step 2:** `database-schema.md` — new `join_requests` columns + indexes + migration `0008`.
- [ ] **Step 3:** `workflows.md` #1 — mark the join-request loop implemented; describe outbox/retry/fallback.
- [ ] **Step 4:** `security.md` — note the invite-link fallback and non-fatal DM policy.
- [ ] **Step 5:** `README.md` — bot env additions (`BOT_CHANNEL_ID`, `BOT_OUTBOX_*`).
- [ ] **Step 6: Commit** `docs: phase 8 join-request pipeline`.

---

### Task 10: Full verification gate

- [ ] **Step 1:** `npm run build:shared && npm run lint && npm run typecheck && npm run test && npm run build`
- [ ] **Step 2:** `npm run test:integration --workspace=apps/api`
- [ ] **Step 3:** Confirm `apps/bot/dist/` output; report counts. Do not commit unless asked.

---

## Self-review

- **Spec coverage:** §2→T2; §3→T1; §4.1/4.2 (record/claim/complete)→T3–T5; §4.3→T3 Step 5; §4.4→T6; §5.1→T8; §5.2→T8; §5.3→T7; §5.4→T7; §5.5→T8; A1→T8; A2→T8; A3→T8; A4→T5; A5→T3/T5b; A6→T5; A7→T9; §7→T3–T5/T7/T8; §8→all.
- **Placeholders:** none — SQL, signatures, copy, and test cases are concrete.
- **Type consistency:** `JoinRequestDeliveryTask`, `ClaimJoinRequestsResponse`, `RecordJoinRequestInput`, `CompleteJoinRequestInput` are defined in T1 and consumed unchanged in T5/T7/T8.
