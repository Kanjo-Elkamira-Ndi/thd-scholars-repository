# Phase 9 — Content Module (design)

**Status:** approved with amendments (2026-10-11)
**Scope owner:** API (`apps/api`) + Bot Service (`apps/bot`) + shared (`packages/shared`) + docs
**Source of truth:** `workflows.md` #5 / #6, `architecture.md`, `database-schema.md`, `security.md`, `api-reference.md` (Content + internal), Phase 7 & 8 specs.
**Depends on:** Phase 8 outbox + bot-pull pattern (leased claim, backoff, `audit_logs` on terminal failure).

## 0. Problem

`content_posts` (migration 0003) exists but nothing reads or writes it: no repository, service, controller, or routes; no channel publishing; no `/internal/content/:id/confirm`. Phase 9 delivers Faculty content end-to-end:

1. Faculty creates a post (metadata + either a file or a Drive link); the API validates and either uploads to Google Drive (large files) or stages the file for a direct Telegram upload (small files).
2. The bot publishes the formatted message to the channel and confirms; the API stores `telegram_message_id`.
3. Faculty/Admin can edit metadata and remove a post; removal also deletes the channel message.

## 1. Decisions (locked)

| # | Decision |
|---|---|
| D1 | **Extend the Phase 8 outbox + bot-pull pattern to content.** The API owns the queue on the `content_posts` row; the bot polls `/internal/content/claim`, acts, then `/internal/content/:id/confirm`. No inbound surface on the bot. |
| D2 | **Drive routing is size-based and server-side.** The API receives the multipart file, compares its size to the configurable Drive threshold, and uploads the file to Drive itself via a service account when over the threshold. Below it, the file is staged for the bot. |
| D3 | **Embed the queue on `content_posts`.** New delivery/queue columns + `deleted_at`; migration `0009`. No new tables. |
| D4 | **`driveLink` is a first-class alternative.** Exactly one of `file` or `driveLink` is required. |
| D5 | **Delete is a queued channel action.** Delete either hard-deletes immediately (never published) or soft-deletes and queues a channel-message delete executed by the bot. |
| D6 | **`GET /api/content` is gated by membership, not just role.** Faculty/Registrar/Admin pass; a Scholar passes only with an `active` roster entry, re-checked from the DB per request. |

### Amendments applied (2026-10-11)

