import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { MemberSummary, Role, SystemSettings, User } from '@thd/shared';
import {
  getSettings,
  listAuditLogs,
  listMembers,
  listUsers,
  updateSettings,
  updateUserRole,
  type AuditLogPage,
  type AuditLogQuery,
} from '@/lib/api';
import { adminKeys, dashboardKeys } from '@/lib/query-keys';

/** Every user account (admin only). */
export function useUsers(): UseQueryResult<User[]> {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: ({ signal }) => listUsers(signal),
  });
}

/** A filtered page of audit logs. */
export function useAuditLogs(query: AuditLogQuery = {}): UseQueryResult<AuditLogPage> {
  return useQuery({
    queryKey: adminKeys.auditLogs(query),
    queryFn: ({ signal }) => listAuditLogs(query, signal),
  });
}

/** Roster-backed member directory. */
export function useMembers(): UseQueryResult<MemberSummary[]> {
  return useQuery({
    queryKey: adminKeys.members,
    queryFn: ({ signal }) => listMembers(signal),
  });
}

/** System settings. */
export function useSettings(): UseQueryResult<SystemSettings> {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: ({ signal }) => getSettings(signal),
  });
}

/** Change a role, then refresh users, members and the dashboard. */
export function useUpdateUserRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => updateUserRole(id, role),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: adminKeys.users }),
        client.invalidateQueries({ queryKey: adminKeys.members }),
        client.invalidateQueries({ queryKey: dashboardKeys.all }),
      ]),
  });
}

/** Patch settings, then refresh the settings panel and the dashboard. */
export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SystemSettings>) => updateSettings(patch),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: adminKeys.settings }),
        client.invalidateQueries({ queryKey: dashboardKeys.all }),
      ]),
  });
}
