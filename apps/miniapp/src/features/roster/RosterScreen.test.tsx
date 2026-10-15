import type { RosterEntry, UserStatusResponse } from '@thd/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { getMe, getRosterEntry, listRoster } from '@/lib/api';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RosterScreen from './RosterScreen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    listRoster: vi.fn(),
    getRosterEntry: vi.fn(),
    getMe: vi.fn(),
  };
});

const entry: RosterEntry = {
  id: 'r1',
  userId: 'u1',
  registrationId: 'THD-2024-001',
  cohortYear: 2024,
  programTrack: 'Systematic Theology',
  supervisorName: 'Dr. Bavinck',
  status: 'active',
  accessReviewPending: false,
  accessReviewFlaggedAt: null,
  updatedBy: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const registrar = {
  user: {
    id: 'reg-1',
    telegramId: 1,
    fullName: 'Registrar',
    telegramUsername: null,
    role: 'registrar',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  roster: null,
} as UserStatusResponse;

beforeEach(() => {
  vi.mocked(listRoster).mockReset();
  vi.mocked(getRosterEntry).mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(listRoster).mockResolvedValue({ items: [entry], total: 1, page: 1, pageSize: 20 });
  vi.mocked(getMe).mockResolvedValue(registrar);
});

describe('RosterScreen', () => {
  it('renders the three roster segments', async () => {
    renderWithProviders(<RosterScreen />);

    expect(await screen.findByRole('tab', { name: 'Scholars' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Access review' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Audit' })).toBeInTheDocument();
  });

  it('opens the scholar detail sheet from a card', async () => {
    vi.mocked(getRosterEntry).mockResolvedValue(entry);
    const user = userEvent.setup();

    renderWithProviders(<RosterScreen />);

    await user.click((await screen.findByText('THD-2024-001')).closest('button') as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Cohort 2024/)).toBeInTheDocument();
    expect(getRosterEntry).toHaveBeenCalledWith('r1', expect.anything());
  });

  it('preselects the access-review tab from ?tab=', async () => {
    const client = createTestQueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/roster?tab=access-review']}>
          <Routes>
            <Route path="/roster" element={<RosterScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const tab = await screen.findByRole('tab', { name: 'Access review' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});
