export const AUDIT_ACTIONS = {
  UPDATE_USER_ROLE: 'update_user_role',
  UPDATE_SETTINGS: 'update_settings',
  MEMBER_REMOVAL_REQUESTED: 'member_removal_requested',
  MEMBER_REMOVAL_FAILED: 'member_removal_failed',
  QUARTERLY_ROSTER_AUDIT: 'quarterly_roster_audit',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGET_TYPES = {
  USERS: 'users',
  SETTINGS: 'settings',
  MEMBER_REMOVALS: 'member_removals',
  JOBS: 'jobs',
} as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[keyof typeof AUDIT_TARGET_TYPES];
