# Phase 8 — Join-Request Pipeline (design)

**Status:** approved with amendments (2026-10-10)
**Scope owner:** Bot Service (`apps/bot`) + API (`apps/api`) + shared (`packages/shared`) + docs
**Source of truth:** `workflows.md` #1, `architecture.md` (registration data flow + "internal call or shared queue"), `database-schema.md`, `security.md`, `api-reference.md` (internal endpoints), Phase 7 spec.

## 0. Problem

Phase 6 records the approve/decline decision in `join_requests` but never executes the Telegram side; Phase 7 built the bot but left `chat_join_request` / `approveChatJoinRequest` / `declineChatJoinRequest` and `/internal/join-requests/:id/complete` out of scope. Phase 8 closes the loop:

1. The bot handles `chat_join_request`, records it, and DMs the user a Mini App link.
2. After `POST /api/registrations` decides, the API enqueues a delivery task; the bot executes `approveChatJoinRequest` / `declineChatJoinRequest` (or issues a single-use invite link) and sends the right message.
3. Delivery is queued with retries so a bot outage never silently drops a decision.

## 1. Decisions (locked)

| # | Decision |
|---|---|
| D1 | **Outbox + bot pull.** The API persists the pending Telegram action on the `join_requests` row; the bot polls an internal claim endpoint, executes, then calls `/internal/join-requests/:id/complete`. No inbound surface on the bot. |
| D2 | **Both entry paths.** (a) channel `chat_join_request` → register → approve/decline the request; (b) Mini App/bot registration with no prior join request → approval issues a single-use invite link. |
| D3 | **Extend `join_requests`** — no new tables; channel-event columns + delivery/queue columns live on the row. `invite_links` is reused unchanged. |
| D4 | **Backoff + invite-link fallback** on failure (retry up to a max; a request-gone/expired approve falls back to an invite link). |
| D5 | **Leased claim, at-least-once** delivery (a duplicate DM is possible only in the crash window between send and confirm). |
| D6 | **`BOT_CHANNEL_ID` env** supplies the channel chat id for invite-link creation when no `chat_join_request` is present (Path 2 and the fallback). |

### Amendments applied (2026-10-10)

- **A1 — join-request-pending DM target.** The pending "complete your registration" DM is sent to `chat_join_request.user_chat_id` (usable for ~5 minutes without the user having pressed Start). The logged, non-fatal fallback applies only when `user_chat_id` is absent or the send fails.
- **A2 — Idempotent execution.** If `approveChatJoinRequest` fails as *request-gone*, call `getChatMember(BOT_CHANNEL_ID, telegramUserId)` first. If the user is already a member → mark **delivered** (no invite link, no duplicate). Only if not a member → invite-link path. For declined tasks, a *request-gone* decline is treated as **delivered**.
- **A3 — DM failure policy.** Approve/decline paths: execute the Telegram action first, then DM; a failed DM is logged and **non-fatal** (task still delivered). Invite-link path: the DM carries the link, so a failed DM **counts as a failed attempt** — revoke the just-created link (`revokeChatInviteLink`), retry with backoff, and after max attempts terminate with an `audit_logs` row.
- **A4 — `/complete` is idempotent.** Repeating it is a 200 no-op; it never creates duplicate `invite_links` rows (insert guarded by `ON CONFLICT (link) DO NOTHING`) and never errors on repeat.
- **A5 — Never overwrite `users.full_name`.** The record endpoint reuses `upsertByTelegram`, which preserves `full_name` on conflict (it only writes the Telegram-provided name on first insert). The DIBI name/email are written by Phase 6 registration (`updateUserProfile`).
- **A6 — Invite-link expiry.** Seeded setting `inviteLinkExpirySeconds = 86400` (24h) is the source of truth; the bot uses it (delivered per claim), with a 86400 fallback if the setting is somehow missing.
- **A7 —** No "LLM-free"-style wording.

## 1. Architecture

