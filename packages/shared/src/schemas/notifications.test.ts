import { describe, expect, it } from 'vitest';
import { NOTIFICATION_EVENTS } from '../constants/notifications';
import { NOTIFICATION_EVENTS as EVENTS_FROM_INDEX } from '../index';
import { notificationClaimSchema, notificationConfirmSchema } from './notifications';

describe('NOTIFICATION_EVENTS', () => {
  it('contains exactly the five events and is exported from the index', () => {
    expect([...NOTIFICATION_EVENTS]).toEqual([
      'role_changed',
      'member_removal_requested',
      'audit_flagged',
      'access_review_reminder',
      'repeated_registration_failure',
    ]);
    expect(EVENTS_FROM_INDEX).toBe(NOTIFICATION_EVENTS);
  });
});

describe('notificationClaimSchema', () => {
  it('accepts an empty object', () => {
    expect(notificationClaimSchema.safeParse({}).success).toBe(true);
  });

  it('coerces a positive limit', () => {
    expect(notificationClaimSchema.safeParse({ limit: '10' }).data).toEqual({ limit: 10 });
  });

  it('rejects a non-positive limit', () => {
    expect(notificationClaimSchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe('notificationConfirmSchema', () => {
  it('accepts a sent outcome without an error', () => {
    expect(notificationConfirmSchema.safeParse({ outcome: 'sent' }).success).toBe(true);
  });

  it('accepts a terminal failure with an error', () => {
    expect(
      notificationConfirmSchema.safeParse({
        outcome: 'failed',
        terminal: true,
        error: 'undeliverable',
      }).success,
    ).toBe(true);
  });

  it('rejects a failure without an error', () => {
    expect(notificationConfirmSchema.safeParse({ outcome: 'failed' }).success).toBe(false);
  });
});
