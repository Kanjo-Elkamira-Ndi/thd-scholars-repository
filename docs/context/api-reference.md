# API Reference

Base URL: `/api` (versioning deferred until there's a second consumer that needs an older contract — not needed at launch).

All requests from the Mini App include the Telegram `initData` string in an `Authorization: tma <initData>` header (the standard Telegram Mini Apps convention). The API verifies this via HMAC before processing any request. Requests from the Bot Service use a separate internal service token (`X-Internal-Token`), never the user's `initData`.

All responses are JSON. Errors follow:
```json
{ "error": { "code": "ROSTER_NOT_FOUND", "message": "No matching roster entry." } }
```

## Auth & Identity

### `GET /api/me`
Returns the current authenticated user, their role, and roster status if applicable.
- **Auth:** any authenticated Telegram user (even unverified).
- **Response:** `{ user: User, roster: RosterEntry | null }`
- **Dev-only auth (never in production):** with `AUTH_MOCK_ENABLED=true`, send `X-Mock-User: {"id": 4444444444, "username": "dev_admin"}` (strict schema — `role`/`email` are rejected) instead of `Authorization: tma <initData>`. When the flag is off the header is ignored. Auth failure → `401`; role denial → `403`.

## Registration

### `POST /api/registrations`
Submits a registration form. Triggers roster matching and the approve/decline decision.
- **Auth:** any authenticated Telegram user.
- **Rate limit:** per `telegram_id` — `REGISTRATION_RATE_LIMIT_MAX` (default 5) requests per `REGISTRATION_RATE_LIMIT_WINDOW_SECONDS` (default 900s). Over the limit → `429 RATE_LIMITED`.
- **Body:** `{ fullName, registrationId, cohortYear, email, telegramUsername, programTrack, supervisorName?, declarationAccepted: true }`
- **Status:** `201 Created`.
- **Response:** `{ decision: 'approved' | 'declined', reason: string | null }` — `reason` is `null` on approval; otherwise `'No matching roster entry found'` or `'Roster record is not active (status: <status>)'`.
- **Errors:** `400 VALIDATION_ERROR` (bad body, e.g. registration id not matching `settings.registrationIdPattern`), `429 RATE_LIMITED`.
- **Side effects:** writes/updates a `join_requests` row (`approved`/`declined`) and an `audit_logs` row in one transaction; on approval links the roster row to the user and stamps `users.full_name`/`email`/`telegram_username`. The decision also **enqueues a delivery task** on the same row (`delivery_status = 'pending'`), which the Bot Service later claims and executes (`approveChatJoinRequest`/`declineChatJoinRequest` or a single-use invite link). An open `pending` `chat_join_request` row is updated in place so its `chat_id` is preserved; otherwise a new decided row with `chat_id = null` is created.

### `GET /api/registrations/:id`
Fetch a single join request (status lookup).
- **Auth:** owner of the request, or Registrar/Admin.

## Roster (Registrar + Admin)

### `GET /api/roster`
List/search/filter the roster.
- **Auth:** Registrar, Admin (others → `403`).
- **Query params:** `status` (`active|graduated|withdrawn|pending`), `cohortYear`, `search` (matches `registrationId` or the linked user's `full_name`, case-insensitive), `page` (default 1), `pageSize` (default 20, max 100).
- **Response:** `{ items: RosterEntry[], total: number, page: number, pageSize: number }`.

### `POST /api/roster`
Pre-load an expected student record (before they've registered).
- **Auth:** Registrar, Admin.
- **Body:** `{ registrationId, cohortYear, programTrack, supervisorName? }`
- **Status:** `201 Created` → `{ rosterEntry: RosterEntry }`.
- **Errors:** `400 VALIDATION_ERROR` (bad body/registration id), `409 CONFLICT` (duplicate `registration_id`).
- **Side effects:** writes an `audit_logs` row (`create_roster_entry`).

### `PATCH /api/roster/:id`
Update a roster entry, most commonly `status`. `:id` must be a UUID (else `400 VALIDATION_ERROR`).
- **Auth:** Registrar, Admin.
- **Body:** `{ status?, cohortYear?, programTrack?, supervisorName? }` (at least one field).
- **Status:** `200 OK` → `{ rosterEntry: RosterEntry }`.
- **Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`.
- **Side effects:** writes an `audit_logs` row. Moving to `graduated`/`withdrawn` sets `rosterEntry.accessReviewPending: true` (and stamps `accessReviewFlaggedAt`); moving back to `active` clears it to `false`.
- **Side effects:** writes `audit_logs` row with old/new status. If status moves to `graduated`/`withdrawn`, flags for Admin access-review rather than auto-removing (see `workflows.md`).

### `GET /api/roster/audit`
Returns the quarterly-audit view: roster entries whose status no longer matches actual channel membership.
- **Auth:** Registrar, Admin.

## Content (Faculty + Admin)

### `GET /api/content`
Searchable/filterable content index of published/non-deleted posts.
- **Auth:** verified member — Faculty, Registrar, Admin, and Scholars with an `active` roster entry. A Scholar without an active entry gets `403 NOT_VERIFIED`.
- **Query params:** `discipline`, `format`, `cohortYear`, `search`, `page` (default `1`), `pageSize` (default `20`, max `100`); unknown/`enum`-mismatched values → `400 VALIDATION_ERROR`.
- **Response:** `200 { items: ContentPost[], total, page, pageSize }`. `search` is matched with an escaped `ILIKE` (`%`/`_`/`\` treated literally).

### `POST /api/content`
Create a content post. The API inserts the row and the Bot Service publishes it (see the delivery loop below).
- **Auth:** Faculty, Admin.
- **Content-Type:** `application/json` (Drive link) **or** `multipart/form-data` (file). Exactly one of `driveLink` or a file, never both.
- **Body:** `title` (≤150), `disciplineTag`, `formatTag`, `cohortYear?`, plus `driveLink?` (must be `https` on `drive.google.com`/`docs.google.com`) **or** a file part (multipart only).
- **Routing:** declared and magic-byte-detected MIME must both be in the format whitelist; a file ≤ the Drive threshold is staged for a Telegram upload, a file above it is uploaded to a Shared Drive and only the share link is stored. A file above `maxContentUploadBytes` → `400`.
- **Response:** `201 { contentPost: ContentPost }` — `telegramMessageId` is populated once the bot confirms.
- **Side effects:** `content_created` `audit_logs` row in the same transaction as the insert.

### `PATCH /api/content/:id`
Edit a content post's metadata (`title`, `disciplineTag`, `formatTag`, `cohortYear`).
- **Auth:** Admin (any post), Faculty (own posts only — enforced server-side, not just hidden in UI). Non-owner Faculty → `403 FORBIDDEN`.
- **Side effects:** `content_updated` `audit_logs` row recording the title and changed fields.

### `DELETE /api/content/:id`
Remove a content post and (when it was published) queue the channel-message delete.
- **Auth:** Admin (any post), Faculty (own posts only).
- **Lifecycle:** a post that was never claimed (`delivery_attempts = 0`, `delivery_status = 'pending'`, no `telegram_message_id`) is hard-deleted and its staged file unlinked immediately; otherwise it is soft-deleted (`deleted_at`, `pending_action = 'delete'`) and the bot deletes the channel message on the next tick. A delete confirmation of an already-gone message is treated as success.
- **Response:** `200 { hardDeleted: boolean }`.
- **Side effects:** `content_deleted` `audit_logs` row (includes the title).

## Membership & Access Control

### `GET /api/members`
Live channel membership, for cross-referencing against the roster.
- **Auth:** Admin.

### `POST /api/members/:userId/remove`
Remove a member from the channel.
- **Auth:** Admin (and Registrar, only when acting on a flagged graduated/withdrawn record — see `security.md` for the exact boundary).
- **Side effects:** calls Telegram API to kick, writes `audit_logs` row.

## Roles & System Configuration (Admin only)

### `GET /api/users`
List users with their roles (for role management).
- **Auth:** Admin.

### `PATCH /api/users/:id/role`
Change a user's role.
- **Auth:** Admin.
- **Body:** `{ role: 'scholar' | 'faculty' | 'registrar' | 'admin' }`
- **Side effects:** writes `audit_logs` row.

### `GET /api/audit-logs`
Paginated audit log viewer.
- **Auth:** Admin.
- **Query params:** `action`, `actorUserId`, `targetType`, `page`, `pageSize`.

### `GET /api/settings`
Current system configuration.
- **Response:** `{ settings: SystemSettings }` — `{ registrationIdPattern: string, availableCohortYears: number[], inviteLinkExpirySeconds: number, maxUploadSizeBytes: number }` (shapes defined in `packages/shared` as `SystemSettings`).
- **Auth:** Admin.

### `PATCH /api/settings`
Update system configuration.
- **Body:** any subset of `SystemSettings`; at least one field required (validated by `settingsUpdateSchema` in `packages/shared`). `registrationIdPattern` must be a valid regular expression.
- **Auth:** Admin.

### `GET /api/dashboard/stats`
Summary stats for the Admin dashboard (total scholars, pending requests, recent activity, content count by discipline).
- **Auth:** Admin.

## Internal endpoints (Bot Service → API only, `X-Internal-Token`)

All internal endpoints require the `X-Internal-Token` header (compared in constant time to `API_INTERNAL_TOKEN`); a missing/incorrect token → `401`. The bot dials the API outbound; the API never calls the bot.

### `POST /internal/join-requests`
Record a channel `chat_join_request` as an open `pending` request.
- **Body:** `{ telegramId, telegramUsername?, firstName?, lastName?, chatId, joinRequestedAt }` (`recordJoinRequestSchema`).
- **Status:** `201 Created`.
- **Response:** `{ joinRequestId }`.
- **Side effects:** upserts the user (by `telegram_id`; an existing `full_name` is never overwritten), then inserts or updates — in place, preserving `chat_id` — the single open `pending` row per user (partial unique index).
- **Errors:** `400 VALIDATION_ERROR`.

### `POST /internal/join-requests/claim`
Lease up to `limit` decided-but-undelivered tasks for the Bot Service outbox loop.
- **Body:** `{ limit?: number }` (1–100, optional; defaults to the configured batch size).
- **Response:** `200 { items: JoinRequestDeliveryTask[], inviteLinkExpirySeconds: number }` — each item carries `{ id, decision, reason, telegramId, chatId, fullName, attempts }`.
- **Behaviour:** first reclaims stale leases (`processing` older than `JOIN_REQUEST_DELIVERY_LEASE_SECONDS`), then leases claimable rows (`status <> 'pending' AND delivery_status = 'pending' AND next_attempt_at <= now()`), marking them `processing` and incrementing `delivery_attempts`. A row is never leased twice concurrently.

### `POST /internal/join-requests/:id/complete`
Bot reports the outcome of a leased task; API finalizes the `join_requests` row.
- **Path param:** `id` must be a UUID (else `400 VALIDATION_ERROR`); unknown → `404 NOT_FOUND`.
- **Body:** `{ outcome: 'delivered' | 'failed', error?, inviteLink?: { link, expiresAt } }` (`completeJoinRequestSchema`; `error` is required when `outcome = 'failed'`).
- **Response:** `200 { deliveryStatus: JoinRequestDeliveryStatus }`.
- **Behaviour:** `delivered` sets `delivered_at` and stores an `invite_links` row when an `inviteLink` is supplied (`ON CONFLICT (link) DO NOTHING`). `failed` reschedules with exponential backoff, or — once `delivery_attempts` reaches `JOIN_REQUEST_DELIVERY_MAX_ATTEMPTS` — marks the row `failed` and writes an `audit_logs` row. Idempotent: repeating on an already-terminal row is a 200 no-op.

### `GET /internal/users/:telegramId/status`
Read a user's verification status for the Bot Service (`/mystatus`). Read-only.
- **Auth:** `X-Internal-Token`.
- **Path param:** `telegramId` must be numeric (else `400 VALIDATION_ERROR`).
- **Response:** `200 { user: User, roster: RosterEntry | null }` (same shape as `GET /api/me`).
- **Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND` (unknown user).

### `GET /internal/members/reconcile-targets`
List users whose channel membership should be re-checked (Bot Service membership-sync loop). Read-only.
- **Auth:** `X-Internal-Token`.
- **Response:** `200 { targets: { userId, telegramId }[] }` — pending/open join requests plus roster entries whose membership is stale; capped at a bounded batch.
- **Behaviour:** the Telegram Bot API cannot enumerate chat members, so the API can only ask the bot to check a known set of `telegram_id`s one at a time.

### `PUT /internal/members/snapshot`
Persist the bot's freshly observed membership for a batch of users.
- **Body:** `{ members: { telegramId, isMember, memberStatus }[] }` (`membershipSnapshotSchema`; `memberStatus` is the raw Telegram status string).
- **Response:** `200 { updated: number }`.
- **Behaviour:** upserts each `channel_membership` row (`telegram_id`, `is_member`, `member_status`, `checked_at`). Unknown `telegram_id`s are ignored. The snapshot is authoritative for `GET /api/members` and `GET /api/roster/audit`.

### `POST /internal/members/removals/claim`
Lease up to `limit` member-removal tasks for the Bot Service removal loop.
- **Body:** `{ limit?: number }` (1–`MEMBER_REMOVAL_MAX_BATCH`, optional).
- **Response:** `200 { items: MemberRemovalTask[] }` — each item carries `{ id, userId, telegramId, attempts }`.
- **Behaviour:** first reclaims stale leases (`processing` older than `MEMBER_REMOVAL_LEASE_SECONDS`), then leases claimable rows, marking them `processing` and incrementing `attempts`. A task whose roster row is no longer graduated/withdrawn is skipped (cancelled).

### `POST /internal/members/removals/:id/confirm`
Bot reports the outcome of a leased removal; API finalizes the `member_removals` row.
- **Path param:** `id` must be a UUID (else `400 VALIDATION_ERROR`).
- **Body:** `{ outcome: 'removed' | 'failed', error? }` (`memberRemovalConfirmSchema`; `error` is required when `outcome = 'failed'`).
- **Response:** `200 { status: MemberRemovalStatus }`.
- **Behaviour:** `removed` marks the row done and upserts `channel_membership` with `is_member = false`. `failed` reschedules with `MEMBER_REMOVAL_BACKOFF_BASE_SECONDS`, or — once `attempts` reaches `MEMBER_REMOVAL_MAX_ATTEMPTS` — marks the row failed and writes a `member_removals` `audit_logs` row. Idempotent on an already-terminal row.

### `POST /internal/content/claim`
Lease up to `limit` content posts that need publishing or channel-message deletion.
- **Body:** `{ limit?: number }` (1–100, optional; defaults to `CONTENT_DELIVERY_BATCH_SIZE`).
- **Response:** `200 { items: ContentDeliveryTask[] }` — each item carries `{ id, action: 'publish' | 'delete', title, disciplineTag, formatTag, cohortTag, telegramMessageId, driveLink, hasStagedFile, stagedMimeType, stagedOriginalName }`.
- **Behaviour:** first reclaims stale leases (`processing` older than `CONTENT_DELIVERY_LEASE_SECONDS`), then leases claimable rows, marking them `processing` and incrementing `delivery_attempts`. A task whose staged file is missing on disk is failed terminally here (with a `content_delivery_failed` audit row) and omitted from the batch.

### `POST /internal/content/:id/confirm`
Bot reports the outcome of a leased content task; the API finalizes the `content_posts` row.
- **Path param:** `id` must be a UUID (else `400 VALIDATION_ERROR`).
- **Body:** `{ outcome: 'posted' | 'deleted' | 'failed', telegramMessageId?, error?, terminal? }` (`completeContentTaskSchema`; `telegramMessageId` is required when `outcome = 'posted'`).
- **Response:** `200 { deliveryStatus: ContentDeliveryStatus, hardDeleted?: true }`.
- **Behaviour:** `posted` stores `telegram_message_id`, clears the staged file, and — if a delete was queued mid-publish — keeps `pending_action = 'delete'` so the message is still removed later (never resurrects); a confirm for an already-removed row is a `200 { deliveryStatus: 'posted' }` no-op. `deleted` unlinks the staged file and hard-deletes the row (repeated confirms are idempotent success). `failed` reschedules with `computeBackoffSeconds(attempts)` unless terminal or `attempts >= CONTENT_DELIVERY_MAX_ATTEMPTS`, in which case the row is marked failed and a `content_delivery_failed` audit row (with the title) is written.

### `GET /internal/content/:id/download`
Stream the staged bytes for a file-routed post so the bot can upload them to Telegram.
- **Path param:** `id` must be a UUID (else `400 VALIDATION_ERROR`).
- **Response:** `200` with the stored `Content-Type` and `Content-Disposition: attachment; filename="…"`; `404 NOT_FOUND` when the post, its staged file name, or the file on disk is absent.

## Conventions
- All list endpoints are paginated by default (`page`, `pageSize`, default `pageSize=20`, max `100`).
- All mutating endpoints that touch `roster`, `users.role`, `content_posts`, or membership write an `audit_logs` row in the same transaction as the primary write — never as an afterthought call.
- Validation schemas live in `packages/shared/src/schemas` and are imported by both the API validators and the Mini App forms, so a rule change happens in one place.