- **N1 — Telegram upload limits.** Telegram accepts at most **50 MB** per bot upload. `settings.maxUploadSizeBytes` remains the **Drive-routing threshold**, clamped in code to ≤ 50 MB and defaulting (fallback + reseeded value) to **45 MB**. A **separate** hard upload cap `settings.maxContentUploadBytes` defaults to **500 MB**. Above the threshold → Drive; a larger file can also be supplied as a `driveLink`. No code or doc may describe a 2 GB **direct-to-Telegram** upload.
- **N2 — Drive.** Streamed **resumable** upload with `supportsAllDrives=true`; link sharing set to `anyone`/`reader`; `copyRequiresWriterPermission=true`. Destination must be a **Shared Drive** the service account is a member of (documented in `security.md`); link forwarding is recorded as an **accepted risk**. `driveLink` is validated: `https` only, hostname `drive.google.com` or `docs.google.com`, else `VALIDATION_ERROR`.
- **N3 — Delete lifecycle.** `DELETE` hard-deletes immediately (and unlinks the staged file) **only if the bot never claimed the publish task and `telegram_message_id IS NULL`**; otherwise it soft-deletes (`deleted_at`) and sets `pending_action='delete'`. A publish confirm that arrives for a soft-deleted row stores `telegram_message_id` and sets `pending_action='delete'` — it **never resurrects** the row. A Telegram *message to delete not found* counts as **success**. A terminal delete failure keeps the row soft-deleted and writes an `audit_logs` row. Audit details always include the post **title** (the row may be hard-deleted).
- **N4 — Membership guard.** A `requireVerifiedMember` middleware wraps `GET /api/content`: `faculty`/`registrar`/`admin` pass; a `scholar` passes only when their roster entry is `active`, re-queried from the DB on every request (no caching). Otherwise `403 NOT_VERIFIED`.
- **N5 — Telegram sending.** Caption ≤ **1024** chars; the shared title schema is capped at **150** and the caption is truncated safely. All user-provided text is **HTML-escaped** in templates. Hashtags are built **only from the shared whitelists** (unknown discipline/format tags rejected). `sendAudio` only for **mp3/m4a**, `sendVideo` only for **mp4**, `sendDocument` for **everything else** (wav, ogg, mov, webm, pdf, epub).
- **N6 — Upload hygiene.** `multer` disk storage; staged filenames are **UUIDs** (never the client filename); **magic bytes** are verified in addition to the MIME whitelist; `%`, `_`, `\` are escaped in ILIKE search. Staged files are unlinked on **every** terminal path (posted, deleted, failed, validation error, Drive path). A staged file missing at claim time fails the task immediately with a clear error (terminal, no endless retries).
- **N7 — Failure audit.** A `content_delivery_failed` `audit_logs` row is written on terminal publish/delete failure (mirrors Phase 8). A crash between posting to Telegram and confirming may cause a **rare duplicate channel post** (accepted; see §7.4).
- **N8 — Deploy notes.** Reverse proxy must set `client_max_body_size` and raised timeouts; `CONTENT_STAGING_DIR` must be a **persistent volume** (staged files are read back by the bot after a possible restart).

## 2. Architecture

```
Faculty ── POST /api/content (multipart file | driveLink)
                    │
      ┌─────────────┴─────────────┐
      │ size > threshold?          │  no file, driveLink supplied
      │  yes → Drive resumable     │  (or Drive path already done)
      │        upload (SA),        │
      │        unlink temp         │
      │  no  → move temp →         │
      │        staging UUID file   │
      └─────────────┬─────────────┘
                    ▼
        content_posts  (metadata + queue state; drive_link | staged file)
                    ▲ claim (lease) ── bot outbox loop ──┐
                    │                                    │
   channel ◄── sendMessage(link) | sendAudio|Video|Document(caption)
                    │                                    │
                    └── POST /internal/content/:id/confirm ┘   (store telegram_message_id)

Faculty/Admin ── DELETE /api/content/:id
      never claimed & no message id → hard delete + unlink
      else → soft-delete + pending_action='delete'  →  bot deleteMessage → confirm → hard delete
```

The API stays the source of truth and RBAC holder; the bot stays a thin client. Queue state lives in Postgres so it survives bot restarts/outages.

## 3. Data model — migration `0009_content_delivery.sql`

Additive only (`content_posts.file_size_bytes` already exists from 0003):

```sql
ALTER TABLE content_posts
  ADD COLUMN pending_action       text NOT NULL DEFAULT 'none'
      CHECK (pending_action IN ('none','publish','delete')),
  ADD COLUMN delivery_status      text NOT NULL DEFAULT 'pending'
      CHECK (delivery_status IN ('pending','processing','posted','failed')),
  ADD COLUMN delivery_attempts    integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at      timestamptz,
  ADD COLUMN delivery_claimed_at  timestamptz,      -- lease timestamp
  ADD COLUMN delivery_error       text,
  ADD COLUMN deleted_at           timestamptz,
  ADD COLUMN staged_file_path     text,             -- UUID filename under CONTENT_STAGING_DIR (telegram path only)
  ADD COLUMN staged_mime_type     text,
  ADD COLUMN staged_original_name text;

-- claimable queue
CREATE INDEX content_posts_delivery_queue
  ON content_posts (next_attempt_at)
  WHERE pending_action <> 'none' AND delivery_status = 'pending';
-- stale-lease reclaim
CREATE INDEX content_posts_delivery_processing
  ON content_posts (delivery_claimed_at)
  WHERE delivery_status = 'processing';
