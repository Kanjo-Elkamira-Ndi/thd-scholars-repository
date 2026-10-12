import type { UserStatusResponse } from '@thd/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getMe } from '@/lib/api';

export const meQueryKey = ['me'] as const;

/** Identity + roster status. The single source for role gating across the app. */
export function useMe(): UseQueryResult<UserStatusResponse> {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => getMe(signal),
  });
}
