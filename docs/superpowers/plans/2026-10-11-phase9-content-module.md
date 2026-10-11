# Phase 9 — Content Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Faculty content end-to-end: create a post (metadata + a file or a Drive link), route by size (Drive resumable upload vs. staged Telegram upload), publish to the channel via the Phase 8 outbox + bot-pull pattern, store `telegram_message_id`, edit metadata, and delete (immediate hard-delete or queued channel-message delete).

**Architecture:** Extend `content_posts` with a delivery/queue embedded on the row (no new tables). The API owns the queue and exposes internal endpoints (`/internal/content/claim`, `/internal/content/:id/confirm`, `/internal/content/:id/download`) behind `X-Internal-Token`; the bot polls, executes the Telegram action, then confirms. Leased claim + at-least-once semantics; size-based Drive routing is server-side.

**Tech Stack:** TypeScript, Express 5, `pg`, Zod, Vitest, `multer` (disk storage), Telegraf 4, npm workspaces. Shared types/schemas in `packages/shared`. Drive via signed-JWT + `fetch` (no `googleapis` dependency).

**Spec:** `docs/superpowers/specs/2026-10-11-phase9-content-module-design.md` (the plan argues from the spec; read both).

## Global Constraints

- Node ≥20; npm workspaces (`apps/api`, `apps/bot`, `packages/shared`).
- Run `npm run build:shared` before any typecheck/build/test that imports `@thd/shared`.
- ESLint `@typescript-eslint/no-explicit-any` is an **error**; Prettier single quotes, semicolons, trailing commas `all`, width 100.
- Tests are colocated: `*.test.ts` (unit, DB-free) and `*.int.test.ts` (integration, test DB). Integration config: `apps/api/vitest.integration.config.ts`; the test database is recreated + migrated in `src/db/testing/global-setup.ts`.
- No comments unless they explain a non-obvious "why". No `any`.
- **Telegram hard cap is 50 MB.** `settings.maxUploadSizeBytes` is the **Drive-routing threshold**, clamped in code to ≤ 50 MB, fallback + reseed **45 MB (47185920)**. Separate hard upload cap `settings.maxContentUploadBytes` default **500 MB (524288000)**, max 2 GB. **Never** describe a 2 GB direct-to-Telegram upload anywhere.
- **Do NOT start Phase 10.** Do not commit unless explicitly asked.
- Verification gate (run at the end): `npm run build:shared && npm run lint && npm run typecheck && npm run test && npm run build` then `npm run test:integration --workspace=apps/api`.

**Spec amendments carried verbatim:** N1 (Telegram 50 MB cap; two settings), N2 (Drive resumable, `supportsAllDrives`, anyone/reader, Shared Drive, `driveLink` allowlist), N3 (delete lifecycle; publish-confirm never resurrects; message-not-found = success), N4 (`requireVerifiedMember` for `GET /api/content`, DB re-query per request), N5 (caption ≤1024, title 150, HTML-escape, hashtags from whitelists only, `sendAudio` mp3/m4a, `sendVideo` mp4, `sendDocument` else), N6 (UUID staged names, magic bytes, ILIKE escaping, unlink every terminal path, missing staged file = terminal fail), N7 (`content_delivery_failed` audit; duplicate-post accepted risk), N8 (reverse-proxy body size + persistent staging volume).

---

## File Structure

**Shared (`packages/shared/src`)**
- `types/enums.ts` — add `ContentAction`, `ContentDeliveryStatus`.
- `types/internal.ts` — add `ContentDeliveryTask`, `ClaimContentTasksResponse`.
- `constants/content.ts` — add length/byte constants + `CONTENT_MIME_WHITELIST`.
- `schemas/content.ts` — title 150, `driveLinkSchema`, `contentCreateMultipartSchema`, `contentUpdateSchema`.
- `schemas/content-tasks.ts` (new) — `claimContentTasksSchema`, `completeContentTaskSchema`.
- `schemas/settings.ts` — `maxUploadSizeBytes` ≤ 50 MB; add `maxContentUploadBytes`.
- `index.ts` — export `schemas/content-tasks`.

**API (`apps/api/src`)**
- `db/migrations/0009_content_delivery.sql` (new) — queue columns + indexes + settings reseed.
- `repositories/content.repository.ts` (new) — CRUD + queue.
- `repositories/settings.repository.ts` — `getMaxUploadSizeBytes`, `getMaxContentUploadBytes`.
- `repositories/roster.repository.ts` — `getActiveRosterByUserId`.
- `utils/file-type.ts` (new) — magic-byte `detectMime`.
- `utils/ilike.ts` (new) — `escapeLike`.
- `utils/errors.ts` — add `NOT_VERIFIED`.
- `services/drive.service.ts` (new) — JWT + resumable upload.
- `services/content.service.ts` (new) — create/list/update/delete + claim/complete orchestration.
- `middleware/upload.ts` (new) — multer disk storage.
- `middleware/require-verified-member.ts` (new).
- `controllers/content-controller.ts` (new), `controllers/internal-content-controller.ts` (new).
- `routes/content-routes.ts` (new), `routes/internal-routes.ts` (+3 routes).
- `app.ts` — mount `/api/content`.
- `config/env.ts` + `.env.example` (+7 vars).
- `package.json` (+`multer`, `@types/multer`).