-- active index listing
CREATE INDEX content_posts_active
  ON content_posts (created_at DESC)
  WHERE deleted_at IS NULL;
```

**Claimable predicate:** `pending_action <> 'none' AND delivery_status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) AND (pending_action = 'publish' OR telegram_message_id IS NOT NULL)`.

The final clause prevents a queued **delete** from being claimed before the publish confirm has stored the message id (the delete-during-publish race, §5.3).

**State machine:** `pending → processing → (posted | failed | pending[reschedule])`; `processing` older than the lease is reclaimed to `pending`. A soft-deleted row has `pending_action='delete'`; the delete confirm hard-deletes the row.

**Settings (migration `0009`, data-only + new key):**

```sql
-- reseed the Drive threshold to 45 MB only if it still holds the old 50 MB seed
UPDATE settings SET value = '47185920'::jsonb
 WHERE key = 'maxUploadSizeBytes' AND value = '52428800'::jsonb;
-- new hard upload cap
INSERT INTO settings (key, value) VALUES ('maxContentUploadBytes', '524288000'::jsonb)
  ON CONFLICT (key) DO NOTHING;
```

## 4. Shared (`packages/shared/src`)

- `types/enums.ts` — add `ContentAction = 'publish' | 'delete'` and `ContentDeliveryStatus = 'pending' | 'processing' | 'posted' | 'failed'`.
- `constants/content.ts` — add:
  - `CONTENT_TITLE_MAX_LENGTH = 150`
  - `TELEGRAM_CAPTION_MAX_LENGTH = 1024`
  - `TELEGRAM_MAX_UPLOAD_BYTES = 52428800` (50 MB hard cap on direct Telegram uploads)
  - `DEFAULT_DRIVE_THRESHOLD_BYTES = 47185920` (45 MB)
  - `DEFAULT_MAX_CONTENT_UPLOAD_BYTES = 524288000` (500 MB)
  - `CONTENT_MIME_WHITELIST: Record<ContentFormat, readonly string[]>` — audio_lecture→`audio/mpeg|audio/mp4|audio/x-m4a|audio/wav|audio/ogg`; video_seminar→`video/mp4|video/quicktime|video/webm`; ebook & research_pdf→`application/pdf|application/epub+zip`.
- `schemas/content.ts`:
  - `contentCreateSchema` — `title` max **150**; `disciplineTag`/`formatTag` from shared whitelists; `cohortYear?`; `driveLink?` validated by `driveLinkSchema`. **Exactly one** of file/driveLink is enforced in the controller.
  - `contentCreateMultipartSchema` — same fields but `cohortYear` **coerced** from a string (multipart bodies are strings); used by the controller for the `file` path.
  - `contentUpdateSchema` — partial of `{ title, disciplineTag, formatTag, cohortYear }` only (no file/driveLink), `.refine(hasAtLeastOneField)`.
  - `driveLinkSchema` — `z.string().trim().url()` refined to `https` + hostname ∈ {`drive.google.com`,`docs.google.com`}.
- `schemas/content-tasks.ts` (new): `claimContentTasksSchema = { limit?: number }`; `completeContentTaskSchema = { outcome: 'posted'|'deleted'|'failed'; telegramMessageId?: number; error?: string; terminal?: boolean }` refined so `outcome:'posted'` requires `telegramMessageId`.
- `types/internal.ts` — add `ContentDeliveryTask`:
  ```ts
  interface ContentDeliveryTask {
    id: string; action: ContentAction; title: string;
    disciplineTag: DisciplineTag; formatTag: ContentFormat; cohortTag: number | null;
    telegramMessageId: number | null; driveLink: string | null;
    hasStagedFile: boolean; stagedMimeType: string | null; stagedOriginalName: string | null;
  }
  interface ClaimContentTasksResponse { items: ContentDeliveryTask[] }
  ```
- `schemas/settings.ts` — `maxUploadSizeBytes` max becomes `52428800` (message updated); add `maxContentUploadBytes` (int, ≥ 1 MB, ≤ 2 GB).
- `index.ts` — export the new modules/constants.

## 5. API (`apps/api/src`)

### 5.1 `GET /api/content` — index
- **Middleware:** `authUser` → `requireVerifiedMember` (§5.6). Filters `discipline`, `format`, `cohortYear`, `search` (title, `ILIKE` with `%`/`_`/`\` escaped), `page`/`pageSize` (default 20, max 100). Only `deleted_at IS NULL`. → `200 { items: ContentPost[], total, page, pageSize }`.

### 5.2 `POST /api/content` — create
- **Auth:** `requireRole('faculty','admin')`. Body: multipart (`file` + string fields) **or** metadata + `driveLink`.
- **Validation order:** parse/validate fields (`contentCreateSchema`, cohort coerced); enforce **exactly one** of `file`/`driveLink` (`400 VALIDATION_ERROR`); MIME must be in the per-format whitelist **and** the detected magic bytes must match (`400 VALIDATION_ERROR`); `file.size ≤ maxContentUploadBytes` else `400` (`VALIDATION_ERROR`, "exceeds the maximum upload size").
- **Routing:** if `file.size > driveThreshold` → `drive.uploadFile({ stream, mime, name })` (resumable, Shared Drive) → `driveLink`; **unlink the temp file**. Else → move the temp file to `CONTENT_STAGING_DIR/<uuid>`, store `staged_file_path`/`staged_mime_type`/`staged_original_name`.
- Insert the row (`pending_action='publish'`, `delivery_status='pending'`) + `audit_logs` `content_created { title }` in one transaction. → `201 { contentPost }` (`telegramMessageId: null`).
- On any error after staging, unlink the staged file (N6).

### 5.3 `DELETE /api/content/:id` — delete (N3)
Ownership enforced in the service. Then:
- **Never published:** `telegram_message_id IS NULL AND delivery_attempts = 0 AND delivery_status = 'pending'` → unlink staged file, **hard-delete** row, `audit_logs` `content_deleted { title }`.
- **Otherwise:** `deleted_at = now(), pending_action='delete', delivery_status='pending', delivery_attempts=0, next_attempt_at=NULL, delivery_error=NULL, delivery_claimed_at=NULL`; `audit_logs` `content_deleted { title }` (title stored because the row may later be hard-deleted).

### 5.4 `PATCH /api/content/:id` — update
Ownership enforced. Metadata only (title/discipline/format/cohort). No re-post, no channel caption update (nice-to-have, out of scope). `audit_logs` `content_updated { title, changed }`. → `200 { contentPost }`.

**Ownership rule (both PATCH and DELETE):** `admin` may mutate any post; `faculty` only where `posted_by === req.user.id`; otherwise `403 FORBIDDEN`. Enforced in `content.service.ts`, not the controller.

### 5.5 Internal endpoints (`X-Internal-Token`)
- `POST /internal/content/claim` — body `{ limit? }` (default `CONTENT_DELIVERY_BATCH_SIZE`). One transaction: reclaim stale `processing` leases, lease a batch `FOR UPDATE SKIP LOCKED` (incrementing `delivery_attempts`). Then, for each leased **publish** task with a staged file, `stat` it; a **missing** file → `markFailed` (terminal) + `content_delivery_failed` audit and drop it from the response (N6). → `200 ClaimContentTasksResponse`.
- `GET /internal/content/:id/file` — streams `CONTENT_STAGING_DIR/<staged_file_path>` with `Content-Type: staged_mime_type` and a sanitized `Content-Disposition` filename. `404 NOT_FOUND` if the row/deleted row/staged file is absent.
- `POST /internal/content/:id/confirm` — body `completeContentTaskSchema`; uuid-validate `:id` (`400`), `404` if absent (**except** a `posted` confirm for a hard-deleted row → `200` no-op).
  - **`posted`** (requires `telegramMessageId`, N5): store `telegram_message_id`; if `deleted_at IS NULL` → `pending_action='none', delivery_status='posted', next_attempt_at=NULL`; else → `pending_action='delete', delivery_status='pending', next_attempt_at=NULL` (never resurrect). Unlink staged file. `audit_logs` `content_posted { title, telegramMessageId }`.
  - **`deleted`:** unlink staged file, **hard-delete** the row. → `200 { deliveryStatus: 'posted', hardDeleted: true }`.
  - **`failed`:** if `terminal` or `attempts ≥ CONTENT_DELIVERY_MAX_ATTEMPTS` → `delivery_status='failed'`, `delivery_error`, `claimed_at=NULL`, + `audit_logs` `content_delivery_failed { title, action, attempts, error }`; else → `pending`, `delivery_error`, `next_attempt_at = now() + computeBackoffSeconds(attempts, base)`, `claimed_at=NULL`. → `200 { deliveryStatus }`.

### 5.5.1 Claim SQL (§5.4)

```sql
-- reclaim
UPDATE content_posts SET delivery_status='pending', delivery_claimed_at=NULL
 WHERE delivery_status='processing'
   AND delivery_claimed_at < now() - make_interval(secs => $1);

