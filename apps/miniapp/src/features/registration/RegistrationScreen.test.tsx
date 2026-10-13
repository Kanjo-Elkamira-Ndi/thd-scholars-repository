import type { UserStatusResponse } from '@thd/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { RegistrationScreen } from './RegistrationScreen';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getMe: vi.fn(), postRegistration: vi.fn() };
});

const getMe = vi.mocked(api.getMe);

const base: UserStatusResponse = {
  user: {
    id: 'u1',
    telegramId: 1,
    telegramUsername: 'ada',
    fullName: 'Ada Lovelace',
    email: null,
    role: 'scholar',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  roster: null,
};

beforeEach(() => getMe.mockReset());

describe('RegistrationScreen', () => {
  it('shows the form for an unregistered scholar', async () => {
    getMe.mockResolvedValue(base);
    renderWithProviders(<RegistrationScreen />);
    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
  });

  it('shows the already-registered card for an active scholar', async () => {
    getMe.mockResolvedValue({
      ...base,
      roster: {
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
      },
    });
    renderWithProviders(<RegistrationScreen />);
    expect(await screen.findByText(/you're registered/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/cohort year/i)).not.toBeInTheDocument();
  });
});
