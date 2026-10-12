import type { UserStatusResponse } from '@thd/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { HomeScreen } from './HomeScreen';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getMe: vi.fn() };
});

const getMe = vi.mocked(api.getMe);

const response: UserStatusResponse = {
  user: {
    id: 'u1',
    telegramId: 1,
    telegramUsername: 'ada',
    fullName: 'Ada Lovelace',
    email: null,
    role: 'registrar',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  roster: {
    id: 'r1',
    userId: 'u1',
    registrationId: 'reg-1',
    cohortYear: 2024,
    programTrack: 'Systematic Theology',
    supervisorName: 'Dr. Bavinck',
    status: 'active',
    accessReviewPending: false,
    accessReviewFlaggedAt: null,
    updatedBy: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

beforeEach(() => {
  getMe.mockReset();
});

describe('HomeScreen', () => {
  it('renders identity, roster standing and role actions', async () => {
    getMe.mockResolvedValue(response);
    renderWithProviders(<HomeScreen />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /requests/i })).toBeInTheDocument();
  });

  it('guides the user when no roster record exists', async () => {
    getMe.mockResolvedValue({ ...response, roster: null });
    renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(/no roster record yet/i)).toBeInTheDocument();
  });

  it('shows a retryable error when identity fails to load', async () => {
    getMe.mockRejectedValue(new api.ApiError(500, 'SERVER_ERROR', 'boom'));
    renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
