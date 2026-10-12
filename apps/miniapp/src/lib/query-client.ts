import { QueryClient } from '@tanstack/react-query';

/**
 * One client per app (or per test). Identity is stable for a session, so we
 * cache aggressively, retry once, and never refetch just because the phone
 * regains focus.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
