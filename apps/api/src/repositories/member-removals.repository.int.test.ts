import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import {
  cancelPendingRemovalsForUser,
  claimMemberRemovals,
  getMemberRemoval,
  insertMemberRemoval,
  markMemberRemovalDone,
  markMemberRemovalFailed,
  rescheduleMemberRemoval,
} from './member-removals.repository';

beforeEach(resetTestDatabase);

describe('member-removals repository', () => {
  it('inserts a removal and returns created=true', async () => {
    const scholar = await createUser(9001, 'scholar');
    const admin = await createUser(9002, 'admin');

    const { removal, created } = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: admin.id,
      initiatedByRole: 'admin',
      reason: 'inactive',
    });

    expect(created).toBe(true);
    expect(removal.status).toBe('pending');
    expect(removal.attempts).toBe(0);
    expect(removal.reason).toBe('inactive');
  });

  it('is idempotent for an open removal', async () => {
    const scholar = await createUser(9003, 'scholar');
    const first = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: null,
      initiatedByRole: 'admin',
      reason: null,
    });
    const second = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: null,
      initiatedByRole: 'admin',
      reason: 'again',
    });

    expect(second.created).toBe(false);
    expect(second.removal.id).toBe(first.removal.id);
  });

  it('cancels pending removals for a user', async () => {
    const scholar = await createUser(9004, 'scholar');
    const { removal } = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: null,
      initiatedByRole: 'admin',
      reason: null,
    });

    const cancelled = await cancelPendingRemovalsForUser(scholar.id);

    expect(cancelled).toBe(1);
    const row = await getMemberRemoval(removal.id);
    expect(row?.status).toBe('cancelled');
  });

  it('claims a registrar removal only while the roster is graduated or withdrawn', async () => {
    const registrar = await createUser(9005, 'registrar');
    const active = await createUser(9006, 'scholar');
    const graduated = await createUser(9007, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-9006', userId: active.id, status: 'active' });
    await insertRosterRow({
      registrationId: 'DIBI-THD-9007',
      userId: graduated.id,
      status: 'graduated',
    });
    await insertMemberRemoval({
      userId: active.id,
      requestedBy: registrar.id,
      initiatedByRole: 'registrar',
      reason: null,
    });
    const graded = await insertMemberRemoval({
      userId: graduated.id,
      requestedBy: registrar.id,
      initiatedByRole: 'registrar',
      reason: null,
    });

    const claimed = await claimMemberRemovals({ limit: 10, leaseSeconds: 120 });

    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(graded.removal.id);
    expect(claimed[0].telegramId).toBe(9007);
    expect(claimed[0].attempts).toBe(1);
  });

  it('claims an admin removal regardless of roster status', async () => {
    const admin = await createUser(9008, 'admin');
    const scholar = await createUser(9009, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-9009', userId: scholar.id, status: 'active' });
    await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: admin.id,
      initiatedByRole: 'admin',
      reason: null,
    });

    const claimed = await claimMemberRemovals({ limit: 10, leaseSeconds: 120 });

    expect(claimed).toHaveLength(1);
    expect(claimed[0].userId).toBe(scholar.id);
  });

  it('marks a removal done', async () => {
    const scholar = await createUser(9010, 'scholar');
    const { removal } = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: null,
      initiatedByRole: 'admin',
      reason: null,
    });

    await markMemberRemovalDone(removal.id);

    const row = await getMemberRemoval(removal.id);
    expect(row?.status).toBe('done');
    expect(row?.processedAt).not.toBeNull();
  });

  it('reschedules a removal to pending', async () => {
    const scholar = await createUser(9011, 'scholar');
    const { removal } = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: null,
      initiatedByRole: 'admin',
      reason: null,
    });

    await rescheduleMemberRemoval(removal.id, {
      error: 'boom',
      nextAttemptAt: new Date(Date.now() + 60_000),
    });

    const row = await getMemberRemoval(removal.id);
    expect(row?.status).toBe('pending');
    expect(row?.lastError).toBe('boom');
    expect(row?.nextAttemptAt).not.toBeNull();
  });

  it('marks a removal failed terminally', async () => {
    const scholar = await createUser(9012, 'scholar');
    const { removal } = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: null,
      initiatedByRole: 'admin',
      reason: null,
    });

    await markMemberRemovalFailed(removal.id, { error: 'gave up' });

    const row = await getMemberRemoval(removal.id);
    expect(row?.status).toBe('failed');
    expect(row?.lastError).toBe('gave up');
  });
});
