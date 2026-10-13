import type { RosterAuditEntry } from '@thd/shared';
import { getRosterAudit } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditList } from './AuditList';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, getRosterAudit: vi.fn() };
});

const issues: RosterAuditEntry[] = [
  {
    roster: { id: 'r1', userId: 'u1', registrationId: 'THD-1', status: 'active', cohortYear: 2024 },
    membership: { isMember: false, memberStatus: 'left', checkedAt: '2026-01-02T00:00:00.000Z' },
    issue: 'active_not_member',
  },
];

beforeEach(() => {
  vi.mocked(getRosterAudit).mockReset();
});

describe('AuditList', () => {
  it('renders the mismatches returned by the audit', async () => {
    vi.mocked(getRosterAudit).mockResolvedValue(issues);

    renderWithProviders(<AuditList />);

    expect(await screen.findByText('THD-1')).toBeInTheDocument();
    expect(screen.getByText(/active but not in channel/i)).toBeInTheDocument();
    expect(screen.getByText('Not in channel')).toBeInTheDocument();
  });

  it('shows the empty state when there are no issues', async () => {
    vi.mocked(getRosterAudit).mockResolvedValue([]);

    renderWithProviders(<AuditList />);

    expect(await screen.findByText(/no mismatches right now/i)).toBeInTheDocument();
  });
});
