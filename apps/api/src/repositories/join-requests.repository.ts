import type {
  JoinRequest,
  JoinRequestDeliveryStatus,
  JoinRequestDeliveryTask,
  JoinRequestStatus,
} from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

interface JoinRequestRow {
  id: string;
  user_id: string;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  reason: string | null;
  chat_id: string | null;
  telegram_user_id: string | null;
  join_requested_at: Date | null;
  delivery_status: string;
  delivery_attempts: number;
  next_attempt_at: Date | null;
  delivery_claimed_at: Date | null;
  delivered_at: Date | null;
  delivery_error: string | null;
  created_at: Date;
}

interface DeliveryTaskRow {
  id: string;
  status: string;
  reason: string | null;
  chat_id: string | null;
  telegram_user_id: string | null;
  delivery_attempts: number;
  telegram_id: string | null;
  full_name: string | null;
}

const JOIN_REQUEST_COLUMNS = `id, user_id, status, decided_by, decided_at, reason,
  chat_id, telegram_user_id, join_requested_at, delivery_status, delivery_attempts,
  next_attempt_at, delivery_claimed_at, delivered_at, delivery_error, created_at`;

const toNumberOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

const mapJoinRequestRow = (row: JoinRequestRow): JoinRequest => ({
  id: row.id,
  userId: row.user_id,
  status: row.status as JoinRequestStatus,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  reason: row.reason,
  chatId: toNumberOrNull(row.chat_id),
  telegramUserId: toNumberOrNull(row.telegram_user_id),
  joinRequestedAt: row.join_requested_at ? row.join_requested_at.toISOString() : null,
  deliveryStatus: row.delivery_status as JoinRequestDeliveryStatus,
  deliveryAttempts: row.delivery_attempts,
  nextAttemptAt: row.next_attempt_at ? row.next_attempt_at.toISOString() : null,
  deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : null,
  deliveryError: row.delivery_error,
  createdAt: row.created_at.toISOString(),
});

