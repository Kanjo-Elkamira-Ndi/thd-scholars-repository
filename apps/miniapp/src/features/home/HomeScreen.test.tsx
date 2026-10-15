import type { RegistrarDashboard, ScholarDashboard, UserStatusResponse } from '@thd/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { HomeScreen } from './HomeScreen';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getMe: vi.fn(), getDashboard: vi.fn() };
});

const getMe = vi.mocked(api.getMe);
const getDashboard = vi.mocked(api.getDashboard);

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

const registrarDashboard: RegistrarDashboard = {
  role: 'registrar',
  totalScholars: 42,
  pendingAccessReviews: 3,
  myPendingAccessReviews: 1,
  rosterAuditIssues: 5,
};

beforeEach(() => {
  getMe.mockReset();
  getDashboard.mockReset();
});

describe('HomeScreen', () => {
  it('renders identity, role actions and the role dashboard', async () => {
    getMe.mockResolvedValue(response);
    getDashboard.mockResolvedValue(registrarDashboard);
    renderWithProviders(<HomeScreen />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
    expect(await screen.findByText('Active scholars')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /requests/i })).toBeInTheDocument();
  });

  it('guides a scholar whose registration is not linked yet', async () => {
    getMe.mockResolvedValue({
      ...response,
      user: { ...response.user, role: 'scholar' },
    });
    getDashboard.mockResolvedValue({
      role: 'scholar',
      roster: null,
      recentContent: [],
    } satisfies ScholarDashboard);
    renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(/not linked yet/i)).toBeInTheDocument();
  });

  it('shows a retryable error when identity fails to load', async () => {
    getMe.mockRejectedValue(new api.ApiError(500, 'SERVER_ERROR', 'boom'));
    getDashboard.mockResolvedValue(registrarDashboard);
    renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
