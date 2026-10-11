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
});
