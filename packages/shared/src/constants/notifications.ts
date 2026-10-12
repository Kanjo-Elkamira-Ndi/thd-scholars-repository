export const NOTIFICATION_EVENTS = [
  'role_changed',
  'member_removal_requested',
  'audit_flagged',
  'access_review_reminder',
  'repeated_registration_failure',
] as const;

export const JOB_NAMES = {
  QUARTERLY_AUDIT: 'quarterly_audit',
  ACCESS_REVIEW_REMINDER: 'access_review_reminder',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
