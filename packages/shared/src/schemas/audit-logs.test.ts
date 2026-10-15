import { describe, expect, it } from 'vitest';
import { auditLogQuerySchema } from './audit-logs';

describe('auditLogQuerySchema', () => {
  it('defaults page and pageSize', () => {
    const query = auditLogQuerySchema.parse({});
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(50);
  });

  it('rejects a non-uuid actorUserId', () => {
    expect(auditLogQuerySchema.safeParse({ actorUserId: 'nope' }).success).toBe(false);
  });

  it('rejects a pageSize over 100', () => {
    expect(auditLogQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('accepts a known action and target type', () => {
    const parsed = auditLogQuerySchema.parse({ action: 'update_settings', targetType: 'settings' });
    expect(parsed.action).toBe('update_settings');
    expect(parsed.targetType).toBe('settings');
  });

  it('rejects an unknown action', () => {
    expect(auditLogQuerySchema.safeParse({ action: 'not_a_real_action' }).success).toBe(false);
  });

  it('rejects an unknown target type', () => {
    expect(auditLogQuerySchema.safeParse({ targetType: 'not_real' }).success).toBe(false);
  });
});