**Bot (`apps/bot/src`)**
- `services/api-client.ts` (+3 methods).
- `services/content-delivery.ts` (new) — poll loop + executor.
- `templates/content-post.ts` (new) + `templates/index.ts`.
- `utils/telegram-errors.ts` — `isMessageGone`.
- `config/env.ts` + `.env.example`.
- `index.ts` — start/stop the content loop.

**Docs:** `docs/context/{api-reference,database-schema,workflows,security,architecture}.md`, `README.md`, `apps/api/.env.example`, `apps/bot/.env.example`.

---

### Task 1: Shared types, constants, schemas

**Files:**
- Modify: `packages/shared/src/types/enums.ts`, `packages/shared/src/types/internal.ts`, `packages/shared/src/constants/content.ts`, `packages/shared/src/schemas/content.ts`, `packages/shared/src/schemas/settings.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas/content-tasks.ts`, `packages/shared/src/schemas/content.test.ts`

**Interfaces (produces):**
- `ContentAction = 'publish' | 'delete'`
- `ContentDeliveryStatus = 'pending' | 'processing' | 'posted' | 'failed'`
- `CONTENT_TITLE_MAX_LENGTH = 150`, `TELEGRAM_CAPTION_MAX_LENGTH = 1024`, `TELEGRAM_MAX_UPLOAD_BYTES = 52428800`, `DEFAULT_DRIVE_THRESHOLD_BYTES = 47185920`, `DEFAULT_MAX_CONTENT_UPLOAD_BYTES = 524288000`
- `CONTENT_MIME_WHITELIST: Record<ContentFormat, readonly string[]>`
- `ContentDeliveryTask { id: string; action: ContentAction; title: string; disciplineTag: DisciplineTag; formatTag: ContentFormat; cohortTag: number | null; telegramMessageId: number | null; driveLink: string | null; hasStagedFile: boolean; stagedMimeType: string | null; stagedOriginalName: string | null }`
- `ClaimContentTasksResponse { items: ContentDeliveryTask[] }`
- `driveLinkSchema`, `contentCreateSchema`, `contentCreateMultipartSchema`, `contentUpdateSchema`, `ClaimContentTasksInput`, `CompleteContentTaskInput`
- `claimContentTasksSchema { limit?: number }` (positive int, ≤100)
- `completeContentTaskSchema { outcome: 'posted'|'deleted'|'failed'; telegramMessageId?: number; error?: string; terminal?: boolean }` with `.refine` requiring `telegramMessageId` when `outcome === 'posted'`

- [ ] **Step 1: Write the failing unit test** `schemas/content.test.ts`:
  - `contentCreateSchema.safeParse` rejects a 151-char title, accepts 150.
  - `driveLinkSchema` accepts `https://drive.google.com/file/d/x/view` and `https://docs.google.com/document/d/1/edit`; rejects `http://drive.google.com/x`, `https://evil.example/f.pdf`, and a non-url.
  - `contentCreateMultipartSchema.parse({ title:'T', disciplineTag:'BiblicalStudies', formatTag:'ebook', cohortYear:'2025' }).cohortYear === 2025`.
  - `contentUpdateSchema.safeParse({})` fails; `{ title: 'x' }` passes.
  - `completeContentTaskSchema.safeParse({ outcome: 'posted' })` fails; `{ outcome: 'posted', telegramMessageId: 1 }` passes.
  - `CONTENT_MIME_WHITELIST.ebook` includes `application/pdf` and `application/epub+zip`; `CONTENT_MIME_WHITELIST.audio_lecture` includes `audio/mpeg`.
- [ ] **Step 2: Run, verify fail.** `npm run test --workspace=packages/shared`
- [ ] **Step 3: Implement.**
  - enums: add the two types.
  - constants: add the five numeric constants and `CONTENT_MIME_WHITELIST` (`audio_lecture`→`['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/ogg']`; `video_seminar`→`['video/mp4','video/quicktime','video/webm']`; `ebook`/`research_pdf`→`['application/pdf','application/epub+zip']`).
  - `schemas/content.ts`: set `title` max to `CONTENT_TITLE_MAX_LENGTH`; add `driveLinkSchema` (`z.string().trim().url()` + `.refine` on `https` + hostname ∈ {`drive.google.com`,`docs.google.com`}); keep `contentCreateSchema` and add `contentCreateMultipartSchema` (same fields, `cohortYear: z.coerce.number().int().min(1900).max(2100).optional()`); keep `contentUpdateSchema` = partial metadata + `hasAtLeastOneField`. Export `ContentCreateMultipartInput`.
  - `schemas/content-tasks.ts`: `claimContentTasksSchema = z.object({ limit: z.coerce.number().int().positive().max(100).optional() })`; `completeContentTaskSchema = z.object({ outcome: z.enum(['posted','deleted','failed']), telegramMessageId: z.number().int().positive().optional(), error: z.string().max(2000).optional(), terminal: z.boolean().optional() }).refine((v) => v.outcome !== 'posted' || v.telegramMessageId !== undefined, { message: 'telegramMessageId is required when outcome is posted' })`. Export input types.
  - `types/internal.ts`: add `ContentDeliveryTask` + `ClaimContentTasksResponse`.
  - `schemas/settings.ts`: `maxUploadSizeBytes` `.max(52428800, ...)` message updated; add `maxContentUploadBytes: z.number().int().min(1048576).max(2147483648).optional()`.
  - `index.ts`: `export * from './schemas/content-tasks';`
