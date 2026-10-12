import type {
  Notification,
  NotificationEvent,
  NotificationStatus,
  NotificationTask,
  Role,
} from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

interface NotificationRow {
  id: string;
  recipient_user_id: string;
  event: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  status: string;
  attempts: number;
  next_attempt_at: Date | null;
  claimed_at: Date | null;
  sent_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

const NOTIFICATION_COLUMNS = `id, recipient_user_id, event, payload, dedupe_key, status,
  attempts, next_attempt_at, claimed_at, sent_at, last_error, created_at`;

const mapNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  recipientUserId: row.recipient_user_id,
  event: row.event as NotificationEvent,
  payload: row.payload,
  dedupeKey: row.dedupe_key,
  status: row.status as NotificationStatus,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at ? row.next_attempt_at.toISOString() : null,
  claimedAt: row.claimed_at ? row.claimed_at.toISOString() : null,
  sentAt: row.sent_at ? row.sent_at.toISOString() : null,
  lastError: row.last_error,
  createdAt: row.created_at.toISOString(),
});

export const insertNotification = async (
  input: {
    recipientUserId: string;
    event: NotificationEvent;
    payload?: Record<string, unknown>;
    dedupeKey: string;
  },
  db: Db = pool,
): Promise<Notification | null> => {
  const { rows } = await db.query<NotificationRow>(
    `INSERT INTO notifications (recipient_user_id, event, payload, dedupe_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [input.recipientUserId, input.event, input.payload ?? {}, input.dedupeKey],
  );
  return rows.length ? mapNotification(rows[0]) : null;
};

export const findRecipientUserIds = async (roles: Role[], db: Db = pool): Promise<string[]> => {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE role = ANY($1::text[]) ORDER BY id`,
    [roles],
  );
  return rows.map((row) => row.id);
};

export const claimNotifications = async (
  input: { limit: number; leaseSeconds: number },
  db: Db = pool,
): Promise<NotificationTask[]> => {
  await db.query(
    `UPDATE notifications
        SET status = 'pending', claimed_at = NULL
      WHERE status = 'processing'
        AND claimed_at < now() - make_interval(secs => $1)`,
    [input.leaseSeconds],
  );

  const { rows } = await db.query<{
    id: string;
    recipient_user_id: string;
    event: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>(
    `UPDATE notifications n
        SET status = 'processing',
            claimed_at = now(),
            attempts = n.attempts + 1
      WHERE n.id IN (
        SELECT id FROM notifications
         WHERE status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1)
      RETURNING n.id, n.recipient_user_id, n.event, n.payload, n.attempts`,
    [input.limit],
  );

  if (rows.length === 0) return [];
  const userIds = rows.map((row) => row.recipient_user_id);
  const { rows: users } = await db.query<{ id: string; telegram_id: string; role: string }>(
    `SELECT id, telegram_id, role FROM users WHERE id = ANY($1::uuid[])`,
    [userIds],
  );
  const byId = new Map(users.map((user) => [user.id, user]));
  return rows.map((row) => {
    const user = byId.get(row.recipient_user_id);
    return {
      id: row.id,
      userId: row.recipient_user_id,
      telegramId: user ? Number(user.telegram_id) : 0,
      event: row.event as NotificationEvent,
      payload: row.payload,
      attempts: row.attempts,
      recipientRole: (user?.role ?? 'scholar') as Role,
    };
  });
};

export const getNotification = async (id: string, db: Db = pool): Promise<Notification | null> => {
  const { rows } = await db.query<NotificationRow>(
    `SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE id = $1`,
    [id],
  );
  return rows.length ? mapNotification(rows[0]) : null;
};

export const markNotificationSent = async (id: string, db: Db = pool): Promise<void> => {
  await db.query(
    `UPDATE notifications SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`,
    [id],
  );
};

export const rescheduleNotification = async (
  id: string,
  input: { error: string; nextAttemptAt: Date },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE notifications
        SET status = 'pending', claimed_at = NULL, last_error = $2, next_attempt_at = $3
      WHERE id = $1`,
    [id, input.error, input.nextAttemptAt],
  );
};

export const markNotificationFailed = async (
  id: string,
  input: { error: string },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE notifications SET status = 'failed', last_error = $2 WHERE id = $1`,
    [id, input.error],
  );
};
