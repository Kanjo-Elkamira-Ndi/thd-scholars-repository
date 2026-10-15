import type { RosterStatus } from '@thd/shared';

export const DASHBOARD_COPY = {
  recentContent: 'Recent content',
  recentActivity: 'Recent activity',
  contentByDiscipline: 'Content by discipline',
  rosterStanding: 'Roster standing',
  registrationId: 'Registration id',
  cohort: 'Cohort',
  noContentYet: 'No content yet',
  noContentYetDescription: 'Recent library posts will show up here.',
  noActivity: 'No recent activity',
  noActivityDescription: 'Privileged actions will appear here as they happen.',
  noDiscipline: 'No content posted yet',
} as const;

const STATUS_NOTES: Record<RosterStatus, { title: string; description: string }> = {
  active: {
    title: 'Active',
    description: 'Your access is active.',
  },
  pending: {
    title: 'Access pending review',
    description: 'The registrar is reviewing your access. Content unlocks once approved.',
  },
  graduated: {
    title: 'Access ended',
    description: 'Your studies are complete, so library access has ended.',
  },
  withdrawn: {
    title: 'Access ended',
    description: 'Your access has ended. Contact the registrar to restore it.',
  },
};

export function scholarStatusNote(status: RosterStatus): { title: string; description: string } {
  return STATUS_NOTES[status];
}
