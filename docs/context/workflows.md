# Workflows

End-to-end user journeys, mapped to the roles in `project-overview.md` and the endpoints in `api-reference.md`. Each workflow names the actor, the trigger, and the sequence of system actions.

## 1. Scholar Registration (new user)
**Actor:** unverified user → Scholar
**Trigger:** user taps "Request to Join" on the Telegram channel (Path 1), or opens the bot / Mini App directly (Path 2).

1. Bot's `/start` message explains the process and its "Open Registration" inline button deep-links (via `MINIAPP_URL`) into the Mini App registration form. After registering, the user can run `/mystatus` in the bot to see their current roster status.
2. **Path 1 (channel request):** when the user taps "Request to Join", Telegram emits `chat_join_request`; the bot records it via `POST /internal/join-requests` (upserting the user and a `pending` `join_requests` row with the channel `chat_id`) and DMs the requester a "Complete Registration" button to the Mini App. Path 2 (no channel request) skips this step.
3. User fills out: Full Name, DIBI Registration ID, Cohort Year, Email, Telegram Username (auto-filled), Program Track, Supervisor (optional), Declaration checkbox.
4. Mini App submits `POST /api/registrations`.
5. API validates the Registration ID format (against the configurable regex), looks up `roster` by `registration_id`.
6. **If matched and `status = active`:** API marks `join_requests.status = approved`, links the roster row to the user, stamps the user's profile, and writes an `audit_logs` row in the same transaction. The decision also **enqueues a delivery task** on the same row (`delivery_status = 'pending'`), updating an open `pending` `chat_join_request` row in place so its `chat_id` is preserved; otherwise a new decided row with `chat_id = null` is created.
7. **If no match, or matched but not active:** API marks `join_requests.status = declined` with a `reason`, and writes an `audit_logs` row; the delivery task is enqueued the same way.
8. **Delivery (Bot Service outbox loop):** the bot periodically claims decided tasks (`POST /internal/join-requests/claim`) and executes them — for Path 1, `approveChatJoinRequest`/`declineChatJoinRequest` followed by the approval/decline DM; for Path 2 approval, a single-use invite link (`createChatInviteLink`, `member_limit: 1`, expiring after `inviteLinkExpirySeconds`) DM'd to the user. It then reports `POST /internal/join-requests/:id/complete`. A delivery that fails (e.g. the bot was down, or a DM was blocked) is retried with exponential backoff up to `JOIN_REQUEST_DELIVERY_MAX_ATTEMPTS`; after that it is marked `failed` and an `audit_logs` row is written. A request that has already disappeared (`HIDE_REQUESTER_MISSING`/`USER_ALREADY_PARTICIPANT`) is treated as delivered if the user is already a member, otherwise it falls back to the invite link.
9. API writes an `audit_logs` entry either way.
10. If the same `telegram_id` fails validation/matching repeatedly (threshold configurable), API notifies Registrar/Admin per FR27.

## 2. Registrar Updates Enrollment Status
**Actor:** Registrar
**Trigger:** a student graduates, withdraws, or their info changes.

1. Registrar opens Mini App → Roster → searches/finds the student.
2. Registrar edits the record via `PATCH /api/roster/:id`, most commonly changing `status`.
3. API writes the change, logs old/new value to `audit_logs`.
4. **If new status is `graduated` or `withdrawn`:** the record is flagged in the "pending access review" view (does not auto-remove from the channel — see Workflow 4).

## 3. Quarterly Roster Audit — implemented (Phase 10)
**Actor:** Registrar or Admin
**Trigger:** scheduled (quarterly) or manually initiated.

1. User opens Mini App → Roster → Audit view, backed by `GET /api/roster/audit`.
2. The API cross-references `roster` entries against `channel_membership` (the bot-observed snapshot). The Telegram Bot API cannot enumerate chat members, so the bot's membership-sync loop periodically asks about known `telegram_id`s and pushes a snapshot (`PUT /internal/members/snapshot`); the audit reads that snapshot.
3. Mismatches are listed, scoped to roster entries only (staff without a roster row are never flagged): `active_not_member`, `inactive_still_member`, and `membership_unknown` (no snapshot yet — surfaced so the view can prompt a manual re-verification rather than silently passing).
4. For each flagged entry, Admin (or Registrar within their permitted boundary — see `security.md`) confirms removal via `POST /api/members/:userId/remove`.
5. Each removal enqueues a `member_removals` task (the bot performs the actual kick on its next tick), writes an `audit_logs` entry, and revokes any still-active `invite_links` for that user.

## 4. Access Revocation (Graduation/Withdrawal Follow-Through) — implemented (Phase 10)
**Actor:** Admin (confirming), triggered from Workflow 2's flag
**Trigger:** a roster status change to `graduated`/`withdrawn` creates a flagged, unconfirmed item.

