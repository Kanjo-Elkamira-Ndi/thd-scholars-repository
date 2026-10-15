import type { AuditAction, AuditTargetType } from '@thd/shared';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@thd/shared';

const ACTION_LABELS: Record<AuditAction, string> = {
  [AUDIT_ACTIONS.UPDATE_USER_ROLE]: 'Role changed',
  [AUDIT_ACTIONS.UPDATE_SETTINGS]: 'Settings updated',
  [AUDIT_ACTIONS.MEMBER_REMOVAL_REQUESTED]: 'Member removal requested',
  [AUDIT_ACTIONS.MEMBER_REMOVAL_FAILED]: 'Member removal failed',
  [AUDIT_ACTIONS.QUARTERLY_ROSTER_AUDIT]: 'Quarterly roster audit',
  [AUDIT_ACTIONS.CREATE_ROSTER_ENTRY]: 'Roster entry created',
  [AUDIT_ACTIONS.UPDATE_ROSTER_STATUS]: 'Roster status changed',
  [AUDIT_ACTIONS.UPDATE_ROSTER_ENTRY]: 'Roster entry updated',
  [AUDIT_ACTIONS.APPROVE_JOIN_REQUEST]: 'Join request approved',
  [AUDIT_ACTIONS.DECLINE_JOIN_REQUEST]: 'Join request declined',
  [AUDIT_ACTIONS.JOIN_REQUEST_DELIVERY_FAILED]: 'Join request delivery failed',
  [AUDIT_ACTIONS.CONTENT_CREATED]: 'Content created',
  [AUDIT_ACTIONS.CONTENT_UPDATED]: 'Content updated',
  [AUDIT_ACTIONS.CONTENT_DELETED]: 'Content deleted',
  [AUDIT_ACTIONS.CONTENT_POSTED]: 'Content posted',
  [AUDIT_ACTIONS.CONTENT_DELIVERY_FAILED]: 'Content delivery failed',
};

const TARGET_LABELS: Record<AuditTargetType, string> = {
  [AUDIT_TARGET_TYPES.USERS]: 'Users',
  [AUDIT_TARGET_TYPES.SETTINGS]: 'Settings',
  [AUDIT_TARGET_TYPES.MEMBER_REMOVALS]: 'Member removals',
  [AUDIT_TARGET_TYPES.JOBS]: 'Jobs',
  [AUDIT_TARGET_TYPES.ROSTER]: 'Roster',
  [AUDIT_TARGET_TYPES.JOIN_REQUESTS]: 'Join requests',
  [AUDIT_TARGET_TYPES.CONTENT_POSTS]: 'Content',
};

/** Humanised label for an audit action; falls back to the raw value. */
export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action as AuditAction] ?? action;
}

/** Humanised label for an audit target type; falls back to the raw value. */
export function auditTargetTypeLabel(target: string): string {
  return TARGET_LABELS[target as AuditTargetType] ?? target;
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/** Relative time such as "3 days ago"; `now` is injectable for deterministic tests. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSeconds = Math.round((then - now) / 1000);
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diffSeconds) >= seconds || unit === 'second') {
      return RELATIVE.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return iso;
}

/** Short, non-identifying actor label; `null` actors are the system itself. */
export function shortActor(actorUserId: string | null): string {
  return actorUserId ? actorUserId.slice(0, 8) : 'System';
}
