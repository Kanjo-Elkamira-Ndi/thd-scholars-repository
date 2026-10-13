import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { RosterEntry } from '@thd/shared';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { nextRosterPage, useInfiniteRoster, useRemoveMember, useUpdateRoster } from './use-roster';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    listRoster: vi.fn(),
    getRosterEntry: vi.fn(),
    getRosterAudit: vi.fn(),
    updateRoster: vi.fn(),
    removeMember: vi.fn(),
  };
});

const entry: RosterEntry = {
  id: 'r1',
  userId: 'u1',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  programTrack: 'Theology',
  supervisorName: null,
  status: 'active',
  accessReviewPending: false,
  accessReviewFlaggedAt: null,
  updatedBy: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('nextRosterPage', () => {
  it('advances while more rows remain', () => {
    expect(nextRosterPage({ items: [], total: 50, page: 1, pageSize: 20 })).toBe(2);
  });
  it('stops on the last page', () => {
    expect(nextRosterPage({ items: [], total: 50, page: 3, pageSize: 20 })).toBeUndefined();
    expect(nextRosterPage({ items: [], total: 0, page: 1, pageSize: 20 })).toBeUndefined();
  });
});

describe('useInfiniteRoster', () => {
  it('fetches the roster with the given filters', async () => {
    vi.mocked(api.listRoster).mockResolvedValue({ items: [entry], total: 1, page: 1, pageSize: 20 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useInfiniteRoster({ search: 'ada' }), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items).toEqual([entry]);
    expect(api.listRoster).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'ada', page: 1, pageSize: 20 }),
      expect.anything(),
    );
  });
});

describe('useUpdateRoster', () => {
  it('refreshes roster + dashboard on success', async () => {
    vi.mocked(api.updateRoster).mockResolvedValue({ ...entry, status: 'graduated' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateRoster(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ id: 'r1', patch: { status: 'graduated' } });

    expect(api.updateRoster).toHaveBeenCalledWith('r1', { status: 'graduated' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['roster'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard', 'stats'] });
  });
});

describe('useRemoveMember', () => {
  it('queues the removal and refreshes roster + dashboard', async () => {
    vi.mocked(api.removeMember).mockResolvedValue({
      removal: { id: 'm1' } as never,
      created: true,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveMember(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ userId: 'u1', reason: 'no longer active' });

    expect(api.removeMember).toHaveBeenCalledWith('u1', 'no longer active');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['roster'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard', 'stats'] });
  });
});
