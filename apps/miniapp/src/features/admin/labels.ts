import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@thd/shared';
import { auditActionLabel, auditTargetTypeLabel } from '@/lib/audit-labels';

export { auditActionLabel, auditTargetTypeLabel, formatRelativeTime } from '@/lib/audit-labels';

/** Radix Select forbids an empty item value, so the "no filter" choice is a sentinel. */
export const ALL_ACTIONS = '__all_actions__';
export const ALL_TARGET_TYPES = '__all_target_types__';

export function auditActionOptions(): { value: string; label: string }[] {
  return [
    { value: ALL_ACTIONS, label: 'All actions' },
    ...Object.values(AUDIT_ACTIONS).map((value) => ({ value, label: auditActionLabel(value) })),
  ];
}

export function auditTargetTypeOptions(): { value: string; label: string }[] {
  return [
    { value: ALL_TARGET_TYPES, label: 'All targets' },
    ...Object.values(AUDIT_TARGET_TYPES).map((value) => ({
      value,
      label: auditTargetTypeLabel(value),
    })),
  ];
}

export const ADMIN_COPY = {
  hubUsers: 'Users & roles',
  hubUsersDescription: 'Browse accounts and change roles.',
  hubMembers: 'Members',
  hubMembersDescription: 'Roster status, channel membership and removals.',
  hubAudit: 'Audit log',
  hubAuditDescription: 'Every privileged action, with actor and time.',
  hubSettings: 'Settings',
  hubSettingsDescription: 'Registration pattern, cohorts and upload limits.',
  usersSearchPlaceholder: 'Search by name, username or role',
  membersTabMembers: 'Members',
  membersTabMismatches: 'Mismatches',
  auditSearchPlaceholder: 'Actor id (uuid)',
  settingsSaved: 'Settings saved.',
} as const;
