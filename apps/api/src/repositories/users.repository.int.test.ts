import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { withTransaction } from '../db/transaction';
import {
  countAdmins,
  getUserById,
  listUsers,
  lockAdminRows,
  updateUserRole,
  upsertByTelegram,
} from './users.repository';

beforeEach(resetTestDatabase);

describe('upsertByTelegram (integration)', () => {
  it('inserts a new user', async () => {
    const user = await upsertByTelegram({
      telegramId: 5555555555,
      username: 'fresh_user',
      fullName: 'Fresh User',
    });
    expect(user.telegramId).toBe(5555555555);
    expect(user.telegramUsername).toBe('fresh_user');
    expect(user.role).toBe('scholar');
  });

  it('returns the existing row when the user re-authenticates with an unchanged username', async () => {
    const first = await upsertByTelegram({
      telegramId: 6666666666,
      username: 'repeat_user',
      fullName: 'Repeat User',
    });

    const second = await upsertByTelegram({
      telegramId: 6666666666,
      username: 'repeat_user',
      fullName: 'Repeat User',
    });

    expect(second.id).toBe(first.id);
    expect(second.telegramUsername).toBe('repeat_user');
  });

  it('updates the username on change but preserves the role', async () => {
    const created = await upsertByTelegram({
      telegramId: 7777777777,
      username: 'old_name',
      fullName: 'Role User',
    });
    await pool.query('UPDATE users SET role = $2 WHERE id = $1', [created.id, 'registrar']);

    const updated = await upsertByTelegram({
      telegramId: 7777777777,
      username: 'new_name',
      fullName: 'Role User',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.telegramUsername).toBe('new_name');
    expect(updated.role).toBe('registrar');
  });
});

describe('user administration queries (integration)', () => {
  it('lists users ordered by full name', async () => {
    await createUser(9011, 'scholar');
    await createUser(9012, 'admin');
    await pool.query(`UPDATE users SET full_name = 'Zoe' WHERE telegram_id = 9012`);
    await pool.query(`UPDATE users SET full_name = 'Anna' WHERE telegram_id = 9011`);

    const users = await listUsers();

    expect(users.map((user) => user.fullName)).toEqual(['Anna', 'Zoe']);
  });

  it('gets a user by id and updates their role', async () => {
    const user = await createUser(9013, 'scholar');

    expect((await getUserById(user.id))?.role).toBe('scholar');

    const updated = await updateUserRole(user.id, 'faculty');

    expect(updated?.role).toBe('faculty');
    expect((await getUserById(user.id))?.role).toBe('faculty');
  });

  it('counts and locks admin rows inside a transaction', async () => {
    await createUser(9014, 'admin');
    await createUser(9015, 'admin');
    await createUser(9016, 'scholar');

    expect(await countAdmins()).toBe(2);

    const locked = await withTransaction((client) => lockAdminRows(client));
    expect(locked).toHaveLength(2);
  });
});
