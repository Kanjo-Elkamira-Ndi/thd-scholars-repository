import { describe, expect, it } from 'vitest';
import { memberRemovalConfirmSchema, membershipSnapshotSchema, removeMemberSchema } from './members';

describe('membershipSnapshotSchema', () => {
  it('accepts a valid snapshot', () => {
    const result = membershipSnapshotSchema.safeParse({
      members: [{ telegramId: 123, isMember: true, memberStatus: 'member' }],
    });
    expect(result.success).toBe(true);
  });

  it('defaults memberStatus to null when omitted', () => {
    const result = membershipSnapshotSchema.parse({ members: [{ telegramId: 42, isMember: false }] });
    expect(result.members[0].memberStatus).toBeNull();
  });

  it('rejects a negative telegram id', () => {
    const result = membershipSnapshotSchema.safeParse({ members: [{ telegramId: -1, isMember: true }] });
    expect(result.success).toBe(false);
  });
});

describe('removeMemberSchema', () => {
  it('accepts an empty object', () => {
    expect(removeMemberSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a reason over 500 characters', () => {
    expect(removeMemberSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('memberRemovalConfirmSchema', () => {
  it('accepts removed without an error', () => {
    expect(memberRemovalConfirmSchema.safeParse({ outcome: 'removed' }).success).toBe(true);
  });

  it('rejects failed without an error', () => {
    expect(memberRemovalConfirmSchema.safeParse({ outcome: 'failed' }).success).toBe(false);
  });

  it('accepts failed with an error', () => {
    expect(memberRemovalConfirmSchema.safeParse({ outcome: 'failed', error: 'boom' }).success).toBe(true);
  });
});
