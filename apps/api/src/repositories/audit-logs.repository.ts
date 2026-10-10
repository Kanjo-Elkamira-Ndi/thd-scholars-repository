import type { AuditLog } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
}

export const insertAuditLog = async (
  input: {
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    details: Record<string, unknown> | null;
  },
  db: Db = pool,
): Promise<AuditLog> => {
  const { rows } = await db.query<AuditLogRow>(
    `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, actor_user_id, action, target_type, target_id, details, created_at`,
    [input.actorUserId, input.action, input.targetType, input.targetId, input.details],
  );
  const row = rows[0];
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details,
    createdAt: row.created_at.toISOString(),
  };
};