-- lease
UPDATE content_posts c
   SET delivery_status='processing', delivery_claimed_at=now(),
       delivery_attempts = c.delivery_attempts + 1
 WHERE c.id IN (
   SELECT id FROM content_posts
    WHERE pending_action <> 'none' AND delivery_status = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      AND (pending_action = 'publish' OR telegram_message_id IS NOT NULL)
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1)
 RETURNING c.id, c.pending_action, c.title, c.discipline_tag, c.format_tag, c.cohort_tag,
           c.telegram_message_id, c.drive_link, c.staged_file_path, c.staged_mime_type,
           c.staged_original_name, c.delivery_attempts;
```

The **missing-staged-file** check (N6) runs in the service after the claim: rows whose `staged_file_path` no longer exists are marked `failed` (terminal) + `content_delivery_failed` audit and dropped from the returned batch.

### 5.5 `services/drive.service.ts` (N2)
- Auth: `GOOGLE_SERVICE_ACCOUNT_JSON` (inline JSON) → signed JWT (RS256, scope `drive`) → access token; cached until expiry.
- `uploadFile({ stream, mimeType, name }): Promise<{ webViewLink: string }>`:
  1. `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true` with metadata `{ name, parents: [GOOGLE_DRIVE_FOLDER_ID], copyRequiresWriterPermission: true }`.
  2. Stream the body to the returned session URI (single request; resumable-compatible).
  3. `POST .../files/{id}/permissions?supportsAllDrives=true` `{ role: 'reader', type: 'anyone' }`.
  4. Return `webViewLink` (from the create response `fields=id,webViewLink`).
- Fully injectable (`fetchImpl`) so unit tests never hit the network. If Drive is not configured and a file exceeds the threshold → `500 INTERNAL_ERROR` ("Drive is not configured").

### 5.6 `middleware/require-verified-member.ts` (N4)
```
authUser → requireVerifiedMember:
  no req.user            → 401 UNAUTHORIZED
  role !== 'scholar'     → next()            (faculty/registrar/admin pass)
  active roster row?     → next()            (getActiveRosterByUserId, DB per request, no cache)
  else                   → 403 NOT_VERIFIED
