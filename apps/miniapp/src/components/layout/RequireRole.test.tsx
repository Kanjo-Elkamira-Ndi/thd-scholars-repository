import type { Role, UserStatusResponse } from '@thd/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ApiError } from '@/lib/api';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { RequireRole } from './RequireRole';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getMe: vi.fn() };
});

const getMe = vi.mocked(api.getMe);

function me(role: Role): UserStatusResponse {
  return {
    user: {
      id: 'u1',
      telegramId: 1,
      telegramUsername: null,
      fullName: 'Test User',
      email: null,
      role,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    roster: null,
  };
}

beforeEach(() => {
  getMe.mockReset();
});

describe('RequireRole', () => {
  it('renders children when the role is allowed', async () => {
    getMe.mockResolvedValue(me('admin'));
    renderWithProviders(
      <RequireRole roles={['admin']}>
        <p>secret area</p>
      </RequireRole>,
    );
    expect(await screen.findByText('secret area')).toBeInTheDocument();
  });

  it('blocks a disallowed role', async () => {
    getMe.mockResolvedValue(me('scholar'));
    renderWithProviders(
      <RequireRole roles={['admin']}>
        <p>secret area</p>
      </RequireRole>,
    );
    expect(await screen.findByText(/not available for your role/i)).toBeInTheDocument();
    expect(screen.queryByText('secret area')).not.toBeInTheDocument();
  });

  it('prompts sign-in when the API returns 401', async () => {
    getMe.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'no init data'));
    renderWithProviders(
      <RequireRole roles={['admin']}>
        <p>secret area</p>
      </RequireRole>,
    );
    expect(await screen.findByText(/sign-in required/i)).toBeInTheDocument();
  });

  it('offers a retry on other errors', async () => {
    getMe.mockRejectedValue(new ApiError(500, 'SERVER_ERROR', 'boom'));
    renderWithProviders(
      <RequireRole roles={['admin']}>
        <p>secret area</p>
      </RequireRole>,
    );
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