```
Entry A (channel request)                      Entry B (Mini App only)
─────────────────────────                      ───────────────────────
user taps "Request to Join"                    user opens bot / Mini App
        │                                              │
Telegram → bot: chat_join_request                      │
        │                                              │
bot → POST /internal/join-requests        user submits POST /api/registrations
  (upsert user; pending join_requests row)             │
        │                                     API: roster match → decision
bot → DM {user_chat_id} Mini App link                 │
        │                               upsert pending row → decision,
        └──────────────┬──────────────── enqueue delivery (chat_id kept)  │
                       │               or insert decided row (chat_id null)
                       ▼
        POST /api/registrations (from Entry B) also reaches here
                       │
                       ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ join_requests  (decision + delivery queue state)               │
   └──────────────────────────────────────────────────────────────┘
                       ▲ claim (lease)              │ complete
                       │                             ▼
                 bot outbox poll loop  ──►  Telegram: approve/decline/invite + DM
```

The API stays the only source of truth and RBAC holder; the bot remains a thin client. The queue state lives in Postgres so it survives bot restarts/outages.

## 2. Data model — migration `0008_join_request_delivery.sql`

Additive only (no shipped column is altered):

```sql
ALTER TABLE join_requests
  ADD COLUMN chat_id            bigint,        -- channel chat id from chat_join_request
  ADD COLUMN telegram_user_id   bigint,        -- requester's Telegram id (from.id)
  ADD COLUMN join_requested_at  timestamptz,   -- when the channel request arrived
  ADD COLUMN delivery_status    text NOT NULL DEFAULT 'pending'
      CHECK (delivery_status IN ('pending','processing','delivered','failed')),
  ADD COLUMN delivery_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at    timestamptz,
  ADD COLUMN delivery_claimed_at timestamptz,  -- lease timestamp
  ADD COLUMN delivered_at       timestamptz,
  ADD COLUMN delivery_error     text;

-- one open (undecided) channel request per user
CREATE UNIQUE INDEX join_requests_one_pending_per_user
  ON join_requests (user_id) WHERE status = 'pending';

-- claimable delivery queue
CREATE INDEX join_requests_delivery_queue
  ON join_requests (next_attempt_at)
  WHERE status <> 'pending' AND delivery_status = 'pending';

-- stale-lease reclaim
CREATE INDEX join_requests_delivery_processing
  ON join_requests (delivery_claimed_at)
  WHERE delivery_status = 'processing';
```

**Claimable predicate:** `status <> 'pending' AND delivery_status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())`.
**State machine:** `pending → processing → (delivered | failed | pending[reschedule])`. `delivered`/`failed` are terminal. `processing` older than the lease is reclaimed to `pending`.
`invite_links` is unchanged (single-use enforced by `member_limit: 1`; `used` remains informational). `expires_at` uses `settings.inviteLinkExpirySeconds`.

`database-schema.md` is updated: new columns, index list, and the added migration filename.

## 3. Shared (`packages/shared`)

- `types/enums.ts`: `export type JoinRequestDeliveryStatus = 'pending' | 'processing' | 'delivered' | 'failed';`
- `types/entities.ts`: extend `JoinRequest` with `chatId: number | null`, `telegramUserId: number | null`, `joinRequestedAt: string | null`, `deliveryStatus: JoinRequestDeliveryStatus`, `deliveryAttempts: number`, `nextAttemptAt: string | null`, `deliveredAt: string | null`, `deliveryError: string | null`.
- New `types/entities.ts` / `types/internal.ts`:
  - `JoinRequestDeliveryTask { id; decision: 'approved'|'declined'; reason: string|null; telegramId: number; telegramUserId: number; fullName: string; chatId: number|null; attempts: number; }`
  - `ClaimJoinRequestsResponse { items: JoinRequestDeliveryTask[]; inviteLinkExpirySeconds: number; }`
