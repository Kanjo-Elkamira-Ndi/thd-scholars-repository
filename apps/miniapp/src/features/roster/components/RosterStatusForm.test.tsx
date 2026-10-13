import type { RosterEntry } from '@thd/shared';
import { updateRoster } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RosterStatusForm } from './RosterStatusForm';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, updateRoster: vi.fn() };
});

const baseEntry: RosterEntry = {
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

beforeEach(() => {
  vi.mocked(updateRoster).mockReset();
});

describe('RosterStatusForm', () => {
  it('confirms before flagging a scholar and only then updates', async () => {
    vi.mocked(updateRoster).mockResolvedValue({ ...baseEntry, status: 'graduated' });
    const user = userEvent.setup();

    renderWithProviders(<RosterStatusForm entry={baseEntry} />);

    await user.selectOptions(screen.getByLabelText('Status'), 'graduated');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateRoster).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/stay in the channel until an admin or the flagging registrar/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Flag for review' }));

    expect(updateRoster).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ status: 'graduated', cohortYear: 2024 }),
    );
  });

  it('explains that re-activating cancels a pending removal', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <RosterStatusForm
        entry={{ ...baseEntry, status: 'graduated', accessReviewPending: true }}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Status'), 'active');

    expect(
      screen.getByText(/cancels any pending removal and keeps the scholar in the channel/i),
    ).toBeInTheDocument();
  });
});
