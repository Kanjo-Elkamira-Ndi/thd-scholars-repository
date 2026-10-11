import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertAuditLog, listAuditLogs } from './audit-logs.repository';

beforeEach(resetTestDatabase);

describe('listAuditLogs', () => {
  it('filters by action and paginates newest first', async () => {
    const actor = await createUser(9101, 'admin');
    await insertAuditLog({
      actorUserId: actor.id,
      action: 'update_settings',
      targetType: 'settings',
      targetId: null,
      details: { maxUploadSizeBytes: { from: 1, to: 2 } },
    });
    await insertAuditLog({
      actorUserId: actor.id,
      action: 'update_user_role',
      targetType: 'users',
      targetId: actor.id,
      details: null,
    });
    await insertAuditLog({
      actorUserId: actor.id,
      action: 'update_user_role',
      targetType: 'users',
      targetId: null,
      details: null,
    });

    const byAction = await listAuditLogs({
      action: 'update_user_role',
      page: 1,
      pageSize: 50,
    });
    expect(byAction.total).toBe(2);
    expect(byAction.logs).toHaveLength(2);

    const pageTwo = await listAuditLogs({ page: 2, pageSize: 1 });
    expect(pageTwo.total).toBe(3);
    expect(pageTwo.logs).toHaveLength(1);
    expect(pageTwo.logs[0].action).toBe('update_user_role');
  });

  it('filters by actor and target type', async () => {
    const actor = await createUser(9102, 'admin');
    const other = await createUser(9103, 'admin');
    await insertAuditLog({
      actorUserId: actor.id,
      action: 'update_settings',
      targetType: 'settings',
      targetId: null,
      details: null,
    });
    await insertAuditLog({
      actorUserId: other.id,
      action: 'update_user_role',
      targetType: 'users',
      targetId: null,
      details: null,
    });

    const byActor = await listAuditLogs({ actorUserId: actor.id, page: 1, pageSize: 50 });
    expect(byActor.total).toBe(1);
    expect(byActor.logs[0].targetType).toBe('settings');

    const byTarget = await listAuditLogs({ targetType: 'users', page: 1, pageSize: 50 });
    expect(byTarget.total).toBe(1);
    expect(byTarget.logs[0].action).toBe('update_user_role');
  });
});
