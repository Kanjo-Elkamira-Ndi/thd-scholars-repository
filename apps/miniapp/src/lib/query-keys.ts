import type { AuditLogQuery } from './api';

export const dashboardKeys = {
  all: ['dashboard'] as const,
};

export const adminKeys = {
  users: ['admin', 'users'] as const,
  auditLogsAll: ['admin', 'audit-logs'] as const,
  auditLogs: (query: AuditLogQuery) => ['admin', 'audit-logs', query] as const,
  members: ['admin', 'members'] as const,
  settings: ['admin', 'settings'] as const,
};
