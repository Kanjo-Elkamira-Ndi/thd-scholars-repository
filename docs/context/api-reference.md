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

## Registration

### `POST /api/registrations`
Submits a registration form. Triggers roster matching and the approve/decline decision.
- **Auth:** any authenticated Telegram user.
- **Body:** `{ fullName, registrationId, cohortYear, email, telegramUsername, programTrack, supervisorName?, declarationAccepted: true }`
- **Response:** `{ decision: 'approved' | 'declined', reason?: string }`
- **Side effects:** writes `join_requests` row, calls Bot Service to approve/decline the Telegram join request, writes `audit_logs` row.

### `GET /api/registrations/:id`
Fetch a single join request (status lookup).
- **Auth:** owner of the request, or Registrar/Admin.

## Roster (Registrar + Admin)

### `GET /api/roster`
List/search/filter the roster.
- **Auth:** Registrar, Admin.
- **Query params:** `status`, `cohortYear`, `search` (matches name/registrationId), `page`, `pageSize`.

### `POST /api/roster`
Pre-load an expected student record (before they've registered).
- **Auth:** Registrar, Admin.
- **Body:** `{ registrationId, cohortYear, programTrack, supervisorName? }`

### `PATCH /api/roster/:id`
Update a roster entry, most commonly `status`.
- **Auth:** Registrar, Admin.
- **Body:** `{ status?, cohortYear?, programTrack?, supervisorName? }`
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
Current system configuration (ID regex pattern, available cohort years, invite link expiry duration).
- **Auth:** Admin.

### `PATCH /api/settings`
Update system configuration.
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
