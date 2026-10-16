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

## Roster (Registrar + Admin)

### `GET /api/roster`
List/search/filter the roster.
- **Auth:** Registrar, Admin (others → `403`).
- **Query params:** `status` (`active|graduated|withdrawn|pending`), `cohortYear`, `accessReviewPending` (`true|false`; the Mini App's Access-review tab uses `true`), `search` (matches `registrationId` or the linked user's `full_name`, case-insensitive), `page` (default 1), `pageSize` (default 20, max 100).
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

### `GET /api/roster/:id`
Fetch a single roster entry (used by the Mini App's scholar detail sheet). `:id` must be a UUID.
- **Auth:** Registrar, Admin.
- **Response:** `200 { rosterEntry: RosterEntry }`.
- **Errors:** `404 NOT_FOUND` (unknown id), `400 VALIDATION_ERROR` (non-UUID id).

### `GET /api/roster/audit`
Returns the quarterly-audit view: roster entries whose status no longer matches actual channel membership.
- **Auth:** Registrar, Admin.
- **Response:** `200 { issues: RosterAuditEntry[] }` — each `RosterAuditEntry` carries `{ roster: { id, userId, registrationId, status, cohortYear }, membership: ChannelMembership | null, issue: 'active_not_member' | 'inactive_still_member' | 'membership_unknown' }` (enum source: `RosterAuditIssue`).
- **Behaviour:** computed by `computeRosterAudit()` in `apps/api/src/services/roster-audit.service.ts` — the same API-layer function the quarterly audit job calls, so the API view and the scheduled notification can never disagree. The function is pure with respect to request context (no user/role/`req` dependency).

## Content (Faculty + Admin)

### `GET /api/content`
Searchable/filterable content index of published/non-deleted posts.
- **Auth:** verified member — Faculty, Registrar, Admin, and Scholars with an `active` roster entry. A Scholar without an active entry gets `403 NOT_VERIFIED`.
- **Query params:** `discipline`, `format`, `cohortYear`, `search`, `mine` (`true` — only the caller's own posts, used by the dashboard's "Failed deliveries" / "My posts" deep links), `deliveryStatus` (`pending|processing|posted|failed`), `page` (default `1`), `pageSize` (default `20`, max `100`); unknown/`enum`-mismatched values → `400 VALIDATION_ERROR`.
- **Response:** `200 { items: ContentPost[], total, page, pageSize }`. `search` is matched with an escaped `ILIKE` (`%`/`_`/`\` treated literally).

### `GET /api/content/:id`
Fetch a single content post (used by the Mini App's post detail sheet). `:id` must be a UUID.
- **Auth:** verified member (same rule as the index).
- **Response:** `200 { contentPost: ContentPost }`.
- **Errors:** `404 NOT_FOUND` (unknown or soft-deleted id), `400 VALIDATION_ERROR` (non-UUID id).

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
- **Side effects:** inserts a `member_removals` outbox row (the Bot Service performs the actual `banChatMember`/`unbanChatMember` on its next removal tick — the API never calls Telegram directly), revokes any still-active invite links for the user, and — when a new row was created — writes an `audit_logs` row, clears `access_review_pending` (Registrar path), and enqueues a `member_removal_requested` notification. Re-requesting an already-pending removal is an idempotent no-op (`created: false`, no duplicate audit/notification).

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
- **Response:** `{ settings: SystemSettings }` — `{ registrationIdPattern: string, availableCohortYears: number[], inviteLinkExpirySeconds: number, maxUploadSizeBytes: number, maxContentUploadBytes: number }` (shapes defined in `packages/shared` as `SystemSettings`).
- **Auth:** Admin.

### `PATCH /api/settings`
Update system configuration.
- **Body:** any subset of `SystemSettings`; at least one field required (validated by `settingsUpdateSchema` in `packages/shared`). `registrationIdPattern` must be a valid regular expression.
- **Auth:** Admin.

## Dashboard (all roles)

### `GET /api/dashboard`
Role-aware summary for the Home screen. One endpoint serves every role; the **server decides which variant to build from the caller's role stored in the database** — a query/body/header hint is never read, so a forged hint cannot change the payload.
- **Auth:** any authenticated Telegram user.
- **Response:** `{ dashboard: DashboardPayload }`, a discriminated union on `role` (shapes in `packages/shared` as `ScholarDashboard | FacultyDashboard | RegistrarDashboard | AdminDashboard`):
  - **Scholar** — `{ role, roster: RosterEntry | null, recentContent: ContentPost[] }`. `recentContent` is populated **only** while the roster entry is `active` (otherwise `[]`); without a roster entry `roster` is `null` and the Mini App shows the "not linked yet" state.
  - **Faculty** — `{ role, myContentCount, failedDeliveries, recentContent }` (own posts only; counts exclude soft-deleted rows).
  - **Registrar** — `{ role, totalScholars, pendingAccessReviews, myPendingAccessReviews, rosterAuditIssues }`. `myPendingAccessReviews` = flagged (`access_review_pending`) records whose last updater is the caller.
  - **Admin** — `{ role, totalScholars, pendingJoinRequests, pendingAccessReviews, contentByDiscipline: { discipline, count }[], recentActivity }`. `recentActivity` is ≤10 entries trimmed to `{ action, actorUserId, targetType, createdAt }` — `details` is never exposed. `contentByDiscipline` excludes soft-deleted rows.
- **Shared definitions:** `totalScholars` = roster rows with `status = 'active'`; `pendingJoinRequests` = join requests pending within the last 30 days (identical for registrar and admin surfaces); `pendingAccessReviews` = roster rows with `access_review_pending = true`.
- **Behaviour:** re-reads the roster/role state per call (no cached role), returns `200 { dashboard }`.

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
- **Behaviour:** first reclaims stale leases (`processing` older than `JOIN_REQUEST_DELIVERY_LEASE_SECONDS`), then leases claimable rows (`status <> 'pending' AND delivery_status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())`), marking them `processing` and incrementing `delivery_attempts`. A row is never leased twice concurrently.

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
List every user whose channel membership should be re-checked (Bot Service membership-sync loop). Read-only.
- **Auth:** `X-Internal-Token`.
- **Response:** `200 { targets: { userId, telegramId }[] }` — currently **all** users (ordered by `created_at`); there is no filter or cap.
- **Behaviour:** the Telegram Bot API cannot enumerate chat members, so the API can only ask the bot to check a known set of `telegram_id`s one at a time (throttled by the bot's `BOT_MEMBERSHIP_SYNC_RATE_PER_SEC`). The loop is a full sweep each run, which also covers users who joined since the previous sweep.

### `PUT /internal/members/snapshot`
Persist the bot's freshly observed membership for a batch of users.
- **Body:** `{ members: { telegramId, isMember, memberStatus }[] }` (`membershipSnapshotSchema`; `memberStatus` is the raw Telegram status string).
- **Response:** `200 { updated: number }`.
- **Behaviour:** upserts each `channel_membership` row keyed by the resolved `user_id` (`is_member`, `member_status`, `checked_at`; the table has no `telegram_id` column). Unknown `telegram_id`s are ignored. The snapshot is authoritative for `GET /api/members` and `GET /api/roster/audit`.

### `POST /internal/members/removals/claim`
Lease up to `limit` member-removal tasks for the Bot Service removal loop.
- **Body:** `{ limit?: number }` (1–`MEMBER_REMOVAL_MAX_BATCH`, optional).
- **Response:** `200 { items: MemberRemovalTask[] }` — each item carries `{ id, userId, telegramId, attempts }`.
- **Behaviour:** first reclaims stale leases (`processing` older than `MEMBER_REMOVAL_LEASE_SECONDS`), then leases claimable rows (`status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) AND (initiated_by_role = 'admin' OR the roster row is still graduated/withdrawn)`), marking them `processing` and incrementing `attempts`. A registrar-initiated task whose roster row has returned to `active` is simply **not claimable** — it is cancelled separately when the roster status changes back (`cancelPendingRemovalsForUser`), not at claim time.

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

### `POST /internal/notifications/claim`
Lease up to `limit` pending notifications for the Bot Service delivery loop.
- **Body:** `{ limit?: number }` (1–100, optional; defaults to `NOTIFICATION_BATCH_SIZE`).
- **Response:** `200 { items: NotificationTask[] }` — each item carries `{ id, userId, telegramId, event, payload, attempts, recipientRole }`.
- **Behaviour:** first reclaims stale leases (`processing` older than `NOTIFICATION_LEASE_SECONDS`), then leases claimable rows (`status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())`) with `FOR UPDATE SKIP LOCKED`, marking them `processing` and incrementing `attempts`. Only recipients that still have a `telegram_id` are leased. A row is never leased twice concurrently. `recipientRole` is derived from the recipient's current role in `users` at claim time (the `notifications` table has no role column).

### `POST /internal/notifications/:id/confirm`
Bot reports the outcome of a leased notification; the API finalizes the `notifications` row.
- **Path param:** `id` must be a UUID (else `400 VALIDATION_ERROR`); unknown → `404 NOT_FOUND`.
- **Body:** `{ outcome: 'sent' | 'failed', error?, terminal? }` (`notificationConfirmSchema`).
- **Response:** `200 { status: NotificationStatus }`.
- **Behaviour:** `sent` marks the row sent. `failed` reschedules with exponential backoff, or — when `terminal = true` (bot blocked, chat not found, user deactivated) or `attempts` reaches `NOTIFICATION_MAX_ATTEMPTS` — marks the row failed. Terminal delivery failures are logged at `warn` with ids only (`notificationId`, `event`, `attempts`) — no PII. Idempotent: repeating on an already-terminal row is a 200 no-op.

## Conventions
- List endpoints are paginated with `page`/`pageSize` (max `100`). Defaults vary by endpoint: `pageSize=20` for roster and content, `pageSize=50` for audit logs.
- All mutating endpoints that touch `roster`, `users.role`, `content_posts`, or membership write an `audit_logs` row in the same transaction as the primary write — never as an afterthought call.
- Validation schemas live in `packages/shared/src/schemas` and are imported by both the API validators and the Mini App forms, so a rule change happens in one place.
