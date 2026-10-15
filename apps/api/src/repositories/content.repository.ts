import type { ContentDeliveryTask, ContentPost } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';
import { escapeLike } from '../utils/ilike';

interface ContentPostRow {
  id: string;
  title: string;
  discipline_tag: string;
  format_tag: string;
  cohort_tag: number | null;
  posted_by: string;
  telegram_message_id: string | null;
  drive_link: string | null;
  file_size_bytes: string | null;
  pending_action: string;
  delivery_status: string;
  delivery_attempts: number;
  next_attempt_at: Date | null;
  delivery_claimed_at: Date | null;
  delivery_error: string | null;
  deleted_at: Date | null;
  staged_file_name: string | null;
  staged_mime_type: string | null;
  staged_original_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ContentDeliveryRecord extends ContentDeliveryTask {
  stagedFileName: string | null;
  attempts: number;
  deletedAt: string | null;
}

const CONTENT_COLUMNS = `id, title, discipline_tag, format_tag, cohort_tag, posted_by,
  telegram_message_id, drive_link, file_size_bytes, pending_action, delivery_status,
  delivery_attempts, next_attempt_at, delivery_claimed_at, delivery_error, deleted_at,
  staged_file_name, staged_mime_type, staged_original_name, created_at, updated_at`;

const toNumberOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

const mapContentRow = (row: ContentPostRow): ContentPost => ({
  id: row.id,
  title: row.title,
  disciplineTag: row.discipline_tag as ContentPost['disciplineTag'],
  formatTag: row.format_tag as ContentPost['formatTag'],
  cohortTag: row.cohort_tag,
  postedBy: row.posted_by,
  telegramMessageId: toNumberOrNull(row.telegram_message_id),
  driveLink: row.drive_link,
  fileSizeBytes: toNumberOrNull(row.file_size_bytes),
  pendingAction: row.pending_action as ContentPost['pendingAction'],
  deliveryStatus: row.delivery_status as ContentPost['deliveryStatus'],
  deliveryAttempts: row.delivery_attempts,
  deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapDeliveryRecord = (row: ContentPostRow): ContentDeliveryRecord => ({
  id: row.id,
  action: row.pending_action as ContentDeliveryRecord['action'],
  title: row.title,
  disciplineTag: row.discipline_tag as ContentDeliveryRecord['disciplineTag'],
  formatTag: row.format_tag as ContentDeliveryRecord['formatTag'],
  cohortTag: row.cohort_tag,
  telegramMessageId: toNumberOrNull(row.telegram_message_id),
  driveLink: row.drive_link,
  hasStagedFile: row.staged_file_name !== null,
  stagedMimeType: row.staged_mime_type,
  stagedOriginalName: row.staged_original_name,
  stagedFileName: row.staged_file_name,
  attempts: row.delivery_attempts,
  deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
});

export interface InsertContentPostInput {
  title: string;
  disciplineTag: ContentPost['disciplineTag'];
  formatTag: ContentPost['formatTag'];
  cohortTag: number | null;
  postedBy: string;
  driveLink: string | null;
  fileSizeBytes: number | null;
  stagedFileName: string | null;
  stagedMimeType: string | null;
  stagedOriginalName: string | null;
}

export async function insertContentPost(
  input: InsertContentPostInput,
  db: Db = pool,
): Promise<ContentPost> {
  const { rows } = await db.query<ContentPostRow>(
    `INSERT INTO content_posts
       (title, discipline_tag, format_tag, cohort_tag, posted_by, drive_link, file_size_bytes,
        staged_file_name, staged_mime_type, staged_original_name, pending_action, delivery_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'publish', 'pending')
     RETURNING ${CONTENT_COLUMNS}`,
    [
      input.title,
      input.disciplineTag,
      input.formatTag,
      input.cohortTag,
      input.postedBy,
      input.driveLink,
      input.fileSizeBytes,
      input.stagedFileName,
      input.stagedMimeType,
      input.stagedOriginalName,
    ],
  );
  return mapContentRow(rows[0]);
}

export interface ContentListFilters {
  disciplineTag?: ContentPost['disciplineTag'];
  formatTag?: ContentPost['formatTag'];
  cohortYear?: number;
  search?: string;
  authorId?: string;
  deliveryStatus?: ContentPost['deliveryStatus'];
  page: number;
  pageSize: number;
}

export async function listContentPosts(
  filters: ContentListFilters,
  db: Db = pool,
): Promise<{ items: ContentPost[]; total: number }> {
  const conditions: string[] = ['deleted_at IS NULL'];
  const values: unknown[] = [];

  if (filters.disciplineTag) {
    values.push(filters.disciplineTag);
    conditions.push(`discipline_tag = $${values.length}`);
  }
  if (filters.formatTag) {
    values.push(filters.formatTag);
    conditions.push(`format_tag = $${values.length}`);
  }
  if (filters.cohortYear !== undefined) {
    values.push(filters.cohortYear);
    conditions.push(`cohort_tag = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${escapeLike(filters.search)}%`);
    conditions.push(`title ILIKE $${values.length} ESCAPE '\\'`);
  }
  if (filters.authorId) {
    values.push(filters.authorId);
    conditions.push(`posted_by = $${values.length}`);
  }
  if (filters.deliveryStatus) {
    values.push(filters.deliveryStatus);
    conditions.push(`delivery_status = $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM content_posts ${where}`,
    values,
  );

  const offset = (filters.page - 1) * filters.pageSize;
  const pageValues = [...values, filters.pageSize, offset];
  const { rows } = await db.query<ContentPostRow>(
    `SELECT ${CONTENT_COLUMNS} FROM content_posts ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
    pageValues,
  );

  return { items: rows.map(mapContentRow), total: Number(countResult.rows[0].count) };
}

export async function getContentPostById(
  id: string,
  db: Db = pool,
): Promise<ContentPost | null> {
  const { rows } = await db.query<ContentPostRow>(
    `SELECT ${CONTENT_COLUMNS} FROM content_posts WHERE id = $1`,
    [id],
  );
  return rows.length > 0 ? mapContentRow(rows[0]) : null;
}

export async function countByAuthor(authorId: string, db: Db = pool): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM content_posts
      WHERE posted_by = $1 AND deleted_at IS NULL`,
    [authorId],
  );
  return Number(rows[0].count);
}

export async function countFailedByAuthor(authorId: string, db: Db = pool): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM content_posts
      WHERE posted_by = $1 AND deleted_at IS NULL AND delivery_status = 'failed'`,
    [authorId],
  );
  return Number(rows[0].count);
}

export async function listRecentByAuthor(
  authorId: string,
  limit: number,
  db: Db = pool,
): Promise<ContentPost[]> {
  const { rows } = await db.query<ContentPostRow>(
    `SELECT ${CONTENT_COLUMNS} FROM content_posts
      WHERE posted_by = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [authorId, limit],
  );
  return rows.map(mapContentRow);
}

export async function getContentPostDeletionInfo(
  id: string,
  db: Db = pool,
): Promise<{
  deliveryAttempts: number;
  deliveryStatus: ContentPost['deliveryStatus'];
  telegramMessageId: number | null;
  stagedFileName: string | null;
} | null> {
  const { rows } = await db.query<{
    delivery_attempts: number;
    delivery_status: string;
    telegram_message_id: string | null;
    staged_file_name: string | null;
  }>(
    `SELECT delivery_attempts, delivery_status, telegram_message_id, staged_file_name
       FROM content_posts WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  return {
    deliveryAttempts: rows[0].delivery_attempts,
    deliveryStatus: rows[0].delivery_status as ContentPost['deliveryStatus'],
    telegramMessageId: toNumberOrNull(rows[0].telegram_message_id),
    stagedFileName: rows[0].staged_file_name,
  };
}

export async function clearContentStagedFile(id: string, db: Db = pool): Promise<void> {
  await db.query(
    `UPDATE content_posts
        SET staged_file_name = NULL, staged_mime_type = NULL, staged_original_name = NULL
      WHERE id = $1`,
    [id],
  );
}

export async function updateContentPost(
  id: string,
  input: {
    title?: string;
    disciplineTag?: ContentPost['disciplineTag'];
    formatTag?: ContentPost['formatTag'];
    cohortTag?: number | null;
  },
  db: Db = pool,
): Promise<ContentPost | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    values.push(input.title);
    sets.push(`title = $${values.length}`);
  }
  if (input.disciplineTag !== undefined) {
    values.push(input.disciplineTag);
    sets.push(`discipline_tag = $${values.length}`);
  }
  if (input.formatTag !== undefined) {
    values.push(input.formatTag);
    sets.push(`format_tag = $${values.length}`);
  }
  if (input.cohortTag !== undefined) {
    values.push(input.cohortTag);
    sets.push(`cohort_tag = $${values.length}`);
  }

  if (sets.length === 0) return getContentPostById(id, db);

  sets.push('updated_at = now()');
  values.push(id);
  const { rows } = await db.query<ContentPostRow>(
    `UPDATE content_posts SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${CONTENT_COLUMNS}`,
    values,
  );
  return rows.length > 0 ? mapContentRow(rows[0]) : null;
}

export async function softDeleteContentPost(
  id: string,
  db: Db = pool,
): Promise<ContentPost | null> {
  const { rows } = await db.query<ContentPostRow>(
    `UPDATE content_posts
        SET deleted_at = now(), pending_action = 'delete', delivery_status = 'pending',
            delivery_attempts = 0, next_attempt_at = NULL, delivery_claimed_at = NULL,
            delivery_error = NULL, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING ${CONTENT_COLUMNS}`,
    [id],
  );
  return rows.length > 0 ? mapContentRow(rows[0]) : null;
}

export async function hardDeleteContentPost(id: string, db: Db = pool): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM content_posts WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function claimContentTasks(
  input: { limit: number; leaseSeconds: number },
  db: Db = pool,
): Promise<ContentDeliveryRecord[]> {
  await db.query(
    `UPDATE content_posts
        SET delivery_status = 'pending', delivery_claimed_at = NULL
      WHERE delivery_status = 'processing'
        AND delivery_claimed_at < now() - make_interval(secs => $1)`,
    [input.leaseSeconds],
  );

  const { rows } = await db.query<ContentPostRow>(
    `UPDATE content_posts p
        SET delivery_status = 'processing',
            delivery_claimed_at = now(),
            delivery_attempts = p.delivery_attempts + 1
      WHERE p.id IN (
        SELECT id FROM content_posts
         WHERE pending_action <> 'none'
           AND delivery_status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1)
      RETURNING ${CONTENT_COLUMNS.replace(/\bid\b/, 'p.id').replace(/, created_at/, ', p.created_at')}`,
    [input.limit],
  );
  return rows.map(mapDeliveryRecord);
}

export async function getContentDeliveryRecord(
  id: string,
  db: Db = pool,
): Promise<ContentDeliveryRecord | null> {
  const { rows } = await db.query<ContentPostRow>(
    `SELECT ${CONTENT_COLUMNS} FROM content_posts WHERE id = $1`,
    [id],
  );
  return rows.length > 0 ? mapDeliveryRecord(rows[0]) : null;
}

export async function markContentPosted(
  id: string,
  telegramMessageId: number,
  db: Db = pool,
): Promise<void> {
  await db.query(
    `UPDATE content_posts
        SET telegram_message_id = $2,
            pending_action = CASE WHEN pending_action = 'delete' THEN 'delete' ELSE 'none' END,
            delivery_status = CASE WHEN pending_action = 'delete' THEN 'pending' ELSE 'posted' END,
            delivery_claimed_at = NULL,
            next_attempt_at = NULL,
            delivery_error = NULL,
            updated_at = now()
      WHERE id = $1`,
    [id, telegramMessageId],
  );
}

export async function markContentDeleted(id: string, db: Db = pool): Promise<void> {
  await db.query(
    `UPDATE content_posts
        SET pending_action = 'none', delivery_status = 'posted',
            delivery_claimed_at = NULL, delivery_error = NULL, next_attempt_at = NULL,
            updated_at = now()
      WHERE id = $1`,
    [id],
  );
}

export async function rescheduleContentTask(
  id: string,
  input: { error: string; nextAttemptAt: Date },
  db: Db = pool,
): Promise<void> {
  await db.query(
    `UPDATE content_posts
        SET delivery_status = 'pending', delivery_error = $2,
            delivery_claimed_at = NULL, next_attempt_at = $3
      WHERE id = $1`,
    [id, input.error, input.nextAttemptAt],
  );
}

export async function markContentFailed(
  id: string,
  input: { error: string; terminal: boolean },
  db: Db = pool,
): Promise<void> {
  if (!input.terminal) {
    await rescheduleContentTask(id, { error: input.error, nextAttemptAt: new Date() }, db);
    return;
  }
  await db.query(
    `UPDATE content_posts
        SET delivery_status = 'failed', delivery_error = $2, delivery_claimed_at = NULL
      WHERE id = $1`,
    [id, input.error],
  );
}