- New `schemas/join-requests.ts`:
  - `recordJoinRequestSchema` — `{ telegramId:number; telegramUsername?:string; firstName?:string; lastName?:string; chatId:number; joinRequestedAt:string }`
  - `claimJoinRequestsSchema` — `{ limit?:number }` (positive int, capped)
  - `completeJoinRequestSchema` — `{ outcome:'delivered'|'failed'; error?:string; inviteLink?:{ link:string; expiresAt:string } }`

These are imported by the API validators and the bot client (single source of truth per `code-standards.md`).

## 4. API

### 4.1 `POST /internal/join-requests` — record a channel request (bot → API)
- **Auth:** `X-Internal-Token`. **Body:** `recordJoinRequestSchema`. **Status:** `201 { joinRequestId }`.
- **Behaviour (one transaction):**
  1. `user = upsertByTelegram({ telegramId, username, fullName })` — `fullName` composed from `firstName`/`lastName` (fallback `Telegram user <id>`), used **only if the user row is newly inserted**; existing `full_name` is never overwritten (A5).
  2. Upsert the user's open request:
     ```sql
     INSERT INTO join_requests (user_id, status, chat_id, telegram_user_id, join_requested_at)
     VALUES ($uid, 'pending', $chatId, $telegramUserId, $joinRequestedAt)
     ON CONFLICT (user_id) WHERE status = 'pending'
     DO UPDATE SET chat_id = EXCLUDED.chat_id,
                   telegram_user_id = EXCLUDED.telegram_user_id,
                   join_requested_at = EXCLUDED.join_requested_at
     RETURNING id;
     ```
- No audit row (routine event). Repeated events update the same open row (partial unique index).

### 4.2 `POST /internal/join-requests/claim` — lease work (bot → API)
- **Auth:** `X-Internal-Token`. **Body:** `{ limit }` (default `JOIN_REQUEST_DELIVERY_BATCH_SIZE`).
- **Behaviour (one transaction):**
  1. Reclaim stale leases: `UPDATE join_requests SET delivery_status='pending', delivery_claimed_at=NULL WHERE delivery_status='processing' AND delivery_claimed_at < now() - make_interval(secs => $leaseSeconds)`.
  2. Lease a batch:
     ```sql
     UPDATE join_requests j
        SET delivery_status='processing', delivery_claimed_at=now(),
            delivery_attempts = j.delivery_attempts + 1
      WHERE j.id IN (
        SELECT id FROM join_requests
         WHERE status <> 'pending' AND delivery_status='pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1)
      RETURNING j.id, j.status, j.reason, j.chat_id, j.telegram_user_id,
                j.delivery_attempts,
                (SELECT telegram_id FROM users u WHERE u.id=j.user_id) AS telegram_id,
                (SELECT full_name  FROM users u WHERE u.id=j.user_id) AS full_name;
     ```
- **Response:** `200 ClaimJoinRequestsResponse` (`inviteLinkExpirySeconds` read via `settings` repository, default 86400). Empty `items` when idle.

### 4.2 `POST /internal/join-requests/:id/complete` — report outcome (bot → API)
- **Auth:** `X-Internal-Token`. **Body:** `completeJoinRequestSchema`. `:id` is the join-request uuid (`404 NOT_FOUND` if absent → also `400 VALIDATION_ERROR` if not a uuid).
- **Idempotency (A4):** if the row is already `delivered` or `failed`, return `200 { deliveryStatus }` unchanged (no side effects).
- **`outcome: 'delivered'`:**
  - `UPDATE ... SET delivery_status='delivered', delivered_at=now(), delivery_error=NULL, delivery_claimed_at=NULL WHERE id=$1`.
  - If `inviteLink` present: `INSERT INTO invite_links (link, created_for_user_id, expires_at) SELECT $2, user_id, $3 FROM join_requests WHERE id=$1 ON CONFLICT (link) DO NOTHING` — no duplicate rows on repeat.
