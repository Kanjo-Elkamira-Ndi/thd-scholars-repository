import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from './audit';

describe('audit enums', () => {
  it('exposes the phase-15 actions', () => {
    expect(Object.values(AUDIT_ACTIONS)).toEqual(
      expect.arrayContaining([
        'update_user_role',
        'update_settings',
        'member_removal_requested',
        'member_removal_failed',
        'quarterly_roster_audit',
        'create_roster_entry',
        'update_roster_status',
        'update_roster_entry',
        'approve_join_request',
        'decline_join_request',
        'join_request_delivery_failed',
        'content_created',
        'content_updated',
        'content_deleted',
        'content_posted',
        'content_delivery_failed',
      ]),
    );
  });

  it('exposes the phase-15 target types', () => {
    expect(Object.values(AUDIT_TARGET_TYPES)).toEqual(
      expect.arrayContaining([
        'users',
        'settings',
        'member_removals',
        'jobs',
        'roster',
        'join_requests',
        'content_posts',
      ]),
    );
  });
});
