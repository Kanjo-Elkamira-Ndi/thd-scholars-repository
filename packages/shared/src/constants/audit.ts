export const AUDIT_ACTIONS = {
  UPDATE_USER_ROLE: 'update_user_role',
  UPDATE_SETTINGS: 'update_settings',
  MEMBER_REMOVAL_REQUESTED: 'member_removal_requested',
  MEMBER_REMOVAL_FAILED: 'member_removal_failed',
  QUARTERLY_ROSTER_AUDIT: 'quarterly_roster_audit',
  CREATE_ROSTER_ENTRY: 'create_roster_entry',
  UPDATE_ROSTER_STATUS: 'update_roster_status',
  UPDATE_ROSTER_ENTRY: 'update_roster_entry',
  APPROVE_JOIN_REQUEST: 'approve_join_request',
  DECLINE_JOIN_REQUEST: 'decline_join_request',
  JOIN_REQUEST_DELIVERY_FAILED: 'join_request_delivery_failed',
  CONTENT_CREATED: 'content_created',
  CONTENT_UPDATED: 'content_updated',
  CONTENT_DELETED: 'content_deleted',
  CONTENT_POSTED: 'content_posted',
  CONTENT_DELIVERY_FAILED: 'content_delivery_failed',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGET_TYPES = {
  USERS: 'users',
  SETTINGS: 'settings',
  MEMBER_REMOVALS: 'member_removals',
  JOBS: 'jobs',
  ROSTER: 'roster',
  JOIN_REQUESTS: 'join_requests',
  CONTENT_POSTS: 'content_posts',
} as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[keyof typeof AUDIT_TARGET_TYPES];
