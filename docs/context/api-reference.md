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
- **Side effects:** writes an `join_requests` row (`approved`/`declined`) and an `audit_logs` row in one transaction; on approval links the roster row to the user and stamps `users.full_name`/`email`/`telegram_username`. The Telegram join-request approve/decline call is deferred to the Bot Service phase (see `workflows.md`).

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
Searchable/filterable content index.
- **Auth:** any verified Scholar and above.
- **Query params:** `discipline`, `format`, `cohortYear`, `search`, `page`, `pageSize`.

### `POST /api/content`
Create a content post. Triggers the bot to publish to the channel.
- **Auth:** Faculty, Admin.
- **Body:** `{ title, disciplineTag, formatTag, cohortYear?, driveLink? }` plus a file upload (multipart) when not using a Drive link.
- **Response:** `{ contentPost: ContentPost }` — `telegramMessageId` populated once the bot confirms the post (may require polling or a webhook callback — see `workflows.md`).

### `PATCH /api/content/:id`
Edit a content post's metadata.
- **Auth:** Admin (any post), Faculty (own posts only — enforced server-side, not just hidden in UI).

### `DELETE /api/content/:id`
Remove a content post (also attempts to delete the channel message).
- **Auth:** Admin (any post), Faculty (own posts only).

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

### `POST /internal/join-requests/:id/complete`
Bot confirms it executed the Telegram approve/decline call; API finalizes the `join_requests` row.

### `POST /internal/content/:id/confirm`
Bot confirms it posted to the channel; API stores `telegramMessageId`.

## Conventions
- All list endpoints are paginated by default (`page`, `pageSize`, default `pageSize=20`, max `100`).
- All mutating endpoints that touch `roster`, `users.role`, `content_posts`, or membership write an `audit_logs` row in the same transaction as the primary write — never as an afterthought call.
- Validation schemas live in `packages/shared/src/schemas` and are imported by both the API validators and the Mini App forms, so a rule change happens in one place.
