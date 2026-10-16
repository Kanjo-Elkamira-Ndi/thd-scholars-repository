# Database Schema

PostgreSQL. Raw `pg` driver — no ORM. All access goes through `apps/api/src/repositories/*`. Migrations are sequential SQL files in `apps/api/src/db/migrations/`, never edited after merge; corrections are new migrations.

## Enum-like values (stored as `text` with a `CHECK` constraint, not native Postgres enums, so adding a new value is an `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`, not a migration against the type itself)

- `role`: `'scholar' | 'faculty' | 'registrar' | 'admin'`
- `user_status` (roster status): `'active' | 'graduated' | 'withdrawn' | 'pending'`
- `join_request_status`: `'approved' | 'declined' | 'pending'`
- `join_request_delivery_status`: `'pending' | 'processing' | 'delivered' | 'failed'`
- `content_format`: `'audio_lecture' | 'video_seminar' | 'ebook' | 'research_pdf'`
- `notification_event`: `'role_changed' | 'member_removal_requested' | 'audit_flagged' | 'access_review_reminder' | 'repeated_registration_failure'`
- `notification_status`: `'pending' | 'processing' | 'sent' | 'failed'`
- `job_run_status`: `'started' | 'completed' | 'failed'`

## Tables

### `users`
One row per person who has interacted with the bot/Mini App, regardless of verification status.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` default |
| `telegram_id` | `bigint` | unique, not null |
| `telegram_username` | `text` | nullable — not everyone sets one, but required at registration |
| `full_name` | `text` | not null |
| `email` | `text` | nullable until registration completes |
| `role` | `text` | not null, default `'scholar'`, CHECK against role list |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()`, bumped on update |

### `roster`
The verification source of truth. One row per Th.D. candidate record (not necessarily one-to-one with `users` until they register — a registrar can pre-load expected students).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | nullable until the student registers and is matched |
| `registration_id` | `text` | unique, not null — the DIBI ID, e.g. `DIBI-THD-0042` |
| `cohort_year` | `smallint` | not null |
| `program_track` | `text` | not null |
| `supervisor_name` | `text` | nullable |
| `status` | `text` | not null, default `'pending'`, CHECK against user_status list |
| `access_review_pending` | `boolean` | not null, default `false` — set when the entry moves to `graduated`/`withdrawn`, cleared when it returns to `active` |
| `access_review_flagged_at` | `timestamptz` | nullable — when `access_review_pending` was last set |
| `updated_by` | `uuid` FK → `users.id` | who last changed status — nullable (system-initiated changes) |
| `updated_at` | `timestamptz` | default `now()` |
| `created_at` | `timestamptz` | default `now()` |

### `join_requests`
One row per Telegram join-request event, for audit and to prevent duplicate processing. Since migration `0008` the same row also carries the channel-event columns and the outbox/delivery queue state the Bot Service polls.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | not null |
| `status` | `text` | not null, default `'pending'`, CHECK against join_request_status list |
| `decided_by` | `uuid` FK → `users.id` | nullable — null means system auto-decision |
| `decided_at` | `timestamptz` | nullable |
| `reason` | `text` | nullable — e.g. "no roster match", "status withdrawn" |
| `chat_id` | `bigint` | nullable — channel chat id from `chat_join_request`; null for a Mini App-only registration |
| `telegram_user_id` | `bigint` | nullable — requester's Telegram id (`from.id`) |
| `join_requested_at` | `timestamptz` | nullable — when the channel request arrived |
| `delivery_status` | `text` | not null, default `'pending'`, CHECK against join_request_delivery_status (`pending`/`processing`/`delivered`/`failed`) |
| `delivery_attempts` | `integer` | not null, default `0` |
| `next_attempt_at` | `timestamptz` | nullable — backoff gate for the next claim |
| `delivery_claimed_at` | `timestamptz` | nullable — lease timestamp set when claimed; stale leases are reclaimed |
| `delivered_at` | `timestamptz` | nullable |
| `delivery_error` | `text` | nullable — last failure message |
| `created_at` | `timestamptz` | default `now()` |

Migration `0008` also adds three partial indexes: `join_requests_one_pending_per_user` (unique on `user_id WHERE status = 'pending'`), `join_requests_delivery_queue` (`next_attempt_at WHERE status <> 'pending' AND delivery_status = 'pending'`), and `join_requests_delivery_processing` (`delivery_claimed_at WHERE delivery_status = 'processing'`).

### `invite_links`
Single-use, time-limited invite links issued per approved request.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `link` | `text` | unique, not null |
| `created_for_user_id` | `uuid` FK → `users.id` | not null |
| `expires_at` | `timestamptz` | not null |
| `used` | `boolean` | not null, default `false` |
| `revoked_at` | `timestamptz` | nullable — set by migration `0010` when a link is revoked on member removal |
| `created_at` | `timestamptz` | default `now()` |