const mapDeliveryTaskRow = (row: DeliveryTaskRow): JoinRequestDeliveryTask => ({
  id: row.id,
  decision: row.status as 'approved' | 'declined',
  reason: row.reason,
  telegramId: Number(row.telegram_id ?? 0),
  telegramUserId: Number(row.telegram_user_id ?? 0),
  fullName: row.full_name ?? '',
  chatId: toNumberOrNull(row.chat_id),
  attempts: row.delivery_attempts,
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
     RETURNING ${JOIN_REQUEST_COLUMNS}`,
    [input.userId, input.status, input.decidedBy, input.reason],
  );
  return mapJoinRequestRow(rows[0]);
};

export const recordJoinRequest = async (
  input: {
    userId: string;
    chatId: number;
    telegramUserId: number;
    joinRequestedAt: string;
  },
  db: Db = pool,
): Promise<JoinRequest> => {
  const { rows } = await db.query<JoinRequestRow>(
    `INSERT INTO join_requests (user_id, status, chat_id, telegram_user_id, join_requested_at)
     VALUES ($1, 'pending', $2, $3, $4)
     ON CONFLICT (user_id) WHERE status = 'pending'
     DO UPDATE SET chat_id = EXCLUDED.chat_id,
                   telegram_user_id = EXCLUDED.telegram_user_id,
                   join_requested_at = EXCLUDED.join_requested_at
     RETURNING ${JOIN_REQUEST_COLUMNS}`,
    [input.userId, input.chatId, input.telegramUserId, input.joinRequestedAt],
  );
  return mapJoinRequestRow(rows[0]);
};

export const decideJoinRequest = async (
  input: {
    userId: string;
    decision: 'approved' | 'declined';
    reason: string | null;
  },
  db: Db = pool,
): Promise<JoinRequest> => {
  const updated = await db.query<JoinRequestRow>(
    `UPDATE join_requests
        SET status = $2, decided_at = now(), reason = $3,
            delivery_status = 'pending', delivery_attempts = 0,
            next_attempt_at = NULL, delivery_error = NULL, delivery_claimed_at = NULL
      WHERE user_id = $1 AND status = 'pending'
      RETURNING ${JOIN_REQUEST_COLUMNS}`,
    [input.userId, input.decision, input.reason],
  );
  if (updated.rows.length > 0) return mapJoinRequestRow(updated.rows[0]);

  const inserted = await db.query<JoinRequestRow>(
    `INSERT INTO join_requests (user_id, status, decided_by, decided_at, reason)
     VALUES ($1, $2, NULL, now(), $3)
     RETURNING ${JOIN_REQUEST_COLUMNS}`,
    [input.userId, input.decision, input.reason],
  );
  return mapJoinRequestRow(inserted.rows[0]);
};

export const claimJoinRequests = async (
  input: { limit: number; leaseSeconds: number },
  db: Db = pool,
): Promise<JoinRequestDeliveryTask[]> => {
  await db.query(
    `UPDATE join_requests
        SET delivery_status = 'pending', delivery_claimed_at = NULL
      WHERE delivery_status = 'processing'
        AND delivery_claimed_at < now() - make_interval(secs => $1)`,
    [input.leaseSeconds],
  );

  const { rows } = await db.query<DeliveryTaskRow>(
    `UPDATE join_requests j
        SET delivery_status = 'processing',
            delivery_claimed_at = now(),
            delivery_attempts = j.delivery_attempts + 1
      WHERE j.id IN (
        SELECT id FROM join_requests
         WHERE status <> 'pending'
           AND delivery_status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1)
      RETURNING j.id, j.status, j.reason, j.chat_id, j.telegram_user_id, j.delivery_attempts,
                (SELECT telegram_id FROM users u WHERE u.id = j.user_id) AS telegram_id,
                (SELECT full_name  FROM users u WHERE u.id = j.user_id) AS full_name`,
    [input.limit],
  );
  return rows.map(mapDeliveryTaskRow);
};

export const getJoinRequestById = async (
  id: string,
  db: Db = pool,
): Promise<JoinRequest | null> => {
  const { rows } = await db.query<JoinRequestRow>(
    `SELECT ${JOIN_REQUEST_COLUMNS} FROM join_requests WHERE id = $1`,
    [id],
  );
  return rows.length > 0 ? mapJoinRequestRow(rows[0]) : null;
};

export const markDelivered = async (id: string, db: Db = pool): Promise<void> => {
  await db.query(
    `UPDATE join_requests
        SET delivery_status = 'delivered', delivered_at = now(),
            delivery_error = NULL, delivery_claimed_at = NULL
      WHERE id = $1`,
    [id],
  );
};

export const insertInviteLink = async (
  input: { id: string; link: string; expiresAt: string },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `INSERT INTO invite_links (link, created_for_user_id, expires_at)
     SELECT $2, user_id, $3 FROM join_requests WHERE id = $1
     ON CONFLICT (link) DO NOTHING`,
    [input.id, input.link, input.expiresAt],
  );
};

export const reschedule = async (
  id: string,
  input: { error: string; nextAttemptAt: Date },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE join_requests
        SET delivery_status = 'pending', delivery_error = $2,
            delivery_claimed_at = NULL, next_attempt_at = $3
      WHERE id = $1`,
    [id, input.error, input.nextAttemptAt],
  );
};

export const markFailed = async (
  id: string,
  input: { error: string },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE join_requests
        SET delivery_status = 'failed', delivery_error = $2, delivery_claimed_at = NULL
      WHERE id = $1`,
    [id, input.error],
  );
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

export const countPendingSince = async (since: Date, db: Db = pool): Promise<number> => {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM join_requests
     WHERE status = 'pending' AND created_at >= $1`,
    [since],
  );
  return Number(rows[0].count);
};