```
Adds `NOT_VERIFIED` to `ErrorCode` (`utils/errors.ts`) and `getActiveRosterByUserId(userId, db)` to `roster.repository.ts`.

### 5.7 Upload middleware & hygiene (N6)
- `middleware/upload.ts`: `multer({ storage: diskStorage({ destination: CONTENT_STAGING_DIR, filename: () => randomUUID() }), limits: { files: 1, fileSize: HARD_MULTIPART_LIMIT_BYTES } })`. `HARD_MULTIPART_LIMIT_BYTES = 2147483648` is only an outer guard; the **effective** cap is `settings.maxContentUploadBytes`, enforced after multer (temp file unlinked on reject).
- `utils/file-type.ts` — `detectMime(buffer): string | null` for the supported magic bytes (PDF `%PDF`, EPUB/zip `PK\x03\x04`, WAV `RIFF…WAVE`, OGG `OggS`, MP3 `ID3`/frame sync, MP4/quicktime/M4A via the `ftyp` brand, WebM EBML). Validate by reading the first ≤ 4100 bytes of the temp file.
- `utils/ilike.ts` — `escapeIlike(value): string` escaping `\`, `%`, `_`.

### 5.8 Config (API env)
| Var | Default | Use |
|---|---|---|
| `CONTENT_STAGING_DIR` | `.staging/content` | staged-file directory (persistent volume in prod) |
| `CONTENT_DELIVERY_MAX_ATTEMPTS` | `5` | terminal-after threshold |
| `CONTENT_DELIVERY_BACKOFF_BASE_SECONDS` | `60` | exponential base, capped 3600 |
| `CONTENT_DELIVERY_LEASE_SECONDS` | `120` | stale-`processing` reclaim window |
| `CONTENT_DELIVERY_BATCH_SIZE` | `10` | default claim limit |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | — | Drive service-account credentials (required only when Drive is used) |
| `GOOGLE_DRIVE_FOLDER_ID` | — | Shared Drive folder id for uploads |

`settings.repository.ts` gains `getMaxUploadSizeBytes` (clamped to ≤ 50 MB, fallback 45 MB) and `getMaxContentUploadBytes` (fallback 500 MB).

## 6. Bot (`apps/bot/src`)

### 6.1 `services/api-client.ts` additions
`claimContentTasks({ limit }) → ClaimContentTasksResponse`; `completeContentTask(id, body)`; `downloadContentFile(id) → { buffer, mimeType, filename }` (GET, `X-Internal-Token`, returns an `ArrayBuffer`/stream).

### 6.2 `services/content-delivery.ts`
- `deliverContentTask(task, deps)`:
  - **publish + `driveLink`:** `sendMessage(BOT_CHANNEL_ID, renderContentPost({...}), { parse_mode: 'HTML' })` → `completeContentTask(id, { outcome: 'posted', telegramMessageId })`.
  - **publish + staged file:** `downloadContentFile(id)` → choose the Telegram method (N5): mp3/m4a→`sendAudio`, mp4→`sendVideo`, **everything else**→`sendDocument`; caption = `renderContentCaption({...})`; → `completeContentTask(id, { outcome:'posted', telegramMessageId })`.
  - **delete:** `deleteMessage(BOT_CHANNEL_ID, telegram_message_id)`; a *message to delete not found* error is **success** (N3) → `completeContentTask(id, { outcome:'deleted' })`.
  - A missing staged file (`downloadContentFile` 404) → `completeContentTask(id, { outcome:'failed', error, terminal: true })` (N6).
  - Any other error → `completeContentTask(id, { outcome:'failed', error })` (retry/backoff).
- `startContentLoop(deps)` / `stopContentLoop()` — interval `BOT_OUTBOX_POLL_INTERVAL_MS`, batch `BOT_CONTENT_BATCH_SIZE` (default 10). `index.ts` starts it alongside the join-request loop and stops both on `SIGINT`/`SIGTERM`.

### 6.3 Templates (`templates/content-post.ts`) — exact copy (locked)
`renderContentPost({ title, disciplineTag, formatTag, cohortTag, driveLink })`:
```
📘 {title}

