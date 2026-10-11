import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { upsertMembershipForUser } from '../repositories/channel-membership.repository';
import { getMemberRemoval } from '../repositories/member-removals.repository';
import { listMembers, listRosterAudit, requestMemberRemoval } from './members.service';
import { updateRosterEntry } from './roster.service';

beforeEach(resetTestDatabase);

describe('members service (integration)', () => {
  it('lists members with roster and membership', async () => {
    const scholar = await createUser(9702, 'scholar');
    await pool.query(`UPDATE users SET full_name = $2 WHERE id = $1`, [scholar.id, 'Scholar One']);
    await insertRosterRow({
      registrationId: 'DIBI-THD-9702',
      userId: scholar.id,
      status: 'active',
    });
    await upsertMembershipForUser(scholar.id, { isMember: true, memberStatus: 'member' });

    const members = await listMembers();
    const found = members.find((m) => m.user.id === scholar.id);

    expect(found?.roster?.registrationId).toBe('DIBI-THD-9702');
    expect(found?.membership?.isMember).toBe(true);
  });

  it('audits roster issues and skips healthy rows', async () => {
    const unknown = await createUser(9711, 'scholar');
    const still = await createUser(9712, 'scholar');
    const gone = await createUser(9713, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-9711', userId: unknown.id, status: 'active' });
    await insertRosterRow({
      registrationId: 'DIBI-THD-9712',
      userId: still.id,
      status: 'graduated',
    });
    await insertRosterRow({ registrationId: 'DIBI-THD-9713', userId: gone.id, status: 'active' });
    await upsertMembershipForUser(still.id, { isMember: true, memberStatus: 'member' });
    await upsertMembershipForUser(gone.id, { isMember: false, memberStatus: 'left' });

    const audit = await listRosterAudit();
    const byId = Object.fromEntries(audit.map((a) => [a.roster.registrationId, a.issue]));

    expect(byId['DIBI-THD-9711']).toBe('membership_unknown');
    expect(byId['DIBI-THD-9712']).toBe('inactive_still_member');
    expect(byId['DIBI-THD-9713']).toBe('active_not_member');
  });

  it('lets an admin remove a scholar and is idempotent', async () => {
    const admin = await createUser(9721, 'admin');
    const scholar = await createUser(9722, 'scholar');

    const first = await requestMemberRemoval(scholar.id, { id: admin.id, role: 'admin' }, null);
    const second = await requestMemberRemoval(scholar.id, { id: admin.id, role: 'admin' }, 'again');

    expect(first.created).toBe(true);
    expect(first.removal.status).toBe('pending');
    expect(first.removal.initiatedByRole).toBe('admin');
    expect(second.created).toBe(false);
    expect(second.removal.id).toBe(first.removal.id);
  });

  it('blocks removing an admin and removing yourself', async () => {
    const admin = await createUser(9731, 'admin');
    const otherAdmin = await createUser(9732, 'admin');

    await expect(
      requestMemberRemoval(admin.id, { id: admin.id, role: 'admin' }, null),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      requestMemberRemoval(otherAdmin.id, { id: admin.id, role: 'admin' }, null),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('restricts registrar removal to their own flagged pending review', async () => {
    const registrar = await createUser(9741, 'registrar');
    const otherRegistrar = await createUser(9742, 'registrar');
    const scholar = await createUser(9743, 'scholar');
    const unflagged = await createUser(9744, 'scholar');
    await insertRosterRow({
      registrationId: 'DIBI-THD-9743',
      userId: scholar.id,
      status: 'graduated',
      updatedBy: registrar.id,
      accessReviewPending: true,
    });
    await insertRosterRow({
      registrationId: 'DIBI-THD-9744',
      userId: unflagged.id,
      status: 'active',
      updatedBy: registrar.id,
      accessReviewPending: false,
    });

    await expect(
      requestMemberRemoval(scholar.id, { id: otherRegistrar.id, role: 'registrar' }, null),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      requestMemberRemoval(unflagged.id, { id: registrar.id, role: 'registrar' }, null),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const ok = await requestMemberRemoval(
      scholar.id,
      { id: registrar.id, role: 'registrar' },
      'access revoked',
    );
    expect(ok.created).toBe(true);
    expect(ok.removal.initiatedByRole).toBe('registrar');
  });

  it('cancels a pending removal when the roster entry is reactivated', async () => {
    const registrar = await createUser(9751, 'registrar');
    const scholar = await createUser(9752, 'scholar');
    const rosterId = await insertRosterRow({
      registrationId: 'DIBI-THD-9752',
      userId: scholar.id,
      status: 'graduated',
      updatedBy: registrar.id,
      accessReviewPending: true,
    });

    const { removal } = await requestMemberRemoval(
      scholar.id,
      { id: registrar.id, role: 'registrar' },
      null,
    );

    await updateRosterEntry({
      actorUserId: registrar.id,
      id: rosterId,
      patch: { status: 'active' },
    });

    const after = await getMemberRemoval(removal.id);
    expect(after?.status).toBe('cancelled');
  });
});
