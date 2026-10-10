# Database Schema

PostgreSQL. Raw `pg` driver — no ORM. All access goes through `apps/api/src/repositories/*`. Migrations are sequential SQL files in `apps/api/src/db/migrations/`, never edited after merge; corrections are new migrations.

## Enum-like values (stored as `text` with a `CHECK` constraint, not native Postgres enums, so adding a new value is an `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`, not a migration against the type itself)

- `role`: `'scholar' | 'faculty' | 'registrar' | 'admin'`
- `user_status` (roster status): `'active' | 'graduated' | 'withdrawn' | 'pending'`
- `join_request_status`: `'approved' | 'declined' | 'pending'`
- `content_format`: `'audio_lecture' | 'video_seminar' | 'ebook' | 'research_pdf'`

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
One row per Telegram join-request event, for audit and to prevent duplicate processing.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | not null |
| `status` | `text` | not null, default `'pending'`, CHECK against join_request_status list |
| `decided_by` | `uuid` FK → `users.id` | nullable — null means system auto-decision |
| `decided_at` | `timestamptz` | nullable |
| `reason` | `text` | nullable — e.g. "no roster match", "status withdrawn" |
| `created_at` | `timestamptz` | default `now()` |

### `invite_links`
Single-use, time-limited invite links issued per approved request.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `link` | `text` | unique, not null |
| `created_for_user_id` | `uuid` FK → `users.id` | not null |
| `expires_at` | `timestamptz` | not null |
| `used` | `boolean` | default `false` |
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
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

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

## Relationships (summary)
```
users 1───* roster            (via roster.user_id)
users 1───* join_requests     (via join_requests.user_id)
users 1───* invite_links      (via invite_links.created_for_user_id)
users 1───* content_posts     (via content_posts.posted_by)
users 1───* audit_logs        (via audit_logs.actor_user_id)
```

## Indexing guidance
- `users.telegram_id` — unique index (lookup on every bot interaction).
- `roster.registration_id` — unique index (lookup on every registration attempt).
- `roster.status` — index (quarterly audit queries filter heavily on this).
- `content_posts.discipline_tag`, `content_posts.format_tag`, `content_posts.cohort_tag` — composite or separate indexes depending on actual query patterns once the content index search is built; start with separate B-tree indexes and revisit if search gets slow.
- `audit_logs.created_at` — index, since the audit viewer will paginate by recency.
- `join_requests(user_id, created_at)` — composite index, since registration decisions and the repeated-failure check count recent declines per user.

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
```

`schema_migrations` (created by the runner in `apps/api/src/db/migrate.ts`): one row per applied migration — `name` (primary key, the filename) and `applied_at`. Never edited; the runner appends to it.

### `settings`
Key-value store for system configuration (seeded by migration `0006`, read/written via the Settings endpoints).

| Column | Type | Notes |
|---|---|---|
| `key` | `text` PK | e.g. `registrationIdPattern`, `availableCohortYears`, `inviteLinkExpirySeconds`, `maxUploadSizeBytes` |
| `value` | `jsonb` | not null — arbitrary shape per key |
| `updated_by` | `uuid` FK → `users.id` | nullable — who last changed the value |
| `updated_at` | `timestamptz` | default `now()` |

## What agents should never do
- Never generate a migration that `ALTER`s or `DROP`s a column already shipped to `main` without a corresponding data-migration plan — write an additive migration instead and handle backfill explicitly.
- Never query the database from the bot or Mini App directly. Always through the API's repository layer.
- Never store secrets, tokens, or raw card/payment data in any table — none of that is in scope for this system.