Discipline: #{disciplineTag}
Format: #{formatTag}
Cohort: #{cohortTag}

🔗 {driveLink}
```
`renderContentCaption(...)` = the same text **without** the `🔗` line and its preceding blank line. Rules: the `Cohort:` line is omitted when `cohortTag` is null; `{title}` is **HTML-escaped**; hashtags are taken only from the shared whitelists (a value not in the whitelist is dropped); the final string is truncated to `TELEGRAM_CAPTION_MAX_LENGTH` on a safe boundary.
`utils/telegram-errors.ts` gains `isMessageGone(err)` (description contains "message to delete not found" / "message not found").

### 6.4 Config (bot env)
`BOT_CONTENT_BATCH_SIZE` (int, positive, default 10); reuse `BOT_CHANNEL_ID`, `BOT_OUTBOX_POLL_INTERVAL_MS`, `X-Internal-Token` config.

## 7. Cross-cutting

### 7.1 MIME vs magic bytes
Declared MIME must be in the format whitelist **and** the detected magic type must be consistent with it (aliases normalised, e.g. `audio/x-m4a` ⇄ `audio/mp4`). A spoofed extension/MIME (e.g. `.pdf` containing a zip, or a `.mp3` header on a text file) → `400 VALIDATION_ERROR`.

### 7.2 ILIKE escaping
`search` terms are escaped (`\`→`\\`, `%`→`\%`, `_`→`\_`) and matched with `title ILIKE '%' || $1 || '%' ESCAPE '\'`.