- [ ] **Step 4: Run, verify pass.** `npm run build:shared && npm run test --workspace=packages/shared`
- [ ] **Step 5: Commit** `feat(shared): content module types, constants, schemas`.

---

### Task 2: Migration `0009` + settings repository getters

**Files:**
- Create: `apps/api/src/db/migrations/0009_content_delivery.sql`
- Modify: `apps/api/src/repositories/settings.repository.ts`
- Test: `apps/api/src/repositories/settings.repository.int.test.ts` (create)

**Interfaces (produces):**
- `getMaxUploadSizeBytes(db=pool): Promise<number>` — `min(async setting ?? 47185920, 52428800)`, never throws.
- `getMaxContentUploadBytes(db=pool): Promise<number>` — setting ?? 524288000.

- [ ] **Step 1: Write the migration.** Exact SQL:

```sql
ALTER TABLE content_posts
  ADD COLUMN pending_action       text NOT NULL DEFAULT 'none'
      CHECK (pending_action IN ('none','publish','delete')),
  ADD COLUMN delivery_status      text NOT NULL DEFAULT 'pending'
      CHECK (delivery_status IN ('pending','processing','posted','failed')),
  ADD COLUMN delivery_attempts    integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at      timestamptz,
  ADD COLUMN delivery_claimed_at  timestamptz,
  ADD COLUMN delivery_error       text,
  ADD COLUMN deleted_at           timestamptz,
  ADD COLUMN staged_file_path     text,
  ADD COLUMN staged_mime_type     text,
  ADD COLUMN staged_original_name text;

CREATE INDEX content_posts_delivery_queue
  ON content_posts (next_attempt_at)
  WHERE pending_action <> 'none' AND delivery_status = 'pending';
CREATE INDEX content_posts_delivery_processing
  ON content_posts (delivery_claimed_at)
  WHERE delivery_status = 'processing';
CREATE INDEX content_posts_active
  ON content_posts (created_at DESC)
  WHERE deleted_at IS NULL;

UPDATE settings SET value = '47185920'::jsonb
 WHERE key = 'maxUploadSizeBytes' AND value = '52428800'::jsonb;
INSERT INTO settings (key, value) VALUES ('maxContentUploadBytes', '524288000'::jsonb)
  ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Write the setting getters** in `settings.repository.ts`:

```ts
export const getMaxUploadSizeBytes = async (db: Db = pool): Promise<number> => {
  const value = await getSetting<number>('maxUploadSizeBytes', db);
  const raw = typeof value === 'number' && value > 0 ? value : DEFAULT_DRIVE_THRESHOLD_BYTES;
  return Math.min(raw, TELEGRAM_MAX_UPLOAD_BYTES);
};

export const getMaxContentUploadBytes = async (db: Db = pool): Promise<number> => {
  const value = await getSetting<number>('maxContentUploadBytes', db);
  return typeof value === 'number' && value > 0 ? value : DEFAULT_MAX_CONTENT_UPLOAD_BYTES;
};
```
Import the three constants from `@thd/shared`.

- [ ] **Step 3: Failing int test** `settings.repository.int.test.ts`:
  - after `resetTestDatabase`, `getMaxUploadSizeBytes()` === 47185920 (reseeded).
  - `UPDATE settings SET value='99999999'` (99 MB) → `getMaxUploadSizeBytes()` === 52428800 (clamped).
  - `getMaxContentUploadBytes()` === 524288000; set to `1000000000` → returns 1000000000; set to `0` → returns default.
- [ ] **Step 4: Run, verify fail → implement → pass.** `npm run test:integration --workspace=apps/api`.
  The migration applies automatically in `global-setup.ts` on a fresh test DB.
- [ ] **Step 5: Commit** `feat(api): migration 0009 content delivery + settings getters`.

---

### Task 3: Content repository

**Files:**
- Create: `apps/api/src/repositories/content.repository.ts`
- Test: `apps/api/src/repositories/content.repository.int.test.ts`

**Interfaces (produces):**
- `interface ContentPostQueueRow` + `mapContentPostRow`
- `insertContentPost(input, db=pool): Promise<ContentPost>` where `input = { title; disciplineTag; formatTag; cohortTag: number|null; postedBy: string; driveLink: string|null; fileSizeBytes: number|null; stagedFilePath: string|null; stagedMimeType: string|null; stagedOriginalName: string|null }` — inserts `pending_action='publish'`, `delivery_status='pending'`, `next_attempt_at=NULL`.
- `listContentPosts(filters, db=pool): Promise<{ items: ContentPost[]; total: number }>` where `filters = { discipline?: DisciplineTag; format?: ContentFormat; cohortYear?: number; search?: string|null; page: number; pageSize: number }`; only `deleted_at IS NULL`; `title ILIKE '%'||$n||'%' ESCAPE '\'`.
- `getContentPostQueueById(id, db=pool): Promise<ContentPostQueueRow | null>` — all columns incl. queue + staged path + `deleted_at` + `posted_by`; any `deleted_at` state.
- `updateContentPost(id, patch, db=pool): Promise<ContentPost | null>` — `patch = { title?; disciplineTag?; formatTag?; cohortTag? }`.
- `hardDeleteContentPost(id, db=pool): Promise<void>`
- `queueContentDelete(id, db=pool): Promise<void>` — `deleted_at=now(), pending_action='delete', delivery_status='pending', delivery_attempts=0, next_attempt_at=NULL, delivery_error=NULL, delivery_claimed_at=NULL`.
- `clearStagedFile(id, db=pool): Promise<void>`
- `claimContentTasks(input:{limit:number;leaseSeconds:number}, db=pool): Promise<ContentDeliveryTask[]>`
- `rescheduleContentTask(id, input:{error:string;nextAttemptAt:Date}, db=pool): Promise<void>`
- `markContentTaskFailed(id, input:{error:string}, db=pool): Promise<void>`
- `markContentPosted(id, input:{telegramMessageId:number; resurrect:boolean}, db=pool): Promise<void>` — when `resurrect` (row has `deleted_at`) → `telegram_message_id` set, `pending_action='delete'`, `delivery_status='pending'`, `next_attempt_at=NULL`; else → `telegram_message_id` set, `pending_action='none'`, `delivery_status='posted'`, `next_attempt_at=NULL`.