1. Admin sees the flagged item on their dashboard (`GET /api/dashboard/stats` surfaces a count; a dedicated list view shows the detail).
2. Admin reviews and confirms removal (or, rarely, overrides — e.g., a brief re-enrollment) via the Mini App.
3. Confirmed removal calls `POST /api/members/:userId/remove`, enqueues a `member_removals` task, and logs to `audit_logs`. A registrar may confirm only within their permitted boundary (a flagged graduated/withdrawn record, which also clears `access_review_pending`); re-activating a roster entry cancels any pending removal.
4. The bot's member-removal loop then leases the task (`POST /internal/members/removals/claim`), bans then unbans the user, and confirms (`.../:id/confirm`).
5. This two-step design (flag → confirm) exists specifically so no student is auto-kicked by a data-entry change without a human checkpoint — see FR20.

## 5. Faculty Posts Content — implemented (Phase 9)
**Actor:** Faculty
**Trigger:** new lecture/seminar/resource ready to share.

1. Faculty opens Mini App → Content → New Post.
2. Faculty fills in Title, Discipline tag, Format tag, Cohort (optional), and either uploads a file or pastes a Drive link.
3. **Size routing:** the API verifies the declared and magic-byte MIME against the format whitelist. A file at or below `maxUploadSizeBytes` (the Drive threshold) is staged on disk for a Telegram upload; a file above it is uploaded resumably to a Shared Drive and only the share link (`https://drive.google.com/…`) is stored. Anything above `maxContentUploadBytes` is rejected (`400`).
4. API creates the `content_posts` row with `pending_action = 'publish'` (`POST /api/content`) and writes a `content_created` audit row in the same transaction.
5. The Bot Service outbox loop leases the task (`POST /internal/content/claim`), renders the channel template, and posts it — `sendMessage` for a Drive link, or `sendAudio`/`sendVideo`/`sendDocument` for a staged file it fetches from `GET /internal/content/:id/download`.
6. Bot confirms via `POST /internal/content/:id/confirm` (`outcome: 'posted'`); the API stores `telegram_message_id` and clears the staged file. A failed send is retried with backoff until `CONTENT_DELIVERY_MAX_ATTEMPTS`, then marked `failed` with a `content_delivery_failed` audit row.
7. Post appears in the searchable content index (`GET /api/content`) for verified members.

## 6. Content Edit/Removal — implemented (Phase 9)
**Actor:** Faculty (own posts) or Admin (any post)
**Trigger:** correction needed, or content no longer relevant.

1. User opens the post from the content index, selects Edit or Remove.
2. API enforces ownership (Faculty limited to `posted_by = self`) before allowing the mutation — see `security.md`.
3. Edit: `PATCH /api/content/:id` updates metadata (does not re-post to the channel) and writes a `content_updated` audit row.
4. Remove: a post that was never claimed by the bot is hard-deleted and its staged file unlinked immediately; an already-published post is soft-deleted and `pending_action = 'delete'` so the bot deletes the channel message on its next tick. If a publish confirms after a delete was queued, the message id is stored but the delete is **never** cancelled (the message is still removed). A delete of an already-gone message counts as success. Every delete writes a `content_deleted` audit row.

## 7. Admin Assigns/Changes a Role — implemented (Phase 10)
**Actor:** Admin
**Trigger:** a new Faculty member needs posting access, a Scholar is promoted to Registrar, etc.

1. Admin opens Mini App → Users → selects a user.
2. Admin changes role via `PATCH /api/users/:id/role`. The API refuses a self-change and refuses to demote the last remaining admin (row-locked, concurrency-safe).
3. API logs the change to `audit_logs`, optionally triggers a notification to the affected user (FR26 — currently a no-PII stub; see `security.md`).

## 8. Admin Reviews Audit Logs — implemented (Phase 10)
**Actor:** Admin
**Trigger:** routine oversight, or investigating a specific concern.

1. Admin opens Mini App → Audit Logs, backed by `GET /api/audit-logs`, filterable by action/actor/target type.
2. This view is read-only — the table is append-only and enforced by a database trigger that rejects `UPDATE`/`DELETE` (see `security.md`).

## 9. Repeated Registration Failure (Abuse/Error Signal)
**Actor:** system-initiated, surfaces to Registrar/Admin
**Trigger:** the same `telegram_id` submits failing registrations repeatedly (threshold configurable).

1. API detects the pattern on a registration attempt.
2. API sends a notification to Registrar/Admin (FR27) — does not auto-block the user, since this could be a legitimate student making a data-entry mistake.
3. Registrar/Admin can reach out directly or pre-load a correct roster entry (Workflow: `POST /api/roster`) if the issue is a roster gap rather than user error.

## Relationship to Phase 1
Workflows 1 (registration) and parts of 4 (removal) replace the manual steps from the Phase 1 Google Form process. The onboarding/approval message copy and the hashtag/content-tagging conventions carry over unchanged — only the mechanism moves from manual Sheet-checking to automated roster matching.
