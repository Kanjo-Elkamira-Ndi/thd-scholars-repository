import type {
  AdminDashboard,
  ContentPost,
  DashboardPayload,
  FacultyDashboard,
  RegistrarDashboard,
  RosterEntry,
  ScholarDashboard,
} from '@thd/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { DashboardScreen } from './DashboardScreen';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getDashboard: vi.fn() };
});

const getDashboard = vi.mocked(api.getDashboard);

function post(overrides: Partial<ContentPost> = {}): ContentPost {
  return {
    id: 'c1',
    title: 'Hermeneutics 101',
    disciplineTag: 'Hermeneutics',
    formatTag: 'audio_lecture',
    cohortTag: 2025,
    postedBy: 'u1',
    telegramMessageId: null,
    driveLink: null,
    fileSizeBytes: null,
    pendingAction: 'publish',
    deliveryStatus: 'posted',
    deliveryAttempts: 1,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function roster(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
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
    ...overrides,
  };
}

const scholarActive: ScholarDashboard = {
  role: 'scholar',
  roster: roster(),
  recentContent: [post()],
};

const faculty: FacultyDashboard = {
  role: 'faculty',
  myContentCount: 7,
  failedDeliveries: 2,
  recentContent: [post()],
};

const registrar: RegistrarDashboard = {
  role: 'registrar',
  totalScholars: 42,
  pendingAccessReviews: 3,
  myPendingAccessReviews: 1,
  rosterAuditIssues: 5,
};

const admin: AdminDashboard = {
  role: 'admin',
  totalScholars: 42,
  pendingJoinRequests: 6,
  pendingAccessReviews: 3,
  contentByDiscipline: [{ discipline: 'SystematicTheology', count: 9 }],
  recentActivity: [
    {
      action: 'content_created',
      actorUserId: 'abcdef12-3456-7890-abcd-ef1234567890',
      targetType: 'content_posts',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  getDashboard.mockReset();
});

describe('DashboardScreen', () => {
  it('renders the scholar panel with the roster status and recent content links', async () => {
    getDashboard.mockResolvedValue(scholarActive);
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText('reg-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /hermeneutics 101/i })).toHaveAttribute(
      'href',
      '/content/c1',
    );
  });

  it('hides content and shows a note for a non-active scholar', async () => {
    getDashboard.mockResolvedValue({
      role: 'scholar',
      roster: roster({ status: 'pending' }),
      recentContent: [],
    } satisfies ScholarDashboard);
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText(/access pending review/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /hermeneutics 101/i })).not.toBeInTheDocument();
  });

  it('guides a scholar with no linked roster entry', async () => {
    getDashboard.mockResolvedValue({
      role: 'scholar',
      roster: null,
      recentContent: [],
    } satisfies ScholarDashboard);
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText(/not linked yet/i)).toBeInTheDocument();
  });

  it('renders the faculty panel with a failed-deliveries deep link', async () => {
    getDashboard.mockResolvedValue(faculty);
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText('My posts')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /failed deliveries/i })).toHaveAttribute(
      'href',
      '/content?mine=true&deliveryStatus=failed',
    );
  });

  it('renders the registrar panel with review and audit deep links', async () => {
    getDashboard.mockResolvedValue(registrar);
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText('Active scholars')).toBeInTheDocument();
    const reviewLinks = screen.getAllByRole('link', { name: /access reviews|flagged by me/i });
    for (const link of reviewLinks) {
      expect(link).toHaveAttribute('href', '/roster?tab=access-review');
    }
    expect(screen.getByRole('link', { name: /roster mismatches/i })).toHaveAttribute(
      'href',
      '/roster?tab=audit',
    );
  });

  it('renders the admin panel, trimming activity to non-PII fields', async () => {
    getDashboard.mockResolvedValue({
      ...admin,
      recentActivity: [{ ...admin.recentActivity[0]!, details: { secret: 'do-not-render' } }],
    } as unknown as DashboardPayload);
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText('Content created')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /systematic theology/i })).toHaveAttribute(
      'href',
      '/content?discipline=SystematicTheology',
    );
    expect(screen.queryByText(/do-not-render/)).not.toBeInTheDocument();
  });

  it('renders no raw telegramId or full name from the payload', async () => {
    getDashboard.mockResolvedValue({
      ...admin,
      recentActivity: [
        {
          ...admin.recentActivity[0]!,
          telegramId: 99887766,
          fullName: 'Secret Person',
        },
      ],
    } as unknown as DashboardPayload);
    renderWithProviders(<DashboardScreen />);

    await screen.findByText('Content created');
    expect(screen.queryByText('99887766')).not.toBeInTheDocument();
    expect(screen.queryByText(/secret person/i)).not.toBeInTheDocument();
  });

  it('never sends a role hint alongside the dashboard request', async () => {
    getDashboard.mockResolvedValue(scholarActive);
    renderWithProviders(<DashboardScreen />);

    await screen.findByText('Active');
    expect(getDashboard).toHaveBeenCalledTimes(1);
    const args = getDashboard.mock.calls[0] ?? [];
    expect(args.join(' ')).not.toMatch(/admin|scholar|faculty|registrar/i);
  });
});
