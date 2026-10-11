import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import {
  getMembershipForUser,
  listReconcileTargets,
  upsertMembershipByTelegram,
  upsertMembershipForUser,
} from './channel-membership.repository';

beforeEach(resetTestDatabase);

describe('channel-membership repository', () => {
  it('upserts by telegram and ignores unknown telegram ids', async () => {
    const known = await createUser(8001, 'scholar');

    const count = await upsertMembershipByTelegram([
      { telegramId: 8001, isMember: true, memberStatus: 'member' },
      { telegramId: 9999, isMember: true, memberStatus: 'member' },
    ]);

    expect(count).toBe(1);
    const membership = await getMembershipForUser(known.id);
    expect(membership?.isMember).toBe(true);
    expect(membership?.memberStatus).toBe('member');
  });

  it('flips membership on re-upsert', async () => {
    const known = await createUser(8002, 'scholar');

    await upsertMembershipByTelegram([{ telegramId: 8002, isMember: true, memberStatus: 'member' }]);
    await upsertMembershipByTelegram([{ telegramId: 8002, isMember: false, memberStatus: 'left' }]);

    const membership = await getMembershipForUser(known.id);
    expect(membership?.isMember).toBe(false);
    expect(membership?.memberStatus).toBe('left');
  });

  it('returns null for a user with no membership row', async () => {
    const user = await createUser(8003, 'scholar');
    expect(await getMembershipForUser(user.id)).toBeNull();
  });

  it('upserts membership for a single user', async () => {
    const user = await createUser(8004, 'scholar');

    await upsertMembershipForUser(user.id, { isMember: true, memberStatus: 'member' });

    const membership = await getMembershipForUser(user.id);
    expect(membership?.isMember).toBe(true);
    expect(membership?.memberStatus).toBe('member');
  });

  it('lists all users as reconcile targets', async () => {
    await createUser(8005, 'scholar');
    await createUser(8006, 'faculty');

    const targets = await listReconcileTargets();

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.telegramId).sort()).toEqual([8005, 8006]);
  });
});
