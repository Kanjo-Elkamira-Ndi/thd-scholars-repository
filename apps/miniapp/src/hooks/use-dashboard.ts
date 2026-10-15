import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardPayload } from '@thd/shared';
import { getDashboard } from '@/lib/api';
import { dashboardKeys } from '@/lib/query-keys';

/** The role-aware dashboard payload for the signed-in user. */
export function useDashboard(): UseQueryResult<DashboardPayload> {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: ({ signal }) => getDashboard(signal),
  });
}
