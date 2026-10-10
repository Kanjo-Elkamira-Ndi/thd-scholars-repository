import { beforeEach, describe, expect, it } from 'vitest';
import { insertAuditLog } from '../repositories/audit-logs.repository';
import { insertJoinRequest } from '../repositories/join-requests.repository';
import { createUser } from './testing/fixtures';
import { resetTestDatabase } from './testing/test-database';
import pool from './pool';
import { withTransaction } from './transaction';

beforeEach(resetTestDatabase);

describe('withTransaction (integration)', () => {
  it('commits all writes when the callback resolves', async () => {
    const user = await createUser(3111111111, 'scholar');

    await withTransaction(async (client) => {
      await insertJoinRequest(
        { userId: user.id, status: 'declined', decidedBy: null, reason: 'x' },
        client,
      );
    });

    const { rows } = await pool.query('SELECT id FROM join_requests');
    expect(rows).toHaveLength(1);
  });

  it('rolls back all writes when a later statement throws', async () => {
    const user = await createUser(3222222222, 'scholar');

    await expect(
      withTransaction(async (client) => {
        await insertJoinRequest(
          { userId: user.id, status: 'declined', decidedBy: null, reason: 'x' },
          client,
        );
        await insertAuditLog(
          {
            actorUserId: null,
            action: 'decline_join_request',
            targetType: 'join_requests',
            targetId: null,
            details: null,
          },
          client,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const joinRows = await pool.query('SELECT id FROM join_requests');
    expect(joinRows.rows).toHaveLength(0);
    const auditRows = await pool.query('SELECT id FROM audit_logs');
    expect(auditRows.rows).toHaveLength(0);
  });
});