### 7.3 Concurrency
Claim uses `FOR UPDATE SKIP LOCKED`; two concurrent claims never return the same row. Stale `processing` leases are reclaimed by the lease window.

### 7.4 Accepted risks
- **Rare duplicate channel post:** the bot may crash after `sendMessage`/`sendAudio`… and before `confirm`; the reclaimed lease re-posts. Idempotency across Telegram is not possible without a dedup key; accepted (N7).
- **Orphan message after delete-during-publish + crash:** if a create is deleted while its publish is in flight and the bot then crashes after uploading but before confirming, the publish confirm never arrives and the queued delete (which requires `telegram_message_id`) never becomes claimable. Accepted; documented.
- **Link forwarding:** anyone-with-link Drive files can be forwarded out of the channel; accepted risk (N2, `security.md`).

## 8. Tests

**shared — unit:** title max 150; `driveLink` host/protocol acceptance + rejection; MIME whitelist constants.

**API — unit:** `detectMime` (PDF/EPUB/WAV/OGG/MP3/MP4/M4A/MOV/WebM + spoofed); `escapeIlike`; `computeBackoffSeconds`; `drive.service` (JWT→token, resumable session, permission, `supportsAllDrives`, `copyRequiresWriterPermission`, webViewLink) with a fake `fetchImpl`; content service ownership (faculty B ≠ A → `403`, admin ok).

**API — integration (`*.int.test.ts`):**
1. `POST /api/content` (file, under threshold) → 201, row staged, `pending_action='publish'`, `deleted_at IS NULL`, audit `content_created`.
2. `POST /api/content` (driveLink only) → 201, `drive_link` stored, no staged file.
3. `POST /api/content` (file over threshold, Drive mocked) → Drive upload called, temp unlinked, `drive_link` stored, no staged file.
4. both `file` **and** `driveLink`, or **neither** → `400 VALIDATION_ERROR`.
5. `driveLink` with `http://` or a foreign host (e.g. `https://evil.example/f.pdf`) → `400 VALIDATION_ERROR`.
6. spoofed extension/MIME (zip bytes declared `application/pdf`) → `400 VALIDATION_ERROR`.
7. size > `maxContentUploadBytes` → `400`; temp file unlinked.
8. `GET /api/content` filters + pagination + `total`; ILIKE wildcard escaping (`search='100%'` matches only a literal `100%` title).
9. **Membership guard:** active scholar → 200; graduated scholar → `403 NOT_VERIFIED`; unregistered scholar → `403 NOT_VERIFIED`; faculty/registrar/admin → 200; no token → 401.
10. **Ownership:** faculty B `PATCH`/`DELETE` faculty A's post → `403 FORBIDDEN`; admin `PATCH`/`DELETE` A's post → 200.
11. Delete of a never-claimed/never-posted row → row **hard-deleted** + staged file unlinked.
12. Delete of a posted row → soft-deleted, `pending_action='delete'`; claim returns a `delete` task only after `telegram_message_id` is set.
13. **Delete-during-publish race:** claim publish (attempts=1), then DELETE → soft-deleted `pending_action='delete'`; publish `confirm{posted,msgId}` → row keeps `deleted_at`, `pending_action='delete'`, message id set; delete claim → `confirm{deleted}` → row hard-deleted; **no orphan** row and no double delete.
14. `confirm{deleted}` unlinks staged file + hard-deletes; repeat `confirm{deleted}` → 200 no-op.
15. `confirm{failed}` below max → `pending` + `next_attempt_at`; at/over max → `failed` + `content_delivery_failed` audit (details include title).
16. **Missing staged file at claim** → row failed (terminal) + audit, **not** returned in the batch.
17. stale `processing` lease reclaimed on next claim.
18. `401` without token; `400` bad body/uuid; `404` unknown `:id` (except posted-confirm no-op).

