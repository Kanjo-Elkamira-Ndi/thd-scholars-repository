import type { MemberRemoval, MemberRemovalTask } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

export interface MemberRemovalRow {
  id: string;
  user_id: string;
  requested_by: string | null;
  initiated_by_role: string;
  reason: string | null;
  status: string;
  delivery_attempts: number;
  next_attempt_at: Date | null;
  claimed_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  processed_at: Date | null;
}

const REMOVAL_COLUMNS = `id, user_id, requested_by, initiated_by_role, reason, status,
  delivery_attempts, next_attempt_at, claimed_at, last_error, created_at, updated_at, processed_at`;

export const mapMemberRemoval = (row: {
  id: string;
  user_id: string;
  requested_by: string | null;
  initiated_by_role: string;
  reason: string | null;
  status: string;
  delivery_attempts: number;
  next_attempt_at: Date | null;
  claimed_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  processed_at: Date | null;
}): MemberRemoval => ({
  id: row.id,
  userId: row.user_id,
  requestedBy: row.requested_by,
  initiatedByRole: row.initiated_by_role as MemberRemoval['initiatedByRole'],
  reason: row.reason,
  status: row.status as MemberRemoval['status'],
  attempts: row.delivery_attempts,
  nextAttemptAt: row.next_attempt_at ? row.next_attempt_at.toISOString() : null,
  claimedAt: row.claimed_at ? row.claimed_at.toISOString() : null,
  lastError: row.last_error,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  processedAt: row.processed_at ? row.processed_at.toISOString() : null,
});

export const insertMemberRemoval = async (
  input: {
    userId: string;
    requestedBy: string | null;
    initiatedByRole: MemberRemoval['initiatedByRole'];
    reason: string | null;
  },
  db: Db = pool,
): Promise<{ removal: MemberRemoval; created: boolean }> => {
  const { rows } = await db.query<MemberRemovalRow>(
    `INSERT INTO member_removals (user_id, requested_by, initiated_by_role, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) WHERE status IN ('pending', 'processing') DO NOTHING
     RETURNING ${REMOVAL_COLUMNS}`,
    [input.userId, input.requestedBy, input.initiatedByRole, input.reason],
  );
  if (rows.length > 0) {
    return { removal: mapMemberRemoval(rows[0]), created: true };
  }
  const { rows: existing } = await db.query<MemberRemovalRow>(
    `SELECT ${REMOVAL_COLUMNS} FROM member_removals
      WHERE user_id = $1 AND status IN ('pending', 'processing')
      ORDER BY created_at DESC LIMIT 1`,
    [input.userId],
  );
  return { removal: mapMemberRemoval(existing[0]), created: false };
};

export const cancelPendingRemovalsForUser = async (
  userId: string,
  db: Db = pool,
): Promise<number> => {
  const { rowCount } = await db.query(
    `UPDATE member_removals
        SET status = 'cancelled', processed_at = now(), updated_at = now()
      WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
  return rowCount ?? 0;
};

export const claimMemberRemovals = async (
  input: { limit: number; leaseSeconds: number },
  db: Db = pool,
): Promise<MemberRemovalTask[]> => {
  await db.query(
    `UPDATE member_removals
        SET status = 'pending', claimed_at = NULL
      WHERE status = 'processing'
        AND claimed_at < now() - make_interval(secs => $1)`,
    [input.leaseSeconds],
  );

  const { rows } = await db.query<{ id: string; user_id: string; delivery_attempts: number }>(
    `UPDATE member_removals m
        SET status = 'processing',
            claimed_at = now(),
            delivery_attempts = m.delivery_attempts + 1,
            updated_at = now()
      WHERE m.id IN (
        SELECT id FROM member_removals
         WHERE status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
           AND (
             initiated_by_role = 'admin'
             OR EXISTS (
               SELECT 1 FROM roster r
                WHERE r.user_id = member_removals.user_id
                  AND r.status IN ('graduated', 'withdrawn')
             )
           )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1)
      RETURNING m.id, m.user_id, m.delivery_attempts`,
    [input.limit],
  );

  if (rows.length === 0) {
    return [];
  }
  const userIds = rows.map((row) => row.user_id);
  const { rows: users } = await db.query<{ id: string; telegram_id: string }>(
    `SELECT id, telegram_id FROM users WHERE id = ANY($1::uuid[])`,
    [userIds],
  );
  const telegramByUser = new Map(users.map((user) => [user.id, Number(user.telegram_id)]));
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    telegramId: telegramByUser.get(row.user_id) ?? 0,
    attempts: row.delivery_attempts,
  }));
};

export const getMemberRemoval = async (
  id: string,
  db: Db = pool,
): Promise<MemberRemoval | null> => {
  const { rows } = await db.query<MemberRemovalRow>(
    `SELECT ${REMOVAL_COLUMNS} FROM member_removals WHERE id = $1`,
    [id],
  );
  return rows.length ? mapMemberRemoval(rows[0]) : null;
};

export const markMemberRemovalDone = async (id: string, db: Db = pool): Promise<void> => {
  await db.query(
    `UPDATE member_removals
        SET status = 'done', processed_at = now(), updated_at = now(), last_error = NULL
      WHERE id = $1`,
    [id],
  );
};

export const rescheduleMemberRemoval = async (
  id: string,
  input: { error: string; nextAttemptAt: Date },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE member_removals
        SET status = 'pending', claimed_at = NULL, last_error = $2, next_attempt_at = $3,
            updated_at = now()
      WHERE id = $1`,
    [id, input.error, input.nextAttemptAt],
  );
};

export const markMemberRemovalFailed = async (
  id: string,
  input: { error: string },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE member_removals
        SET status = 'failed', processed_at = now(), updated_at = now(), last_error = $2
      WHERE id = $1`,
    [id, input.error],
  );
};
