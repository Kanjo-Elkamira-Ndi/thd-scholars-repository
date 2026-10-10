import type { JoinRequest, JoinRequestStatus } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

interface JoinRequestRow {
  id: string;
  user_id: string;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  reason: string | null;
  created_at: Date;
}

const mapJoinRequestRow = (row: JoinRequestRow): JoinRequest => ({
  id: row.id,
  userId: row.user_id,
  status: row.status as JoinRequestStatus,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  reason: row.reason,
  createdAt: row.created_at.toISOString(),
});

export const insertJoinRequest = async (
  input: {
    userId: string;
    status: JoinRequestStatus;
    decidedBy: string | null;
    reason: string | null;
  },
  db: Db = pool,
): Promise<JoinRequest> => {
  const { rows } = await db.query<JoinRequestRow>(
    `INSERT INTO join_requests (user_id, status, decided_by, decided_at, reason)
     VALUES ($1, $2, $3, CASE WHEN $2 = 'pending' THEN NULL ELSE now() END, $4)
     RETURNING id, user_id, status, decided_by, decided_at, reason, created_at`,
    [input.userId, input.status, input.decidedBy, input.reason],
  );
  return mapJoinRequestRow(rows[0]);
};

export const countRecentDeclines = async (
  userId: string,
  since: Date,
  db: Db = pool,
): Promise<number> => {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM join_requests
     WHERE user_id = $1 AND status = 'declined' AND created_at >= $2`,
    [userId, since],
  );
  return Number(rows[0].count);
};
