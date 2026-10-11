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

const AUDIT_LOG_COLUMNS = `id, actor_user_id, action, target_type, target_id, details, created_at`;

const mapAuditLogRow = (row: AuditLogRow): AuditLog => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  action: row.action,
  targetType: row.target_type,
  targetId: row.target_id,
  details: row.details,
  createdAt: row.created_at.toISOString(),
});

export interface ListAuditLogsParams {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  page: number;
  pageSize: number;
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

export const listAuditLogs = async (
  params: ListAuditLogsParams,
  db: Db = pool,
): Promise<{ logs: AuditLog[]; total: number }> => {
  const conditions: string[] = [];
  const filterValues: unknown[] = [];
  if (params.action) {
    filterValues.push(params.action);
    conditions.push(`action = $${filterValues.length}`);
  }
  if (params.actorUserId) {
    filterValues.push(params.actorUserId);
    conditions.push(`actor_user_id = $${filterValues.length}`);
  }
  if (params.targetType) {
    filterValues.push(params.targetType);
    conditions.push(`target_type = $${filterValues.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM audit_logs ${where}`,
    filterValues,
  );
  const total = Number(countRows[0].total);

  const offset = (params.page - 1) * params.pageSize;
  const { rows } = await db.query<AuditLogRow>(
    `SELECT ${AUDIT_LOG_COLUMNS} FROM audit_logs ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`,
    [...filterValues, params.pageSize, offset],
  );

  return { logs: rows.map(mapAuditLogRow), total };
};
