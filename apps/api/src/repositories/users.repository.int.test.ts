import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { resetTestDatabase } from '../db/testing/test-database';
import { upsertByTelegram } from './users.repository';

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
