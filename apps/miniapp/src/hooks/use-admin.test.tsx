import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { AuditLog, MemberSummary, SystemSettings, User } from '@thd/shared';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import {
  useAuditLogs,
  useMembers,
  useSettings,
  useUpdateSettings,
  useUpdateUserRole,
  useUsers,
} from './use-admin';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    listUsers: vi.fn(),
    updateUserRole: vi.fn(),
    listAuditLogs: vi.fn(),
    listMembers: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  };
});

const user: User = {
  id: 'u1',
  telegramId: 100,
  telegramUsername: 'ada',
  fullName: 'Ada Lovelace',
  email: null,
  role: 'scholar',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const member: MemberSummary = {
  user: { id: 'u1', telegramId: 100, fullName: 'Ada Lovelace', role: 'scholar' },
  roster: null,
  membership: null,
};

const log: AuditLog = {
  id: 'a1',
  actorUserId: 'u1',
  action: 'update_settings',
  targetType: 'settings',
  targetId: null,
  details: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const settings: SystemSettings = {
  registrationIdPattern: 'DIBI-THD-####',
  availableCohortYears: [2026],
  inviteLinkExpirySeconds: 3600,
  maxUploadSizeBytes: 1024,
  maxContentUploadBytes: 2048,
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('admin queries', () => {
  it('useUsers loads the user list', async () => {
    vi.mocked(api.listUsers).mockResolvedValue([user]);
    const { result } = renderHook(() => useUsers(), { wrapper: makeWrapper(makeClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([user]);
  });

  it('useAuditLogs passes the query and loads the page', async () => {
    vi.mocked(api.listAuditLogs).mockResolvedValue({ logs: [log], total: 1, page: 2, pageSize: 50 });
    const { result } = renderHook(() => useAuditLogs({ action: 'update_settings', page: 2 }), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.listAuditLogs).toHaveBeenCalledWith(
      { action: 'update_settings', page: 2 },
      expect.anything(),
    );
    expect(result.current.data?.logs).toEqual([log]);
  });

  it('useMembers loads the roster-backed directory', async () => {
    vi.mocked(api.listMembers).mockResolvedValue([member]);
    const { result } = renderHook(() => useMembers(), { wrapper: makeWrapper(makeClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([member]);
  });

  it('useSettings loads the settings object', async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper(makeClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(settings);
  });
});

describe('admin mutations', () => {
  it('useUpdateUserRole refreshes users, members and the dashboard', async () => {
    vi.mocked(api.updateUserRole).mockResolvedValue({ ...user, role: 'faculty' });
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateUserRole(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ id: 'u1', role: 'faculty' });

    expect(api.updateUserRole).toHaveBeenCalledWith('u1', 'faculty');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'members'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('useUpdateSettings refreshes settings and the dashboard', async () => {
    vi.mocked(api.updateSettings).mockResolvedValue(settings);
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateSettings(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ maxContentUploadBytes: 4096 });

    expect(api.updateSettings).toHaveBeenCalledWith({ maxContentUploadBytes: 4096 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'settings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });
});
