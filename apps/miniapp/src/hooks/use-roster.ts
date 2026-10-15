import type { RosterAuditEntry, RosterEntry, RosterUpdateInput } from '@thd/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  getRosterAudit,
  getRosterEntry,
  listRoster,
  removeMember,
  updateRoster,
  type Paginated,
  type RosterListQuery,
} from '@/lib/api';
import { adminKeys, dashboardKeys } from '@/lib/query-keys';

export const ROOT_KEY = 'roster' as const;

export const rosterKeys = {
  all: [ROOT_KEY] as const,
  list: (query: RosterListQuery) => [ROOT_KEY, 'list', query] as const,
  detail: (id: string) => [ROOT_KEY, 'detail', id] as const,
  audit: [ROOT_KEY, 'audit'] as const,
};

export function nextRosterPage(lastPage: Paginated<RosterEntry>): number | undefined {
  return lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined;
}

/** Invalidate every roster view plus the dashboard. */
export function invalidateRosterData(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: rosterKeys.all }),
    client.invalidateQueries({ queryKey: dashboardKeys.all }),
  ]);
}

/** Infinite, filterable roster list. */
export function useInfiniteRoster(
  query: RosterListQuery = {},
  pageSize = 20,
): UseInfiniteQueryResult<{ pages: Paginated<RosterEntry>[]; pageParams: unknown[] }> {
  return useInfiniteQuery({
    queryKey: rosterKeys.list(query),
    queryFn: ({ pageParam, signal }) =>
      listRoster({ ...query, page: pageParam as number, pageSize }, signal),
    initialPageParam: 1,
    getNextPageParam: nextRosterPage,
  });
}

/** A single roster entry by id. */
export function useRosterEntry(id: string | undefined): UseQueryResult<RosterEntry> {
  return useQuery({
    queryKey: rosterKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getRosterEntry(id as string, signal),
    enabled: Boolean(id),
  });
}

/** Roster/membership inconsistencies for the audit segment. */
export function useRosterAudit(): UseQueryResult<RosterAuditEntry[]> {
  return useQuery({
    queryKey: rosterKeys.audit,
    queryFn: ({ signal }) => getRosterAudit(signal),
  });
}

/** Update a roster entry, then refresh every roster view and the dashboard. */
export function useUpdateRoster() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RosterUpdateInput }) =>
      updateRoster(id, patch),
    onSuccess: (entry) => {
      client.setQueryData(rosterKeys.detail(entry.id), entry);
      return invalidateRosterData(client);
    },
  });
}

/** Queue a member removal (the bot delivers it), then refresh roster, admin views and the dashboard. */
export function useRemoveMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      removeMember(userId, reason),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: rosterKeys.all }),
        client.invalidateQueries({ queryKey: adminKeys.members }),
        client.invalidateQueries({ queryKey: adminKeys.auditLogsAll }),
        client.invalidateQueries({ queryKey: dashboardKeys.all }),
      ]),
  });
}