- **`outcome: 'failed'`:**
  - Read `delivery_attempts`. If `attempts < JOIN_REQUEST_DELIVERY_MAX_ATTEMPTS`: `UPDATE ... SET delivery_status='pending', delivery_error=$err, delivery_claimed_at=NULL, next_attempt_at = now() + make_interval(secs => $backoff)` where `backoff = min(base·2^(attempts-1), 3600)`.
  - Else terminal: `UPDATE ... SET delivery_status='failed', delivery_error=$err, delivery_claimed_at=NULL`, and insert an `audit_logs` row `{ actor: null, action:'join_request_delivery_failed', targetType:'join_requests', targetId, details:{ attempts, error } }`.

### 4.3 Change to `POST /api/registrations` (`registration.service.ts`)
The decision now **enqueues delivery**. Inside the existing transaction (roster link + profile stamp + audit unchanged), replace the unconditional `insertJoinRequest` with `decideJoinRequest`:
1. If the user has an open (`status='pending'`) request → update it in place:
   ```sql
   UPDATE join_requests
      SET status=$decision, decided_at=now(), reason=$reason,
          delivery_status='pending', delivery_attempts=0,
          next_attempt_at=NULL, delivery_error=NULL, delivery_claimed_at=NULL
    WHERE user_id=$uid AND status='pending'
    RETURNING id;
   ```
   (`chat_id` / `telegram_user_id` are preserved → the bot approves/declines the channel request.)
2. Else insert a decided row with `chat_id = NULL` (Path 2 → the bot issues an invite link on approval).

The endpoint's contract (`201 { decision, reason }`) is unchanged — the Mini App needs no change.

### 4.4 Config (API env)
| Var | Default | Use |
|---|---|---|
| `JOIN_REQUEST_DELIVERY_MAX_ATTEMPTS` | `5` | terminal-after threshold |
| `JOIN_REQUEST_DELIVERY_BACKOFF_BASE_SECONDS` | `60` | exponential base, capped 3600 |
| `JOIN_REQUEST_DELIVERY_LEASE_SECONDS` | `120` | stale-`processing` reclaim window |
| `JOIN_REQUEST_DELIVERY_BATCH_SIZE` | `10` | default claim limit |

## 5. Bot

### 5.1 `handlers/join-request.ts`
`bot.on('chat_join_request', handler)`:
1. Guard: `ctx.chatJoinRequest.chat.type === 'channel'`; else ignore.
2. `api.recordJoinRequest({ telegramId: from.id, telegramUsername: from.username, firstName, lastName, chatId: chat.id, joinRequestedAt: new Date().toISOString() })`.
3. Send `renderJoinRequestPending()` with an inline "Complete Registration" button to **`user_chat_id`** (A1):
   - If `user_chat_request.user_chat_id` absent or the send throws → `logger.warn(...)`; non-fatal (the record stands; the user can still use `/start`).
4. `user_chat_id` is **transient** (≈5 min): used synchronously here and never persisted.

Registered in `bot.ts` alongside `registerCommands`.

### 5.2 `services/delivery.ts` — outbox poll loop
A start/stop-able loop (`startDeliveryLoop(deps)` / `stopDeliveryLoop()`), interval `BOT_OUTBOX_POLL_INTERVAL_MS`, batch `BOT_OUTBOX_BATCH_SIZE`. Each tick: `api.claimJoinRequests({ limit })` → for each task derive the action from `(decision, chatId)` and execute, then `api.completeJoinRequest(id, outcome)`. Task-level errors are caught and reported as `failed` (never crash the loop).

| decision | chatId | action |
|---|---|---|
| approved | present | **approve**: `approveChatJoinRequest` → approval DM |
| declined | present | **decline**: `declineChatJoinRequest` → decline DM |
| approved | absent | **invite**: `createChatInviteLink(BOT_CHANNEL_ID, {member_limit:1, expire_date})` → invite DM |
| declined | absent | **decline-dm-only**: decline DM |