### `content_posts`
Metadata for every item posted to the channel through the system (content posted manually outside the system is not tracked here).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `title` | `text` | not null |
| `discipline_tag` | `text` | not null — e.g. `SystematicTheology`; canonical list is `DISCIPLINE_TAGS` in `packages/shared` (no DB CHECK) |
| `format_tag` | `text` | not null, CHECK against content_format list — must match `CONTENT_FORMATS` in `packages/shared` |
| `cohort_tag` | `smallint` | nullable — some content isn't cohort-specific |
| `posted_by` | `uuid` FK → `users.id` | not null |
| `telegram_message_id` | `bigint` | nullable until the bot confirms the post |
| `drive_link` | `text` | nullable — set when file exceeds the size threshold |
| `file_size_bytes` | `bigint` | nullable |
| `pending_action` | `text` | not null, default `'none'` — `none` / `publish` / `delete` (migration `0009`) |
| `delivery_status` | `text` | not null, default `'pending'` — `pending` / `processing` / `posted` / `failed` |
| `delivery_attempts` | `integer` | not null, default `0` |
| `next_attempt_at` | `timestamptz` | nullable — retry/backoff schedule and queue gate |
| `delivery_claimed_at` | `timestamptz` | nullable — lease timestamp |
| `delivery_error` | `text` | nullable — last failure message |
| `deleted_at` | `timestamptz` | nullable — soft-delete marker |
| `staged_file_name` | `text` | nullable — UUID file name under `CONTENT_STAGING_DIR` |
| `staged_mime_type` | `text` | nullable |
| `staged_original_name` | `text` | nullable — original upload filename, echoed on download |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Delivery columns and indexes come from migration `0009_content_delivery.sql`: a partial queue index on `next_attempt_at WHERE pending_action <> 'none' AND delivery_status = 'pending'`, a partial `processing` index on `delivery_claimed_at`, and a partial active index on `(created_at DESC) WHERE deleted_at IS NULL`.

### `audit_logs`
Append-only. Every privileged action writes a row here.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `actor_user_id` | `uuid` FK → `users.id` | nullable — null means system-initiated |
| `action` | `text` | not null — e.g. `'approve_join_request'`, `'update_roster_status'`, `'assign_role'`, `'remove_member'`, `'edit_content'` |
| `target_type` | `text` | not null — e.g. `'roster'`, `'content_posts'`, `'users'` |
| `target_id` | `uuid` | nullable |
| `details` | `jsonb` | nullable — free-form context (old value/new value, etc.) |
| `created_at` | `timestamptz` | default `now()` |

Migration `0010` adds a trigger (`audit_logs` append-only guard) that rejects `UPDATE`/`DELETE` on this table — rows are immutable once written.

### `channel_membership`
Authoritative, bot-observed channel membership (migration `0010`). The Telegram Bot API cannot enumerate chat members, so this table is populated by the membership-sync loop asking about known `telegram_id`s (looked up against `users` to resolve the `user_id`).

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK, FK → `users.id` (on delete cascade) | one live row per user |
| `is_member` | `boolean` | not null — the bot's verdict (status ∈ member/administrator/creator) |
| `member_status` | `text` | nullable — raw Telegram status (`member`, `administrator`, `creator`, `left`, `kicked`, …) |
| `checked_at` | `timestamptz` | not null, default `now()` — when the bot last observed this |

There is no `telegram_id` or `updated_at` column — the row is keyed by `user_id` and re-stamped by upsert on each snapshot.

