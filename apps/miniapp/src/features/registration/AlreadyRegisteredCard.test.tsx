import type { RosterEntry } from '@thd/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AlreadyRegisteredCard } from './AlreadyRegisteredCard';

const roster: RosterEntry = {
  id: 'r1',
  userId: 'u1',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  programTrack: 'Theology',
  supervisorName: 'Dr. Bavinck',
  status: 'active',
  accessReviewPending: false,
  accessReviewFlaggedAt: null,
  updatedBy: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AlreadyRegisteredCard', () => {
  it('shows the record and reveals the form on request', async () => {
    const onUpdate = vi.fn();
    renderWithProviders(<AlreadyRegisteredCard roster={roster} onUpdate={onUpdate} />);
    expect(screen.getByText('DIBI-THD-0042')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /update my details/i }));
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});