**Approve (A2/A3):**
1. `approveChatJoinRequest(chatId, telegramUserId)`.
   - ok → step 3.
   - *request-gone* error (`isJoinRequestGone`: description contains `HIDE_REQUESTER_MISSING` / `USER_ALREADY_PARTICIPANT` / "no join request") → `getChatMember(BOT_CHANNEL_ID, telegramUserId)`:
     - status `member|administrator|creator` → `complete(delivered)` and stop (no invite link, no duplicate DM).
     - otherwise → **invite path**.
   - any other error → `complete(failed, error)` (retry).
2. *(invite path)* as 5.2-invite.
3. Send approval DM `renderApproval({ name })` to `telegramUserId`; DM failure → `logger.warn` only. → `complete(delivered)`.

**Decline:**
1. `declineChatJoinRequest(chatId, telegramUserId)`; *request-gone* is non-fatal (nothing to decline).
   - other error → `complete(failed, error)`.
2. Send decline DM `renderDecline({ reason })`; DM failure → `logger.warn`. → `complete(delivered)`.

**Invite (A3):**
1. `expire_date = floor(Date.now()/1000) + inviteLinkExpirySeconds`; `expiresAt = ISO(expire_date*1000)`.
2. `createChatInviteLink(BOT_CHANNEL_ID, { member_limit: 1, expire_date })` → `link`.
3. Send `renderInviteLink({ name, link, expiresInHours })` to `telegramUserId`.
   - success → `complete(delivered, { inviteLink: { link, expiresAt } })`.
   - failure → `revokeChatInviteLink(BOT_CHANNEL_ID, link)` (best-effort) → `complete(failed, error)` **counting the attempt** (retry with backoff; terminal + audit after max).

### 5.3 Templates (exact copy — locked)
`templates/join-request-pending.ts` → `renderJoinRequestPending()`:
```
Thanks for requesting to join the Th.D. Scholars channel!

To be approved, complete your registration in the Mini App. We match your DIBI Registration ID against the Registrar's roster — if your record is active, you'll be approved automatically.

[ inline button: "Complete Registration" → MINIAPP_URL ]
```
`templates/invite-link.ts` → `renderInviteLink({ name, link, expiresInHours })`:
```
✅ Welcome, {name}!

Your registration was approved. Tap the link below to join the Th.D. Scholars channel:

{link}

This link works once and expires in {expiresInHours} hours. If it expires before you use it, run /mystatus or contact the Registrar.
```
(Approval/decline copy already exists from Phase 7 and is reused.)

### 5.4 `services/api-client.ts` additions
`recordJoinRequest(body)`, `claimJoinRequests({ limit })`, `completeJoinRequest(id, body)` — same `X-Internal-Token`, timeout, and `BotApiError` behaviour as `getUserStatus`.

### 5.5 Config (bot env)
| Var | Type | Default | Use |
|---|---|---|---|
| `BOT_CHANNEL_ID` | string, min 1 | — | channel id or `@username` for invite links |
| `BOT_OUTBOX_POLL_INTERVAL_MS` | int, positive | `5000` | poll cadence |
| `BOT_OUTBOX_BATCH_SIZE` | int, positive | `10` | max tasks per tick |

`index.ts` starts the delivery loop after `setMyCommands` and stops it on `SIGINT`/`SIGTERM` (before `bot.stop`).

## 6. Entry-point caveat (accepted)
A bot can only DM a user who has pressed Start. A1 solves the immediate pending DM via `user_chat_id`. Delivery-time DMs (approval/decline/invite) go to `telegramUserId` and can fail if the user never started the bot — for approve/decline that is logged and non-fatal (A3); for the invite path it is a retryable failure (A3). In the narrow crash-after-approve window the retry detects membership and marks delivered without re-DMing (A2) — the user is in the channel but may miss the welcome message.

## 7. Tests

**API — unit:** controller validation (uuid/non-uuid `:id`, body shape); backoff computation; `isJoinRequestGone` classification lives in the bot, so API unit tests focus on the repository/controller.