- [ ] **Step 1: Failing tests** — insert returns mapped `ContentPost` (`telegramMessageId:null`); list filters (discipline/format/cohort) + `search` matches literal `100%` only (escape) + pagination + `total` excludes soft-deleted; `updateContentPost` changes only given fields; `hardDeleteContentPost` removes the row; `queueContentDelete` sets the soft-delete + delete action; `claimContentTasks` returns only `pending_action<>'none' AND delivery_status='pending'` rows and sets `processing` + `delivery_attempts+1`; a `delete` row with `telegram_message_id IS NULL` is not claimed, with an id is claimed; two claims never return the same id; stale `processing` older than lease is reclaimed; `markContentPosted(resurrect:true)` keeps `deleted_at` + sets `pending_action='delete'`.
- [ ] **Step 2: Run, verify fail.** `npm run test:integration --workspace=apps/api`
- [ ] **Step 3: Implement.** Use the exact claim SQL from the spec §5.5.1 (reclaim + `FOR UPDATE SKIP LOCKED` lease); note `cohort_tag` maps to `cohortTag`, `discipline_tag`→`disciplineTag`, `format_tag`→`formatTag`; `file_size_bytes` and `telegram_message_id` are `bigint` → `Number(...)`. Search escaping uses `params.search.replace(/[\\%_]/g, '\\$&')`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(api): content repository (CRUD + delivery queue)`.

---

### Task 4: Upload hygiene utils + multer middleware + Drive service

**Files:**
- Create: `apps/api/src/utils/ilike.ts`, `apps/api/src/utils/file-type.ts`, `apps/api/src/middleware/upload.ts`, `apps/api/src/services/drive.service.ts`
- Test: `apps/api/src/utils/ilike.test.ts`, `apps/api/src/utils/file-type.test.ts`, `apps/api/src/services/drive.service.test.ts`

**Interfaces (produces):**
- `escapeLike(value: string): string` → replaces `\`→`\\`, `%`→`\%`, `_`→`\_`.
- `detectMime(buffer: Buffer): string | null` returning one of `application/pdf | application/epub+zip | audio/wav | audio/ogg | audio/mpeg | audio/mp4 | video/mp4 | video/quicktime | video/webm`.
- `contentUpload` — multer instance: disk storage, destination `env.CONTENT_STAGING_DIR` (created with `mkdirSync({recursive:true})`), `filename: () => randomUUID()`, `limits: { files: 1, fileSize: 2147483648 }`.
- `uploadSingle` — Express middleware wrapping `contentUpload.single('file')`, translating `MulterError` (`LIMIT_FILE_SIZE` → `VALIDATION_ERROR` "exceeds the maximum upload size") to `AppError`.
- `createDriveService({ serviceAccountJson, folderId, fetchImpl }): DriveService` with `isConfigured: boolean` and `uploadFile({ stream, mimeType, name }): Promise<{ webViewLink: string }>`.

- [ ] **Step 1: Failing tests.**
  - `escapeLike('100%_x\\')` === `'100\\%\\_x\\\\'`.
  - `detectMime` — real byte buffers: `%PDF`→`application/pdf`; `PK\x03\x04`→`application/epub+zip`; `RIFF....WAVE`→`audio/wav`; `OggS`→`audio/ogg`; `ID3`→`audio/mpeg`; `\xFF\xFB`→`audio/mpeg`; `....ftypisom`→`video/mp4`; `....ftypqt  `→`video/quicktime`; `....ftypM4A `→`audio/mp4`; `\x1A\x45\xDF\xA3`→`video/webm`; text bytes → `null`.
  - `drive.service` (with injected `fetchImpl`): no configured JSON → `isConfigured === false` and `uploadFile` throws `AppError` `INTERNAL_ERROR`; configured → posts a signed-JWT token request, a resumable create with `uploadType=resumable&supportsAllDrives=true` (metadata `parents`, `copyRequiresWriterPermission:true`), a body PUT to the session URI, a permissions POST (`role:reader,type:anyone`), and returns `webViewLink` from the create response.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
  - `ilike.ts`: `export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');`
  - `file-type.ts`: `detectMime` checks signatures in order (PDF, ZIP, RIFF+WAVE, OggS, ID3/frame-sync, `ftyp` + brand, EBML). `ftyp` brand at offset 8: `qt  `→`video/quicktime`, `M4A `/`M4B `→`audio/mp4`, else `video/mp4`.
  - `upload.ts`: as above; ensure the staging dir exists at module load.
  - `drive.service.ts`: parse `GOOGLE_SERVICE_ACCOUNT_JSON` → `{ client_email, private_key }`; build a JWT header `{alg:'RS256',typ:'JWT'}`, claim `{iss, scope:'https://www.googleapis.com/auth/drive', aud:'https://oauth2.googleapis.com/token', iat, exp:+3600}`; sign with `crypto.createSign('RSA-SHA256')`; exchange at `https://oauth2.googleapis.com/token` (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`); cache the token until ~60 s before expiry. `uploadFile` does the 3 calls from spec §5.5 (`fields=id,webViewLink`). All network via injected `fetchImpl`. `createDriveService` reads `env.GOOGLE_SERVICE_ACCOUNT_JSON`/`env.GOOGLE_DRIVE_FOLDER_ID`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(api): upload hygiene utils, multer middleware, drive service`.

---

### Task 5: `requireVerifiedMember` middleware + errors + roster getter

**Files:**
- Modify: `apps/api/src/utils/errors.ts`, `apps/api/src/repositories/roster.repository.ts`
- Create: `apps/api/src/middleware/require-verified-member.ts`
- Test: `apps/api/src/middleware/require-verified-member.test.ts`

**Interfaces (produces):**
- `ErrorCode` gains `'NOT_VERIFIED'`.
- `getActiveRosterByUserId(userId: string, db=pool): Promise<RosterEntry | null>` — rows where `user_id = $1 AND status = 'active'`, newest first.
- `requireVerifiedMember(req, res, next)` — no `req.user` → `401 UNAUTHORIZED`; `role !== 'scholar'` → `next()`; active roster row → `next()`; else `403 NOT_VERIFIED`.

- [ ] **Step 1: Failing test** `require-verified-member.test.ts` (mock `req.user` and stub the roster repo): admin/registrar/faculty `next()` with no DB call; scholar with active row `next()`; scholar with no/graduated row → `AppError NOT_VERIFIED`; no user → `UNAUTHORIZED`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the three pieces.
- [ ] **Step 4: Run, verify pass.** `npm run test --workspace=apps/api`
- [ ] **Step 5: Commit** `feat(api): verified-member guard for content reads`.

---

### Task 6: Content service (create / list / update / delete)

**Files:**
- Create: `apps/api/src/services/content.service.ts`
- Test: `apps/api/src/services/content.service.test.ts` (unit, injected deps) + `apps/api/src/services/content.int.test.ts` (DB/filesystem)

**Interfaces (produces):**
- `createContent(input: { actorUserId: string; fields: ContentCreateMultipartInput; file: StagedUpload | null; maxUploadBytes: number; driveThreshold: number; drive: DriveService; stagingDir: string }): Promise<ContentPost>` where `StagedUpload = { path: string; size: number; mimetype: string; originalname: string }`.
  - Exactly one of `fields.driveLink` / `file` → else `400 VALIDATION_ERROR`.
  - `file`: `fields.formatTag` whitelist contains `mimetype` **and** `detectMime(firstChunk(path))` ∈ whitelist, else `400 VALIDATION_ERROR` ("unrecognized or mismatched file type"). Read first 4104 bytes.
  - `file.size > maxUploadBytes` → `400 VALIDATION_ERROR` ("exceeds the maximum upload size") + unlink temp.
  - `file.size > driveThreshold` → `drive.uploadFile({ stream: createReadStream(path), mimeType, name: title })` → `driveLink = webViewLink`; unlink temp; `fileSizeBytes = file.size`; no `staged_*`.
  - else → `moveFile(path, join(stagingDir, randomUUID()))`; store `staged_*`.
  - Insert row + `audit_logs content_created { title }` in one `withTransaction`.
  - On any thrown error after a temp file exists → unlink temp/staged (best-effort).
- `listContent(filters): Promise<{ items; total }>` — passthrough to repo.
- `updateContent(input: { actorUserId; actorRole: Role; id: string; patch: ContentUpdateInput }): Promise<ContentPost>` — ownership (`admin` any; `faculty` only `postedBy === actorUserId`; else `403 FORBIDDEN`); not found / soft-deleted → `404 NOT_FOUND`; `audit_logs content_updated { title, changed: Object.keys(patch) }`.
- `deleteContent(input: { actorUserId; actorRole: Role; id: string; stagingDir: string }): Promise<{ hardDeleted: boolean }>` — ownership; if `telegram_message_id IS NULL AND delivery_attempts = 0 AND delivery_status = 'pending'` → unlink staged + `hardDeleteContentPost`; else `queueContentDelete`. `audit_logs content_deleted { title }` in both cases.

- [ ] **Step 1: Failing unit tests** (`content.service.test.ts`, injected fake repo/drive/fs):
  - neither file nor `driveLink` → `400`; both → `400`; bad magic bytes → `400`; size > cap → `400` (+ temp unlinked); size between threshold and cap → `drive.uploadFile` called, `driveLink` set, temp unlinked; size ≤ threshold → staged path stored under staging dir; audit written.
  - update: faculty B on A's post → `403`; admin on A's → ok; unknown id → `404`.
  - delete never-claimed → `hardDeleteContentPost` + staged unlink + audit; posted (`deliveryAttempts=1` or message id set) → `queueContentDelete` + audit.
- [ ] **Step 2: Failing int tests** (`content.int.test.ts`, real DB + a temp staging dir passed as `stagingDir`): create-with-file inserts a row whose `pending_action='publish'`, `delivery_status='pending'`, `staged_file_path` set under the temp dir; insert a row directly then update/delete ownership against real rows.
- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement** the service with injectable seams (`createContent` receives `drive`/`stagingDir`; the repo and audit repo are imported modules but the ownership/route logic is pure enough to unit-test by seeding rows in the int test).
- [ ] **Step 5: Run, verify pass** (`npm run test --workspace=apps/api` and the integration config).
- [ ] **Step 6: Commit** `feat(api): content service (create/list/update/delete)`.

---

### Task 7: Public content controller + routes + app wiring

**Files:**
- Create: `apps/api/src/controllers/content-controller.ts`, `apps/api/src/routes/content-routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/controllers/content.int.test.ts`

**Interfaces (produces):**
- `getContent` → parse `req.query` (`discipline`, `format`, `cohortYear`, `search`, `page`, `pageSize`) with a local zod schema (page default 1, pageSize default 20 max 100; cohortYear coerced int) → `200 { items, total, page, pageSize }`.
- `postContent` → require `req.user`; build `fields` from `req.body` via `contentCreateMultipartSchema` (multipart) or `contentCreateSchema` (json); `file` from `req.file`; call `createContent` with `maxUploadBytes`/`driveThreshold` from settings and a module-level drive service; `201 { contentPost }`.
- `patchContent`/`deleteContent` → `req.user`, uuid-validate `:id` (`400`), call the service; `200 { contentPost }` / `200 { hardDeleted }`.
- `routes/content-routes.ts`:
  ```ts
  router.get('/content', requireVerifiedMember, asyncHandler(getContent));
  router.post('/content', requireRole('faculty','admin'), uploadSingle, asyncHandler(postContent));
  router.patch('/content/:id', requireRole('faculty','admin'), asyncHandler(patchContent));
  router.delete('/content/:id', requireRole('faculty','admin'), asyncHandler(deleteContent));
  ```
- `app.ts`: `app.use('/api', authUser, contentRoutes);`

- [ ] **Step 1: Failing int tests** (spec §8 items 1–12, 18). Use `signInitData({ telegramId }, 'test-bot-token')` for `authorization: tma <initData>` and `createUser(telegramId, role)` for roles. Assign the drive service a fake via a test seam (e.g. `setDriveServiceForTests`) or set `GOOGLE_SERVICE_ACCOUNT_JSON` unset and keep the over-threshold case out of this file (it needs Drive) — assert create/list/patch/delete + membership + ownership + ILIKE escaping.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** controller + routes + `app.ts` mount.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(api): public content endpoints + verified-member guard`.

---

### Task 8: Internal content endpoints (claim / confirm / download) + service

**Files:**
- Modify: `apps/api/src/services/content.service.ts`, `apps/api/src/routes/internal-routes.ts`
- Create: `apps/api/src/controllers/internal-content-controller.ts`
- Test: `apps/api/src/controllers/internal-content.int.test.ts`

**Interfaces (produces):**
- `claimContent({ limit }): Promise<ClaimContentTasksResponse>` — calls `claimContentTasks({ limit, leaseSeconds: env.CONTENT_DELIVERY_LEASE_SECONDS })`; for each task with `hasStagedFile`, if the file is missing → `markContentTaskFailed(id, { error: 'staged file missing' })` + `audit_logs content_delivery_failed { title, action, attempts, error }` and **drop** it from the batch.
- `completeContent(input): Promise<{ deliveryStatus: ContentDeliveryStatus; hardDeleted?: true }>`:
  - `posted`: load row; if missing → `404`, **except** a `posted` outcome for a missing row → `200 { deliveryStatus:'posted' }` no-op (N3). `markContentPosted(id, { telegramMessageId, resurrect: row.deletedAt !== null })`; `clearStagedFile`; unlink staged file if any; `audit_logs content_posted { title, telegramMessageId }`.
  - `deleted`: unlink staged file; `hardDeleteContentPost(id)`; `200 { deliveryStatus:'posted', hardDeleted:true }`.
  - `failed`: `terminal` or `attempts ≥ env.CONTENT_DELIVERY_MAX_ATTEMPTS` → `markContentTaskFailed` + `audit_logs content_delivery_failed { title, action, attempts, error }`; else `rescheduleContentTask` with `computeBackoffSeconds(attempts, env.CONTENT_DELIVERY_BACKOFF_BASE_SECONDS)`.
- Controllers: `postClaimContent` (200), `postCompleteContent` (uuid-validate `:id` → 400), `getContentDownload`.
- `getContentDownload` — load queue row; `404` if absent / `staged_file_path` null / file missing; `res.sendFile`/stream with `Content-Type: staged_mime_type` and `Content-Disposition: attachment; filename="<escaped originalName>"`; never expose the internal UUID path.
- Routes (in `internal-routes.ts`):
  ```ts
  router.post('/content/claim', asyncHandler(postClaimContent));
  router.post('/content/:id/confirm', asyncHandler(postCompleteContent));
  router.get('/content/:id/download', asyncHandler(getContentDownload));
  ```

- [ ] **Step 1: Failing int tests** (spec §8 items 13–18): claim returns queued publish/delete rows; missing staged file → failed + audit, not returned; `confirm{posted,msgId}` stores the id + `pending_action='none'`; delete-during-publish race (soft-deleted row + publish confirm → stays `deleted_at`, `pending_action='delete'`, id set → delete claim → `confirm{deleted}` → hard-deleted, no orphan); `confirm{deleted}` twice → second is a `posted`-no-op/200; `confirm{failed}` below max → `pending` + `next_attempt_at`; at/over max → `failed` + audit incl. title; stale lease reclaimed; download streams bytes + headers; 401/400/404.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** service additions, controller, routes.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(api): internal content claim/confirm/download endpoints`.

---

### Task 9: API env wiring + `.env.example`

**Files:**
- Modify: `apps/api/src/config/env.ts`, `apps/api/.env.example`

**Interfaces (produces):** `CONTENT_STAGING_DIR` (default `.staging/content`), `CONTENT_DELIVERY_MAX_ATTEMPTS=5`, `CONTENT_DELIVERY_BACKOFF_BASE_SECONDS=60`, `CONTENT_DELIVERY_LEASE_SECONDS=120`, `CONTENT_DELIVERY_BATCH_SIZE=10`, `GOOGLE_SERVICE_ACCOUNT_JSON` (optional string), `GOOGLE_DRIVE_FOLDER_ID` (optional string).

- [ ] **Step 1:** Add the 7 fields to `EnvSchema` (ints positive with defaults; `CONTENT_STAGING_DIR` string default `.staging/content`; the two Google vars optional strings).
- [ ] **Step 2:** Add them to `apps/api/.env.example` (with commented Drive notes).
- [ ] **Step 3:** `npm run build:shared && npm run typecheck --workspace=apps/api`. Expected: clean.
- [ ] **Step 4: Commit** `chore(api): content module env`.

---

### Task 9b: Integration test env (staging dir)

**Files:** Modify `apps/api/vitest.integration.config.ts`

- [ ] **Step 1:** Add `CONTENT_STAGING_DIR: '<os.tmpdir()>/thd-content-test'` (and keep the existing vars) to the `test.env` block so upload int tests write to a scratch dir.
- [ ] **Step 2:** Re-run the content int tests. Expected: PASS. **Commit** with Task 9.

---

### Task 10: Bot api-client + templates + error helper

**Files:**
- Modify: `apps/bot/src/services/api-client.ts`, `apps/bot/src/utils/telegram-errors.ts`, `apps/bot/src/templates/index.ts`
- Create: `apps/bot/src/templates/content-post.ts`
- Test: `apps/bot/src/services/api-client.test.ts` (extend), `apps/bot/src/templates/content-post.test.ts`, `apps/bot/src/utils/telegram-errors.test.ts` (extend)

**Interfaces (produces):**
- `BotApiClient.claimContentTasks(input?: ClaimContentTasksInput): Promise<ClaimContentTasksResponse>`
- `BotApiClient.completeContentTask(id: string, input: CompleteContentTaskInput): Promise<{ deliveryStatus: string }>`
- `BotApiClient.downloadContent(id: string): Promise<{ body: ArrayBuffer; mimeType: string | null; fileName: string | null }>`
- `isMessageGone(err: unknown): boolean` — true when the description contains `message to delete not found` or `message not found` (case-insensitive).
- `renderContentPost({ title, disciplineTag, formatTag, cohortTag, driveLink }): string` and `renderContentCaption({ title, disciplineTag, formatTag, cohortTag }): string` — exact copy from spec §6.3:

```
📘 {title}

Discipline: #{disciplineTag}
Format: #{formatTag}
Cohort: #{cohortTag}

🔗 {driveLink}
```

  Rules: `Cohort:` line omitted when `cohortTag` is null; `{title}` is HTML-escaped (`& < > "`); hashtags are dropped unless the value is in the shared whitelists (`DISCIPLINE_TAGS` / `CONTENT_FORMATS`); caption = the post text without the `🔗` line and its preceding blank line; both truncated to `TELEGRAM_CAPTION_MAX_LENGTH` (1024) on a safe boundary (never mid-HTML-entity — build the string, then slice and re-close nothing since entities are pre-escaped; slice at 1024).

- [ ] **Step 1: Failing tests** — client method paths/verbs (`/internal/content/claim` POST, `/internal/content/:id/confirm` POST, `/internal/content/:id/download` GET returning an `ArrayBuffer`); template exact copy; cohort line omitted; title `A & B <x>` escaped; unknown tag dropped; long caption truncated to ≤1024; `isMessageGone` positives/negatives.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Generalize `downloadContent` to read `res.arrayBuffer()`; keep header handling.
- [ ] **Step 4: Run, verify pass.** `npm run build:shared && npm run test --workspace=apps/bot`
- [ ] **Step 5: Commit** `feat(bot): content client, templates, telegram error helper`.

---

### Task 11: Bot content delivery loop + wiring + env

**Files:**
- Create: `apps/bot/src/services/content-delivery.ts`
- Modify: `apps/bot/src/index.ts`, `apps/bot/src/config/env.ts`, `apps/bot/.env.example`
- Test: `apps/bot/src/services/content-delivery.test.ts`

**Interfaces (produces):**
- `TelegramContent` structural interface: `sendMessage(chatId, text, opts?)`, `sendAudio(chatId, audio, opts?)`, `sendVideo(chatId, video, opts?)`, `sendDocument(chatId, doc, opts?)`, `deleteMessage(chatId, messageId)`.
- `deliverContentTask(task, deps): Promise<void>`:
  - `action==='delete'`: `deleteMessage(BOT_CHANNEL_ID, task.telegramMessageId)`; `isMessageGone` → treat as success → `completeContentTask(id, { outcome:'deleted' })`; other error → `completeContentTask(id, { outcome:'failed', error })`.
  - `action==='publish'` with `driveLink` → `sendMessage(channel, renderContentPost(...), { parse_mode:'HTML' })` → `completeContentTask(id, { outcome:'posted', telegramMessageId: sent.message_id })`.
  - `action==='publish'` with a staged file → `downloadContent(id)`; method by mime: `audio/mpeg`/`audio/mp4`/`audio/x-m4a`→`sendAudio`; `video/mp4`→`sendVideo`; else→`sendDocument`; caption = `renderContentCaption(...)`; `{ caption, parse_mode:'HTML' }` → `completeContentTask(id, { outcome:'posted', telegramMessageId })`.
  - `downloadContent` 404 (missing staged file) → `completeContentTask(id, { outcome:'failed', error, terminal:true })` (N6).
  - Any other error → `completeContentTask(id, { outcome:'failed', error })`.
- `startContentLoop(deps)` / `stopContentLoop()` — interval `BOT_OUTBOX_POLL_INTERVAL_MS`, batch `BOT_CONTENT_BATCH_SIZE`.
- Bot env: `BOT_CONTENT_BATCH_SIZE` int positive default 10 → `env.contentBatchSize`.

- [ ] **Step 1: Failing tests** — method selection (mp3/m4a→sendAudio, mp4→sendVideo, wav/webm/mov/pdf/epub→sendDocument); drive-path → sendMessage; staged-path → correct method + `complete{posted, message_id}`; delete → deleteMessage; message-not-found → `complete{deleted}`; download 404 → `complete{failed, terminal:true}`; loop tick uses the batch size.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the executor, loop, and wiring. `index.ts`: create `startContentLoop({ api, telegram: bot.telegram, channelId: env.botChannelId, logger, intervalMs: env.outboxPollIntervalMs, batchSize: env.contentBatchSize })` alongside the join-request loop; stop both on `SIGINT`/`SIGTERM`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(bot): content delivery loop`.

---

### Task 12: Docs

**Files:** `docs/context/{api-reference,database-schema,workflows,security,architecture}.md`, `README.md`, `apps/api/.env.example`, `apps/bot/.env.example`

- [ ] **Step 1:** `api-reference.md` — document `GET/POST/PATCH/DELETE /api/content` and the 3 internal endpoints (`claim`/`:id/confirm`/`:id/download`), request/response shapes, status codes.
- [ ] **Step 2:** `database-schema.md` — `content_posts` new columns + 3 partial indexes + migration `0009`; the two settings keys.
- [ ] **Step 3:** `workflows.md` #5/#6 — mark the content module implemented; describe size routing, outbox/retry, delete lifecycle.
- [ ] **Step 4:** `security.md` — Drive Shared Drive requirement, anyone-with-link accepted risk, magic-byte verification, ILIKE escaping, deploy notes (`client_max_body_size`, persistent `CONTENT_STAGING_DIR`).
- [ ] **Step 5:** `architecture.md` — fix any 2 GB direct-to-Telegram wording (N1); note Drive routing.
- [ ] **Step 6:** `README.md` — API + bot env additions.
- [ ] **Step 7: Commit** `docs: phase 9 content module`.

---

### Task 13: Full verification gate

- [ ] **Step 1:** `npm run build:shared && npm run lint && npm run typecheck && npm run test && npm run build`
- [ ] **Step 2:** `npm run test:integration --workspace=apps/api`
- [ ] **Step 3:** Confirm `apps/api/dist/` and `apps/bot/dist/` output; record test counts. **Do not commit unless asked.**

---

## Self-review

- **Spec coverage:** §3 migration→T2; §4 shared→T1; §5.1 GET→T6/T7; §5.2 POST→T4/T6/T7; §5.3 DELETE→T6; §5.4 PATCH→T6; §5.5 internal endpoints→T8; §5.5.1 claim SQL→T3; §5.5 drive→T4; §5.6 requireVerifiedMember→T5/T7; §5.7 upload/hygiene→T4; §5.7 env→T9; §6 bot→T10/T11; §7 cross-cutting→T1/T4/T6/T8; §8 tests→each task; §9 files→all; N1–N8→T1/T2/T4/T6/T8/T9/T10/T11/T12.
- **Placeholders:** none — SQL, signatures, copy, and test cases are concrete; long verbatim copy (template, migration) is inlined or pinned to a numbered spec section.
- **Type consistency:** `ContentDeliveryTask`, `ClaimContentTasksResponse`, `ContentCreateMultipartInput`, `CompleteContentTaskInput` are defined in T1 and consumed unchanged in T3/T6/T8/T10/T11; repo function names are stable across T3/T6/T8.
- **Deviations to record:** Drive is implemented with hand-rolled JWT + `fetch` (no `googleapis`); magic bytes are hand-rolled in `utils/file-type.ts` (no `file-type` npm dep) — the amendment's "e.g. file-type" was illustrative.
