import type { AuditLog, AuditLogQuery } from '@thd/shared';
import * as auditRepo from '../repositories/audit-logs.repository';

export const listAuditLogs = async (
  query: AuditLogQuery,
): Promise<{ logs: AuditLog[]; page: number; pageSize: number; total: number }> => {
  const { logs, total } = await auditRepo.listAuditLogs({
    action: query.action,
    actorUserId: query.actorUserId,
    targetType: query.targetType,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { logs, page: query.page, pageSize: query.pageSize, total };
};