**Bot — unit:**
1. `renderContentPost`/`renderContentCaption` exact copy; cohort line omitted when null; title HTML-escaped; unknown tag dropped; caption truncated at 1024.
2. method selection: mp3/m4a→`sendAudio`, mp4→`sendVideo`, **wav/webm/mov/pdf/epub→`sendDocument`**.
3. drive-path publish → `sendMessage`; staged-path publish → correct method + `complete{posted, telegramMessageId}`.
4. delete → `deleteMessage`; *message not found* → `complete{deleted}`.
5. missing staged file (404) → `complete{failed, terminal:true}`.
6. client method paths/verbs/bodies; `isMessageGone` positives/negatives.

## 9. Files added / changed

**Added — API:** `db/migrations/0009_content_delivery.sql`; `repositories/content.repository.ts` (+ int test); `services/content.service.ts` (+ test); `services/drive.service.ts` (+ test); `services/content.int.test.ts`; `controllers/content-controller.ts`, `controllers/internal-content-controller.ts`, `controllers/internal-content.int.test.ts`; `routes/content-routes.ts`; `middleware/upload.ts`, `middleware/require-verified-member.ts` (+ test); `utils/{file-type,ilike}.ts` (+ tests).
**Changed — API:** `routes/internal-routes.ts` (+3 routes), `app.ts` (mount `/api/content`), `config/env.ts` (+7 vars), `.env.example`, `repositories/settings.repository.ts` (+2 getters), `repositories/roster.repository.ts` (`getActiveRosterByUserId`), `utils/errors.ts` (`NOT_VERIFIED`), `package.json` (`multer`, `@types/multer`).
**Added — shared:** `schemas/content-tasks.ts`; `constants/content.ts` additions; `types/internal.ts` content types; `schemas/content.ts`/`schemas/settings.ts` changes.
**Added — bot:** `services/content-delivery.ts` (+ test); `templates/content-post.ts` (+ test); `utils/telegram-errors.ts` (`isMessageGone`).
**Changed — bot:** `services/api-client.ts` (+3 methods), `index.ts` (start/stop content loop), `config/env.ts`, `.env.example`.
**Docs:** `api-reference.md` (Content + 3 internal content endpoints), `database-schema.md` (columns/indexes/migration 0009 + settings), `workflows.md` #5/#6, `security.md` (Drive Shared Drive + accepted link-forwarding risk + deploy notes), `README.md` (API + bot env tables), `apps/api/.env.example`, `apps/bot/.env.example`.

## 10. Out of scope (will not build)
- Mini App UI (`apps/miniapp` does not exist yet).
- Channel caption **update** on edit (nice-to-have).
- A generic reusable outbox for arbitrary resources.
- Admin/Registrar UI to view/retry failed deliveries.
- Direct-to-Telegram uploads above 50 MB (impossible) — large files go to Drive.
- Phase 10. **Phase 10 must not start.**
