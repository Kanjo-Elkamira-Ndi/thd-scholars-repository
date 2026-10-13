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

**Mini App UI map:** `Roster` screen → **Scholars** tab → search/filter (`GET /api/roster?search=&status=&cohortYear=`) → tap a `RosterCard` → `RosterDetailSheet` (`GET /api/roster/:id`) → `RosterStatusForm` → Save → **confirm dialog** → `PATCH /api/roster/:id`. Moving to `graduated`/`withdrawn` shows "This will flag the scholar for access review…" before committing; re-activating shows "This cancels any pending removal and keeps the scholar in the channel."

## 3. Quarterly Roster Audit — implemented (Phase 10), automated (Phase 11)
**Actor:** Registrar or Admin, plus the scheduled `quarterly_audit` job
**Trigger:** scheduled (quarterly) or manually initiated.

1. User opens Mini App → Roster → Audit view, backed by `GET /api/roster/audit`; the scheduled job runs the **same** `computeRosterAudit` function (`roster-audit.service.ts`), so the two never disagree. That function takes no `req`/user/role input.
2. The API cross-references `roster` entries against `channel_membership` (the bot-observed snapshot). The Telegram Bot API cannot enumerate chat members, so the bot's membership-sync loop periodically asks about known `telegram_id`s and pushes a snapshot (`PUT /internal/members/snapshot`); the audit reads that snapshot.
3. Mismatches are listed, scoped to roster entries only (staff without a roster row are never flagged): `active_not_member`, `inactive_still_member`, and `membership_unknown` (no snapshot yet — surfaced so the view can prompt a manual re-verification rather than silently passing).

**Mini App UI map:** `Roster` screen → **Audit** tab → `AuditList` (`GET /api/roster/audit`, response `200 { issues: RosterAuditEntry[] }`) renders a `RosterAuditPill` per issue and an empty state ("No mismatches right now") when clean. The **Access review** tab lists `accessReviewPending=true` entries via `GET /api/roster?accessReviewPending=true`.
4. **Scheduled run:** on the `AUDIT_JOB_CRON` schedule (default quarterly), the API claims this quarter's `quarterly_audit` run in `job_runs` (atomically, once per `run_key`, retaken only if the prior run failed or its lease went stale), writes a `quarterly_roster_audit` audit row, and enqueues one `audit_flagged` notification per Admin with the flagged count. Startup catch-up runs the current quarter's audit once if it has not completed.
5. For each flagged entry, Admin (or Registrar within their permitted boundary — see `security.md`) confirms removal via `POST /api/members/:userId/remove`.
6. Each removal enqueues a `member_removals` task (the bot performs the actual kick on its next tick), writes an `audit_logs` entry, and revokes any still-active `invite_links` for that user.

## 4. Access Revocation (Graduation/Withdrawal Follow-Through) — implemented (Phase 10)
**Actor:** Admin (confirming), triggered from Workflow 2's flag
**Trigger:** a roster status change to `graduated`/`withdrawn` creates a flagged, unconfirmed item.

1. Admin sees the flagged item on their dashboard (`GET /api/dashboard/stats` surfaces a count; a dedicated list view shows the detail).
2. Admin reviews and confirms removal (or, rarely, overrides — e.g., a brief re-enrollment) via the Mini App.
3. Confirmed removal calls `POST /api/members/:userId/remove`, enqueues a `member_removals` task, and logs to `audit_logs`. A registrar may confirm only within their permitted boundary (a flagged graduated/withdrawn record, which also clears `access_review_pending`); re-activating a roster entry cancels any pending removal.
4. The bot's member-removal loop then leases the task (`POST /internal/members/removals/claim`), bans then unbans the user, and confirms (`.../:id/confirm`).
5. This two-step design (flag → confirm) exists specifically so no student is auto-kicked by a data-entry change without a human checkpoint — see FR20.
6. **Weekly reminder (Phase 11):** the `access_review_reminder` job (`ACCESS_REVIEW_REMINDER_CRON`, default Monday 06:00) enqueues one `access_review_reminder` notification to every Admin with the pending count, at most once per ISO week (`run_key` e.g. `2026-W05`; the week is computed in `JOBS_TIMEZONE`). Startup catch-up runs the current week's reminder once if it has not completed.

## 5. Faculty Posts Content — implemented (Phase 9)
**Actor:** Faculty
**Trigger:** new lecture/seminar/resource ready to share.

1. Faculty opens Mini App → Content → New Post.
2. Faculty fills in Title, Discipline tag, Format tag, Cohort (optional), and either uploads a file or pastes a Drive link.