### `member_removals`
Outbox for channel removals initiated by admins or the roster audit (migration `0010`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | not null |
| `requested_by` | `uuid` FK → `users.id` | nullable — the actor who requested the removal |
| `initiated_by_role` | `text` | not null — `'admin'` or `'registrar'` (CHECK) |
| `reason` | `text` | nullable |
| `status` | `text` | not null, default `'pending'` — `pending` / `processing` / `done` / `failed` / `cancelled` (CHECK) |
| `delivery_attempts` | `integer` | not null, default `0` |
| `next_attempt_at` | `timestamptz` | nullable — backoff gate |
| `claimed_at` | `timestamptz` | nullable — lease timestamp |
| `last_error` | `text` | nullable |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()` |
| `processed_at` | `timestamptz` | nullable — set on terminal (`done`/`failed`/`cancelled`) |

A partial unique index enforces at most one open (`pending`/`processing`) removal per user; a partial queue index drives the claim/backoff loop.

### `notifications`
Outbox for user-directed DMs (migration `0011`). The API writes rows; the Bot Service polls, sends the DM, and confirms the outcome — the API never calls the bot. Recipients are resolved to **concrete user ids** at enqueue time (one row per recipient) so delivery and dedupe are per-person.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `recipient_user_id` | `uuid` FK → `users.id` (on delete cascade) | not null |
| `event` | `text` | not null, CHECK — `'role_changed' \| 'member_removal_requested' \| 'audit_flagged' \| 'access_review_reminder' \| 'repeated_registration_failure'` |
| `payload` | `jsonb` | not null, default `'{}'` — template inputs (e.g. `{ from, to }`, `{ total }`) |
| `dedupe_key` | `text` | not null — event identity; a random uuid for events that must not be deduped |
| `status` | `text` | not null, default `'pending'` — `'pending' \| 'processing' \| 'sent' \| 'failed'` |
| `attempts` | `integer` | not null, default `0` |
| `next_attempt_at` | `timestamptz` | nullable — backoff gate |
| `claimed_at` | `timestamptz` | nullable — lease timestamp |
| `sent_at` | `timestamptz` | nullable |
| `last_error` | `text` | nullable |
| `created_at` | `timestamptz` | not null, default `now()` |

There is no `recipient_role` column — the claim query derives `recipientRole` from the recipient's current role in `users`. A **unique index on `(recipient_user_id, dedupe_key)`** guarantees at most one delivery per recipient per event (not dedupe_key alone — a single event legitimately fans out to several admins/registrars). Partial `notifications_queue` and `notifications_processing` indexes drive the claim/backoff loop. `dedupe_key` is never null.

### `job_runs`
One row per scheduled job attempt, giving crash-safe exactly-once semantics per `(job, run_key)`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job` | `text` | not null — `'quarterly_audit' \| 'access_review_reminder'` |
| `run_key` | `text` | not null — e.g. `2026-Q1`, `2026-W05` |
| `status` | `text` | not null, default `'started'` — `'started' \| 'completed' \| 'failed'` (CHECK) |
| `details` | `jsonb` | nullable — run metadata (e.g. `{ runKey }`) |
| `last_error` | `text` | nullable |
| `started_at` | `timestamptz` | not null, default `now()` |
| `finished_at` | `timestamptz` | nullable |

Unique `(job, run_key)`. A run is retaken **atomically** via `INSERT ... ON CONFLICT (job, run_key) DO UPDATE ... WHERE <claimable> RETURNING id` where claimable = `status = 'failed'` OR (`status = 'started'` AND `started_at < now() - JOB_RUN_STALE_MINUTES`). A completed run is never rerun. The quarterly job records `audit_logs.target_id = job_runs.id` (target type `jobs`) with the run key in `details.runKey`.

## Relationships (summary)
```
users 1───* roster            (via roster.user_id)
users 1───* join_requests     (via join_requests.user_id)
users 1───* invite_links      (via invite_links.created_for_user_id)
users 1───* content_posts     (via content_posts.posted_by)
users 1───* audit_logs        (via audit_logs.actor_user_id)
users 1───* notifications     (via notifications.recipient_user_id)
job_runs    (standalone — one row per scheduled job run)
```

## Indexing guidance
- `users.telegram_id` — unique index (lookup on every bot interaction).
- `roster.registration_id` — unique index (lookup on every registration attempt).
- `roster.status` — index (quarterly audit queries filter heavily on this).
- `content_posts.discipline_tag`, `content_posts.format_tag`, `content_posts.cohort_tag` — composite or separate indexes depending on actual query patterns once the content index search is built; start with separate B-tree indexes and revisit if search gets slow.
- `audit_logs.created_at` — index, since the audit viewer will paginate by recency.
- `join_requests(user_id, created_at)` — composite index, since registration decisions and the repeated-failure check count recent declines per user.
- `notifications(recipient_user_id, dedupe_key)` — unique index; enforces per-recipient dedupe of notification events.
- `notifications(status, next_attempt_at)` — partial queue index driving the bot delivery loop.
- `job_runs(job, run_key)` — unique index; atomic job claim/retake.

## Migration file naming
`NNNN_short_description.sql`, zero-padded, sequential, never renumbered:
```
0001_init_users_roster.sql
0002_join_requests_invite_links.sql
0003_content_posts.sql
0004_audit_logs.sql
0005_add_roster_status_index.sql
0006_settings.sql
0007_roster_access_review.sql
0008_join_request_delivery.sql
0009_content_delivery.sql
0010_admin_membership.sql
0011_jobs_notifications.sql
```

`schema_migrations` (created by the runner in `apps/api/src/db/migrate.ts`): one row per applied migration — `name` (primary key, the filename) and `applied_at`. Never edited; the runner appends to it.

### `settings`
Key-value store for system configuration (seeded by migration `0006`, read/written via the Settings endpoints).

| Column | Type | Notes |
|---|---|---|
| `key` | `text` PK | e.g. `registrationIdPattern`, `availableCohortYears`, `inviteLinkExpirySeconds`, `maxUploadSizeBytes` (Drive threshold, default `47185920`), `maxContentUploadBytes` (hard cap, default `524288000`, max 2 GB) |
| `value` | `jsonb` | not null — arbitrary shape per key |
| `updated_by` | `uuid` FK → `users.id` | nullable — who last changed the value |
| `updated_at` | `timestamptz` | default `now()` |

## What agents should never do
- Never generate a migration that `ALTER`s or `DROP`s a column already shipped to `main` without a corresponding data-migration plan — write an additive migration instead and handle backfill explicitly.
- Never query the database from the bot or Mini App directly. Always through the API's repository layer.
- Never store secrets, tokens, or raw card/payment data in any table — none of that is in scope for this system.
