import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDatabase } from '../db/testing/test-database';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { upsertMembershipForUser } from '../repositories/channel-membership.repository';
import { computeRosterAudit } from './roster-audit.service';

beforeEach(resetTestDatabase);

describe('computeRosterAudit', () => {
  it('flags a graduated member that is still in the channel', async () => {
    const scholar = await createUser(8301, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-8301', userId: scholar.id, status: 'graduated' });
    await upsertMembershipForUser(scholar.id, { isMember: true, memberStatus: 'member' });

    const audit = await computeRosterAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      issue: 'inactive_still_member',
      roster: { userId: scholar.id, status: 'graduated' },
    });
  });

  it('flags an active scholar that is not in the channel', async () => {
    const scholar = await createUser(8302, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-8302', userId: scholar.id, status: 'active' });
    await upsertMembershipForUser(scholar.id, { isMember: false, memberStatus: 'left' });

    const audit = await computeRosterAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0].issue).toBe('active_not_member');
  });

  it('marks missing membership as unknown and omits consistent rows', async () => {
    const unknown = await createUser(8303, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-8303', userId: unknown.id, status: 'graduated' });

    const ok = await createUser(8304, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-8304', userId: ok.id, status: 'active' });
    await upsertMembershipForUser(ok.id, { isMember: true, memberStatus: 'member' });

    await insertRosterRow({ registrationId: 'DIBI-THD-8305', userId: null, status: 'active' });

    const audit = await computeRosterAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0].issue).toBe('membership_unknown');
  });
});
