import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertAuditLog } from '../repositories/audit-logs.repository';
import { listAuditLogs } from './audit-logs.service';

beforeEach(resetTestDatabase);

describe('audit-logs service (integration)', () => {
  it('returns paginated logs with metadata', async () => {
    const admin = await createUser(9501, 'admin');
    await insertAuditLog({
      actorUserId: admin.id,
      action: 'update_settings',
      targetType: 'settings',
      targetId: null,
      details: null,
    });
    await insertAuditLog({
      actorUserId: admin.id,
      action: 'update_user_role',
      targetType: 'users',
      targetId: admin.id,
      details: null,
    });

    const page = await listAuditLogs({ page: 1, pageSize: 1 });

    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(1);
    expect(page.logs).toHaveLength(1);
    expect(page.logs[0].action).toBe('update_user_role');
  });
});