**API — integration (`*.int.test.ts`, test DB via fixtures):**
1. `POST /internal/join-requests` creates a `pending` row and upserts the user; a second call does **not** create a second pending row.
2. record does **not** overwrite `full_name` (seed a user with a DIBI name, then record → name unchanged).
3. `POST /api/registrations` with an open pending row → row updated to the decision, `chat_id` preserved, `delivery_status='pending'`, `attempts=0`.
4. `POST /api/registrations` with no pending row → a decided row with `chat_id = NULL`.
5. `claim` returns the decided row, sets `processing`, increments `attempts`.
6. two concurrent claims (`Promise.all`) do **not** double-claim (SKIP LOCKED).
7. `complete(delivered)` sets `delivered_at`; repeat complete → 200 no-op.
8. `complete(failed)` below max → `pending` + `next_attempt_at`, `delivery_error` set; at/over max → `failed` + `audit_logs` row.
9. `complete(delivered)` with `inviteLink` → exactly one `invite_links` row; **repeat complete → still exactly one row, no error**.
10. a stale `processing` lease older than the window is reclaimed on the next claim.
11. `401` without token; `400` invalid body; `404` unknown `:id`.

**Bot — unit:**
1. `join-request` handler: records via API and DMs `user_chat_id` with the button; missing `user_chat_id` → logged, non-fatal (no throw).
2. delivery executor, all four actions (approve/decline/invite/decline-dm-only) with a fake `telegram` + fake client.
3. **crash-after-approve retry:** first attempt approves but never completes (simulate crash); row reclaimed; second attempt's `approveChatJoinRequest` throws *request-gone*, `getChatMember` returns `member` → `complete(delivered)` and **no** `createChatInviteLink` / no invite payload.
4. approve *request-gone* + **not** a member → invite path taken.
5. **invite-path DM failure:** `sendMessage` throws → `revokeChatInviteLink` called and `complete(failed)` reported (attempt counted).
6. decline *request-gone* → `complete(delivered)`.
7. templates: exact-copy assertions for `join-request-pending` and `invite-link` (guards wording drift), button URL from `MINIAPP_URL`.
8. env: `BOT_CHANNEL_ID` required; poll/batch defaults.

## 8. Files added / changed

**Added — API:** `apps/api/src/db/migrations/0008_join_request_delivery.sql`; `apps/api/src/controllers/internal-join-requests-controller.ts` (+ `.test.ts`); `apps/api/src/services/internal-join-requests.int.test.ts`; repository additions to `join-requests.repository.ts` (`recordJoinRequest`, `decideJoinRequest`, `claimJoinRequests`, `completeJoinRequest`, `getJoinRequestById`).
**Changed — API:** `internal-routes.ts` (3 routes), `registration.service.ts` (enqueue via `decideJoinRequest`), `config/env.ts` (+4 vars), `settings.repository.ts` (small `getInviteLinkExpirySeconds` helper).
**Added — shared:** `schemas/join-requests.ts`; `types/internal.ts` (or additions to `entities.ts`/`enums.ts`); tests.
**Added — bot:** `handlers/join-request.ts` (+ test); `services/delivery.ts` (+ test); `templates/{join-request-pending,invite-link}.ts` (+ tests); `utils/telegram-errors.ts` (`isJoinRequestGone`).
**Changed — bot:** `bot.ts` (register handler), `index.ts` (start/stop loop), `services/api-client.ts` (+3 methods), `config/env.ts` (+3 vars), `.env.example`, `templates/index.ts`.
**Docs:** `api-reference.md` (three internal endpoints + registration enqueue note), `database-schema.md` (columns/index/migration 0008), `workflows.md` (#1 no longer "deferred"; describe queue/retry), `security.md` (note the invite-link path + non-fatal DM policy), `README.md` (bot env table additions).

## 9. Out of scope (will not build)
- Admin/Registrar UI or endpoint to view/retry failed deliveries (rows are queryable; surfaced in a later phase).
- A generic/reusable outbox for content posting or notifications.
- Any Mini App change (`POST /api/registrations` contract is unchanged).
- `/internal/content/:id/confirm`, content posting, member removal.
- Phase 9. **Phase 9 must not start.**
