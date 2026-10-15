import type { MemberSummary, UserStatusResponse } from '@thd/shared';
import { getMe, getRosterAudit, listMembers, removeMember } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminMembersScreen from './AdminMembersScreen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    listMembers: vi.fn(),
    getRosterAudit: vi.fn(),
    removeMember: vi.fn(),
    getMe: vi.fn(),
  };
});

function member(
  id: string,
  fullName: string,
  roster: MemberSummary['roster'],
  membership: MemberSummary['membership'],
): MemberSummary {
  return {
    user: { id, telegramId: 1, fullName, role: 'scholar' },
    roster,
    membership,
  };
}

function me(id: string, role: UserStatusResponse['user']['role']): UserStatusResponse {
  return {
    user: {
      id,
      telegramId: 1,
      fullName: 'Staff',
      telegramUsername: null,
      email: null,
      role,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    roster: null,
  } as UserStatusResponse;
}

const activeRoster: MemberSummary['roster'] = {
  registrationId: 'THD-1',
  status: 'active',
  cohortYear: 2024,
};
const inChannel: MemberSummary['membership'] = {
  isMember: true,
  memberStatus: 'member',
  checkedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(listMembers).mockReset();
  vi.mocked(getRosterAudit).mockReset();
  vi.mocked(removeMember).mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(listMembers).mockResolvedValue([
    member('u1', 'Alice Scholar', activeRoster, inChannel),
    member('a1', 'Staff', activeRoster, inChannel),
  ]);
  vi.mocked(getRosterAudit).mockResolvedValue([]);
  vi.mocked(getMe).mockResolvedValue(me('a1', 'admin'));
});

describe('AdminMembersScreen', () => {
  it('lists members with roster status and channel membership', async () => {
    renderWithProviders(<AdminMembersScreen />);

    const card = (await screen.findByText('Alice Scholar')).closest('li') as HTMLElement;
    expect(within(card).getByText(/THD-1/)).toBeInTheDocument();
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText('In channel')).toBeInTheDocument();
  });

  it('queues a removal and shows the inline result', async () => {
    vi.mocked(removeMember).mockResolvedValue({ removal: { id: 'm1' } as never, created: true });
    const user = userEvent.setup();

    renderWithProviders(<AdminMembersScreen />);

    const card = (await screen.findByText('Alice Scholar')).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Remove from channel' }));

    expect(await screen.findByText(/the bot will remove them/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Queue removal' }));

    expect(removeMember).toHaveBeenCalledWith('u1', undefined);
    expect(await within(card).findByText('Removal queued')).toBeInTheDocument();
  });

  it('blocks removing yourself', async () => {
    renderWithProviders(<AdminMembersScreen />);

    const card = (await screen.findByText('Staff')).closest('li') as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Remove from channel' })).toBeDisabled();
    expect(within(card).getByText(/cannot remove yourself/i)).toBeInTheDocument();
  });
});
