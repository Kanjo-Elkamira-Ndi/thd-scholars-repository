import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { upsertMembershipForUser } from '../repositories/channel-membership.repository';
import { quarterlyAuditJob } from './quarterly-audit.job';
import { runJob } from './run-job';

beforeEach(resetTestDatabase);

const setupFlags = async (): Promise<void> => {
  const graduated = await createUser(8401, 'scholar');
  await insertRosterRow({ registrationId: 'DIBI-THD-8401', userId: graduated.id, status: 'graduated' });
  await upsertMembershipForUser(graduated.id, { isMember: true, memberStatus: 'member' });

  const active = await createUser(8402, 'scholar');
  await insertRosterRow({ registrationId: 'DIBI-THD-8402', userId: active.id, status: 'active' });
  await upsertMembershipForUser(active.id, { isMember: false, memberStatus: 'left' });

  const unknown = await createUser(8403, 'scholar');
  await insertRosterRow({ registrationId: 'DIBI-THD-8403', userId: unknown.id, status: 'graduated' });
};

describe('quarterlyAuditJob', () => {
  it('writes one audit log and notifies every admin exactly once', async () => {
    await setupFlags();
    await createUser(8404, 'admin');
    await createUser(8405, 'admin');
    await createUser(8406, 'registrar');

    const result = await runJob(quarterlyAuditJob);
    expect(result.status).toBe('completed');

    const { rows: logs } = await pool.query<{ action: string; details: unknown }>(
      `SELECT action, details FROM audit_logs WHERE action = 'quarterly_roster_audit'`,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toMatchObject({
      total: 3,
      counts: { active_not_member: 1, inactive_still_member: 1, membership_unknown: 1 },
    });

    const { rows: notifs } = await pool.query<{ event: string; count: string }>(
      `SELECT event, count(*)::text AS count FROM notifications GROUP BY event`,
    );
    expect(notifs).toEqual([{ event: 'audit_flagged', count: '2' }]);
  });

  it('does not duplicate work when run twice in the same quarter', async () => {
    await setupFlags();
    await createUser(8407, 'admin');

    await runJob(quarterlyAuditJob);
    const second = await runJob(quarterlyAuditJob);
    expect(second.status).toBe('skipped');

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE action = 'quarterly_roster_audit'`,
    );
    expect(rows[0].count).toBe('1');
  });
});
