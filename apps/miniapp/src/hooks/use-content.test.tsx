import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ContentPost } from '@thd/shared';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import {
  hasActiveDelivery,
  nextContentPage,
  useDeleteContent,
  useInfiniteContent,
  useUpdateContent,
} from './use-content';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    listContent: vi.fn(),
    getContentPost: vi.fn(),
    createContent: vi.fn(),
    updateContent: vi.fn(),
    deleteContent: vi.fn(),
  };
});

function post(overrides: Partial<ContentPost> = {}): ContentPost {
  return {
    id: 'c1',
    title: 'Hermeneutics 101',
    disciplineTag: 'Hermeneutics',
    formatTag: 'audio_lecture',
    cohortTag: 2025,
    postedBy: 'u1',
    telegramMessageId: null,
    driveLink: null,
    fileSizeBytes: null,
    pendingAction: 'publish',
    deliveryStatus: 'pending',
    deliveryAttempts: 0,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('nextContentPage', () => {
  it('advances while more rows remain and stops at the end', () => {
    expect(nextContentPage({ items: [], total: 30, page: 1, pageSize: 20 })).toBe(2);
    expect(nextContentPage({ items: [], total: 30, page: 2, pageSize: 20 })).toBeUndefined();
  });
});

describe('hasActiveDelivery', () => {
  it('is true while any post is still delivering', () => {
    expect(hasActiveDelivery([{ items: [post()], total: 1, page: 1, pageSize: 20 }])).toBe(true);
    expect(
      hasActiveDelivery([
        { items: [post({ deliveryStatus: 'posted' })], total: 1, page: 1, pageSize: 20 },
      ]),
    ).toBe(false);
    expect(hasActiveDelivery(undefined)).toBe(false);
  });
});

describe('useInfiniteContent', () => {
  it('fetches content with the given filters', async () => {
    vi.mocked(api.listContent).mockResolvedValue({ items: [post()], total: 1, page: 1, pageSize: 20 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useInfiniteContent({ search: 'hermeneutics' }), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items).toEqual([post()]);
    expect(api.listContent).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'hermeneutics', page: 1, pageSize: 20 }),
      expect.anything(),
    );
  });
});

describe('useUpdateContent', () => {
  it('caches the updated post and refreshes content + stats', async () => {
    vi.mocked(api.updateContent).mockResolvedValue(post({ title: 'Renamed' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateContent(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ id: 'c1', patch: { title: 'Renamed' } });

    expect(api.updateContent).toHaveBeenCalledWith('c1', { title: 'Renamed' });
    expect(client.getQueryData(['content', 'detail', 'c1'])).toEqual(post({ title: 'Renamed' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['content'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });
});

describe('useDeleteContent', () => {
  it('drops the detail cache and refreshes content + stats', async () => {
    vi.mocked(api.deleteContent).mockResolvedValue({ hardDeleted: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const remove = vi.spyOn(client, 'removeQueries');

    const { result } = renderHook(() => useDeleteContent(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync('c1');

    expect(api.deleteContent).toHaveBeenCalledWith('c1');
    expect(remove).toHaveBeenCalledWith({ queryKey: ['content', 'detail', 'c1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['content'] });
  });
});
