import type { AuditLog } from '@thd/shared';
import { listAuditLogs } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAuditScreen from './AdminAuditScreen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, listAuditLogs: vi.fn() };
});

function log(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    actorUserId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    action: 'update_roster_status',
    targetType: 'roster',
    targetId: 'r1',
    details: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(logs: AuditLog[], total = logs.length) {
  return { logs, total, page: 1, pageSize: 20 };
}

beforeEach(() => {
  vi.mocked(listAuditLogs).mockReset();
  vi.mocked(listAuditLogs).mockResolvedValue(page([log()]));
});

describe('AdminAuditScreen', () => {
  it('renders an entry with a humanised action, actor and time', async () => {
    renderWithProviders(<AdminAuditScreen />);

    expect(await screen.findByText('Roster status changed')).toBeInTheDocument();
    expect(screen.getByText(/aaaaaaaa · Roster/)).toBeInTheDocument();
  });

  it('advances to the next page', async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({
      ...page([], 40),
      logs: [log({ id: 'log-2', action: 'content_created', targetType: 'content_posts' })],
    });
    const user = userEvent.setup();

    renderWithProviders(<AdminAuditScreen />);

    await screen.findByText('Content created');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const last = vi.mocked(listAuditLogs).mock.calls.at(-1)?.[0];
    expect(last).toEqual(expect.objectContaining({ page: 2, pageSize: 20 }));
  });

  it('filters by target type and resets to the first page', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AdminAuditScreen />);
    await screen.findByText('Roster status changed');

    await user.selectOptions(screen.getByLabelText('Filter by target type'), 'content_posts');

    const last = vi.mocked(listAuditLogs).mock.calls.at(-1)?.[0];
    expect(last).toEqual(
      expect.objectContaining({ page: 1, targetType: 'content_posts' }),
    );
  });
});
