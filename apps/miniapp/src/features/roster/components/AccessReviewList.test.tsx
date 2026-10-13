import type { RosterEntry, UserStatusResponse } from '@thd/shared';
import { getMe, listRoster, removeMember, ApiError } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessReviewList } from './AccessReviewList';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    listRoster: vi.fn(),
    removeMember: vi.fn(),
    getMe: vi.fn(),
  };
});

function flagged(id: string, updatedBy: string | null, registrationId: string): RosterEntry {
  return {
    id,
    userId: `user-${id}`,
    registrationId,
    cohortYear: 2020,
    programTrack: 'Systematic Theology',
    supervisorName: null,
    status: 'graduated',
    accessReviewPending: true,
    accessReviewFlaggedAt: '2026-01-02T00:00:00.000Z',
    updatedBy,
    updatedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2020-01-01T00:00:00.000Z',
  };
}

function me(id: string, role: UserStatusResponse['user']['role']): UserStatusResponse {
  return {
    user: {
      id,
      telegramId: 1,
      fullName: 'Staff',
      telegramUsername: null,
      role,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    roster: null,
  } as UserStatusResponse;
}

const entries = [flagged('e1', 'reg-1', 'THD-1'), flagged('e2', 'reg-2', 'THD-2')];

function primeList() {
  vi.mocked(listRoster).mockResolvedValue({
    items: entries,
    total: entries.length,
    page: 1,
    pageSize: 20,
  });
}

beforeEach(() => {
  vi.mocked(listRoster).mockReset();
  vi.mocked(removeMember).mockReset();
  vi.mocked(getMe).mockReset();
});

describe('AccessReviewList', () => {
  it('disables removal for a registrar who did not flag the scholar', async () => {
    primeList();
    vi.mocked(getMe).mockResolvedValue(me('reg-2', 'registrar'));

    renderWithProviders(<AccessReviewList />);

    const ownCard = (await screen.findByText('THD-2')).closest('li') as HTMLElement;
    const otherCard = screen.getByText('THD-1').closest('li') as HTMLElement;

    expect(within(ownCard).getByRole('button', { name: 'Confirm removal' })).toBeEnabled();
    expect(within(otherCard).getByRole('button', { name: 'Confirm removal' })).toBeDisabled();
    expect(
      within(otherCard).getByText(/only the registrar who flagged this scholar/i),
    ).toBeInTheDocument();
  });

  it('enables removal for an admin on every flagged scholar', async () => {
    primeList();
    vi.mocked(getMe).mockResolvedValue(me('admin-1', 'admin'));

    renderWithProviders(<AccessReviewList />);

    const buttons = await screen.findAllByRole('button', { name: 'Confirm removal' });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => expect(button).toBeEnabled());
  });

  it('queues a removal and shows the inline result', async () => {
    primeList();
    vi.mocked(getMe).mockResolvedValue(me('admin-1', 'admin'));
    vi.mocked(removeMember).mockResolvedValue({ removal: { id: 'm1' } as never, created: true });
    const user = userEvent.setup();

    renderWithProviders(<AccessReviewList />);

    const buttons = await screen.findAllByRole('button', { name: 'Confirm removal' });
    await user.click(buttons[0] as HTMLElement);

    expect(await screen.findByText(/the bot will remove them on its next run/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Queue removal' }));

    expect(removeMember).toHaveBeenCalledWith('user-e1', undefined);
    expect(await screen.findByText('Removal queued')).toBeInTheDocument();
  });

  it('shows a friendly message when removal is forbidden', async () => {
    primeList();
    vi.mocked(getMe).mockResolvedValue(me('admin-1', 'admin'));
    vi.mocked(removeMember).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'nope'));
    const user = userEvent.setup();

    renderWithProviders(<AccessReviewList />);

    const buttons = await screen.findAllByRole('button', { name: 'Confirm removal' });
    await user.click(buttons[0] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Queue removal' }));

    expect(
      await screen.findByText(/you do not have permission to remove this member/i),
    ).toBeInTheDocument();
  });
});
