import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { useDashboard } from './use-dashboard';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getDashboard: vi.fn() };
});

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDashboard', () => {
  it('loads the role-aware payload', async () => {
    const payload = { role: 'scholar', roster: null, recentContent: [] } as never;
    vi.mocked(api.getDashboard).mockResolvedValue(payload);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(api.getDashboard).toHaveBeenCalled();
  });
});
