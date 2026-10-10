# Workflows

End-to-end user journeys, mapped to the roles in `project-overview.md` and the endpoints in `api-reference.md`. Each workflow names the actor, the trigger, and the sequence of system actions.

## 1. Scholar Registration (new user)
**Actor:** unverified user → Scholar
**Trigger:** user taps "Request to Join" on the Telegram channel, or opens the bot directly.

1. Bot's `/start` message explains the process and its "Open Registration" inline button deep-links (via `MINIAPP_URL`) into the Mini App registration form. After registering, the user can run `/mystatus` in the bot to see their current roster status.
2. User fills out: Full Name, DIBI Registration ID, Cohort Year, Email, Telegram Username (auto-filled), Program Track, Supervisor (optional), Declaration checkbox.
3. Mini App submits `POST /api/registrations`.
4. API validates the Registration ID format (against the configurable regex), looks up `roster` by `registration_id`.
5. **If matched and `status = active`:** API marks `join_requests.status = approved`, links the roster row to the user, stamps the user's profile, and writes an `audit_logs` row in the same transaction. *The Bot Service call → `approveChatJoinRequest` (and the welcome message) is deferred to the Bot Service phase — this phase only records the decision.*
6. **If no match, or matched but not active:** API marks `join_requests.status = declined` with a `reason`, and writes an `audit_logs` row. *The Bot Service call → `declineChatJoinRequest` (and the "contact the registrar" message) is deferred to the Bot Service phase.*
7. API writes an `audit_logs` entry either way.
8. If the same `telegram_id` fails validation/matching repeatedly (threshold configurable), API notifies Registrar/Admin per FR27.

## 2. Registrar Updates Enrollment Status
**Actor:** Registrar
**Trigger:** a student graduates, withdraws, or their info changes.

1. Registrar opens Mini App → Roster → searches/finds the student.
2. Registrar edits the record via `PATCH /api/roster/:id`, most commonly changing `status`.
3. API writes the change, logs old/new value to `audit_logs`.
4. **If new status is `graduated` or `withdrawn`:** the record is flagged in the "pending access review" view (does not auto-remove from the channel — see Workflow 4).

## 3. Quarterly Roster Audit
**Actor:** Registrar or Admin
**Trigger:** scheduled (quarterly) or manually initiated.

1. User opens Mini App → Roster → Audit view, backed by `GET /api/roster/audit`.
2. System cross-references `roster` entries against `GET /api/members` (live channel membership).
3. Mismatches are listed: roster says inactive but still a channel member, or vice versa.
4. For each flagged entry, Admin (or Registrar within their permitted boundary — see `security.md`) confirms removal via `POST /api/members/:userId/remove`.
5. Each removal writes an `audit_logs` entry and revokes any still-active `invite_links` for that user.

## 4. Access Revocation (Graduation/Withdrawal Follow-Through)
**Actor:** Admin (confirming), triggered from Workflow 2's flag
**Trigger:** a roster status change to `graduated`/`withdrawn` creates a flagged, unconfirmed item.

1. Admin sees the flagged item on their dashboard (`GET /api/dashboard/stats` surfaces a count; a dedicated list view shows the detail).
2. Admin reviews and confirms removal (or, rarely, overrides — e.g., a brief re-enrollment) via the Mini App.
3. Confirmed removal calls `POST /api/members/:userId/remove`, logs to `audit_logs`.
4. This two-step design (flag → confirm) exists specifically so no student is auto-kicked by a data-entry change without a human checkpoint — see FR20.

## 5. Faculty Posts Content
**Actor:** Faculty
**Trigger:** new lecture/seminar/resource ready to share.

1. Faculty opens Mini App → Content → New Post.
2. Faculty fills in Title, Discipline tag, Format tag, Cohort (optional), and either uploads a file or pastes a Drive link.
3. **If file size exceeds the configured threshold:** Mini App uploads directly to Drive, sends the resulting `driveLink` to the API.
4. **Otherwise:** file is sent to the API, which hands it to the Bot Service for direct Telegram upload.
5. API creates the `content_posts` row (`POST /api/content`), triggers Bot Service to post the formatted message to the channel using the discipline/format/cohort hashtag convention established in Phase 1.
6. Bot confirms the post via `POST /internal/content/:id/confirm`, API stores `telegram_message_id`.
7. Post appears in the searchable content index (`GET /api/content`) for all verified Scholars.

## 6. Content Edit/Removal
**Actor:** Faculty (own posts) or Admin (any post)
**Trigger:** correction needed, or content no longer relevant.

1. User opens the post from the content index, selects Edit or Remove.
2. API enforces ownership (Faculty limited to `posted_by = self`) before allowing the mutation — see `security.md`.
3. Edit: `PATCH /api/content/:id` updates metadata (does not re-post to the channel; channel message caption update is a nice-to-have, not required for launch).
4. Remove: `DELETE /api/content/:id` attempts to delete the Telegram channel message and removes the index entry; logs to `audit_logs`.

## 7. Admin Assigns/Changes a Role
**Actor:** Admin
**Trigger:** a new Faculty member needs posting access, a Scholar is promoted to Registrar, etc.

1. Admin opens Mini App → Users → selects a user.
2. Admin changes role via `PATCH /api/users/:id/role`.
3. API logs the change to `audit_logs`, optionally triggers a notification to the affected user (FR26).

## 8. Admin Reviews Audit Logs
**Actor:** Admin
**Trigger:** routine oversight, or investigating a specific concern.

1. Admin opens Mini App → Audit Logs, backed by `GET /api/audit-logs`, filterable by action/actor/target type.
2. This view is read-only — audit logs are never editable (see `security.md`).

## 9. Repeated Registration Failure (Abuse/Error Signal)
**Actor:** system-initiated, surfaces to Registrar/Admin
**Trigger:** the same `telegram_id` submits failing registrations repeatedly (threshold configurable).

1. API detects the pattern on a registration attempt.
2. API sends a notification to Registrar/Admin (FR27) — does not auto-block the user, since this could be a legitimate student making a data-entry mistake.
3. Registrar/Admin can reach out directly or pre-load a correct roster entry (Workflow: `POST /api/roster`) if the issue is a roster gap rather than user error.

## Relationship to Phase 1
Workflows 1 (registration) and parts of 4 (removal) replace the manual steps from the Phase 1 Google Form process. The onboarding/approval message copy and the hashtag/content-tagging conventions carry over unchanged — only the mechanism moves from manual Sheet-checking to automated roster matching.
