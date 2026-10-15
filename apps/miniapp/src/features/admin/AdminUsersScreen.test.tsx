import type { User, UserStatusResponse } from '@thd/shared';
import { getMe, listUsers } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersScreen from './AdminUsersScreen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, listUsers: vi.fn(), getMe: vi.fn() };
});

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    telegramId: 111,
    fullName: 'Alice Scholar',
    telegramUsername: 'alice',
    email: null,
    role: 'scholar',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function me(id: string, role: User['role']): UserStatusResponse {
  return { user: user({ id, role }), roster: null };
}

beforeEach(() => {
  vi.mocked(listUsers).mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(listUsers).mockResolvedValue([
    user(),
    user({ id: 'a1', fullName: 'Admin One', telegramUsername: 'adminone', role: 'admin' }),
  ]);
  vi.mocked(getMe).mockResolvedValue(me('a1', 'admin'));
});

describe('AdminUsersScreen', () => {
  it('lists accounts with usernames and roles', async () => {
    renderWithProviders(<AdminUsersScreen />);

    expect(await screen.findByText('Alice Scholar')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Role for Alice Scholar' })).toBeInTheDocument();
  });

  it('blocks changing your own role', async () => {
    renderWithProviders(<AdminUsersScreen />);

    const card = (await screen.findByText('Admin One')).closest('li') as HTMLElement;
    expect(within(card).getByRole('combobox', { name: 'Role for Admin One' })).toBeDisabled();
    expect(within(card).getByText(/cannot change your own role/i)).toBeInTheDocument();
  });
});