**Mini App UI map:** `Content` → "New post" (`/content/new`, Faculty/Admin only) → `ContentForm` collects title/discipline/format/cohort and `DriveOrFileField` picks exactly one source (inline MIME + size errors before upload). File → `POST /api/content` (multipart via XHR with a progress bar + Cancel while uploading; Telegram closing-confirmation is on); link → `POST /api/content` (JSON). Success → back to `Content`; a network failure shows "Upload interrupted — check the Content list before retrying."
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

**Mini App UI map:** tap a `ContentCard` → `ContentDetailSheet` (`GET /api/content/:id`) with "Open in channel" (`openTelegramLink`, hidden until `telegramMessageId` exists) and "Open Drive link" (`openLink`). Edit/Delete are shown only to the owner or an Admin — a non-owner reaching `/content/:id/edit` directly gets `AccessDenied`, and the server still enforces ownership (Authorisation is UI-honest, not UI-enforced). Delete → `ConfirmDialog` ("Delete post") → `DELETE /api/content/:id`.

## 7. Admin Assigns/Changes a Role — implemented (Phase 10)
**Actor:** Admin
**Trigger:** a new Faculty member needs posting access, a Scholar is promoted to Registrar, etc.

1. Admin opens Mini App → Users → selects a user.
2. Admin changes role via `PATCH /api/users/:id/role`. The API refuses a self-change and refuses to demote the last remaining admin (row-locked, concurrency-safe).
3. API logs the change to `audit_logs` and enqueues a `role_changed` notification **inside the same transaction** as the role change (so a rolled-back change enqueues nothing). The bot delivers it on its next tick (FR26).

## 8. Admin Reviews Audit Logs — implemented (Phase 10)
**Actor:** Admin
**Trigger:** routine oversight, or investigating a specific concern.

1. Admin opens Mini App → Audit Logs, backed by `GET /api/audit-logs`, filterable by action/actor/target type.
2. This view is read-only — the table is append-only and enforced by a database trigger that rejects `UPDATE`/`DELETE` (see `security.md`).

## 9. Repeated Registration Failure (Abuse/Error Signal) — implemented (Phase 11)
**Actor:** system-initiated, surfaces to Registrar/Admin
**Trigger:** the same `telegram_id` submits failing registrations repeatedly (`REPEATED_REGISTRATION_FAILURE_THRESHOLD` within `REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS`).

1. API detects the pattern on a registration attempt.
2. After the registration transaction commits (best-effort, so a notification outage never rolls back a user's registration) the API enqueues a `repeated_registration_failure` notification to every Admin and Registrar. The dedupe key includes a time bucket (`repeated_failure:{userId}:{bucket}`), so re-hitting the threshold in the same window enqueues nothing further per recipient. It never auto-blocks the user, since this could be a legitimate student making a data-entry mistake.
3. Registrar/Admin can reach out directly or pre-load a correct roster entry (Workflow: `POST /api/roster`) if the issue is a roster gap rather than user error.

## 10. Notification Delivery (Bot → User) — implemented (Phase 11)
**Actor:** API (enqueue) → Bot Service (deliver)
**Trigger:** any of the five notification events.

1. A domain action calls `notifications.service` with the event and payload. Admin/Registrar-facing events (`audit_flagged`, `access_review_reminder`, `repeated_registration_failure`) fan out to **all** matching recipients; each gets its own row keyed by `(recipient_user_id, dedupe_key)`.
2. The `notifications` row is written in the action's transaction where correctness demands it (`role_changed`), otherwise right after commit (`repeated_registration_failure`).
3. The bot's notification loop leases pending rows (`POST /internal/notifications/claim`), renders the HTML template (role names are whitelisted; all interpolations are escaped), DMs the user, and confirms (`.../:id/confirm`).
4. A transient failure is retried with exponential backoff up to `NOTIFICATION_MAX_ATTEMPTS`. A **terminal** failure (bot blocked, chat not found, user deactivated) fails immediately and is logged at `warn` with only the role and user id — no PII. Because the bot can only DM users who have started it, deploy docs require every Admin and Registrar to press **Start** once.

## FR26 / FR27 coverage note
- **FR27** (repeated registration failure → alert staff): Workflow 9 (`repeated_registration_failure`).
- **FR26** (notify a user when their role or access changes): covered by `role_changed` (Workflow 7) and `member_removal_requested`. There is deliberately **no** `registration_received` notification — a registration decision already produces an approve/decline DM through the join-request delivery loop (Workflow 1), so a second message on that path would be redundant.

## Relationship to Phase 1
Workflows 1 (registration) and parts of 4 (removal) replace the manual steps from the Phase 1 Google Form process. The onboarding/approval message copy and the hashtag/content-tagging conventions carry over unchanged — only the mechanism moves from manual Sheet-checking to automated roster matching.
