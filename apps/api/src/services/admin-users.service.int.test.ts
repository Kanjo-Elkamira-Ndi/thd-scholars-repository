import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { countAdmins, getUserById } from '../repositories/users.repository';
import { changeUserRole, listUsers } from './admin-users.service';

beforeEach(resetTestDatabase);

describe('admin-users service (integration)', () => {
  it('lists users', async () => {
    await createUser(9401, 'scholar');
    await createUser(9402, 'faculty');

    expect(await listUsers()).toHaveLength(2);
  });

  it('changes a role and writes an audit log', async () => {
    const admin = await createUser(9403, 'admin');
    const scholar = await createUser(9404, 'scholar');

    const updated = await changeUserRole(scholar.id, 'faculty', admin.id);

    expect(updated.role).toBe('faculty');
    expect((await getUserById(scholar.id))?.role).toBe('faculty');
  });

  it('keeps at least one admin when two admins demote each other concurrently', async () => {
    const adminA = await createUser(9405, 'admin');
    const adminB = await createUser(9406, 'admin');

    const results = await Promise.allSettled([
      changeUserRole(adminA.id, 'scholar', adminB.id),
      changeUserRole(adminB.id, 'scholar', adminA.id),
    ]);

    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    expect(await countAdmins()).toBe(1);
  });
});
