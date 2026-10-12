import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { resetTestDatabase } from '../db/testing/test-database';
import { createUser } from '../db/testing/fixtures';
import {
  enqueueNotification,
  notify,
  notifyRepeatedRegistrationFailure,
  notifyRoleChanged,
} from './notifications.service';

beforeEach(resetTestDatabase);

const countRows = async (): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');
  return Number(rows[0].count);
};

describe('notifications.service', () => {
  it('alerts every admin and registrar once per window, and is idempotent', async () => {
    await createUser(8201, 'admin');
    await createUser(8202, 'admin');
    await createUser(8203, 'admin');
    await createUser(8204, 'registrar');
    await createUser(8205, 'registrar');

    const first = await notifyRepeatedRegistrationFailure({
      userId: '00000000-0000-0000-0000-000000000001',
      telegramId: 999,
      failureCount: 3,
    });
    expect(first).toBe(5);
    expect(await countRows()).toBe(5);

    const second = await notifyRepeatedRegistrationFailure({
      userId: '00000000-0000-0000-0000-000000000001',
      telegramId: 999,
      failureCount: 3,
    });
    expect(second).toBe(0);
    expect(await countRows()).toBe(5);
  });

  it('gives each notifyRoleChanged and notify call a unique dedupe key', async () => {
    const user = await createUser(8206, 'faculty');
    await notifyRoleChanged(user.id, 'faculty', 'registrar');
    await notifyRoleChanged(user.id, 'faculty', 'registrar');
    await notify(user.id, 'member_removal_requested', { initiatedByRole: 'admin' });
    await notify(user.id, 'member_removal_requested', { initiatedByRole: 'admin' });
    expect(await countRows()).toBe(4);
  });

  it('stores no PII in notification payloads', async () => {
    const admin = await createUser(8207, 'admin');
    await notifyRoleChanged(admin.id, 'scholar', 'admin');
    await notifyRepeatedRegistrationFailure({
      userId: '00000000-0000-0000-0000-000000000002',
      telegramId: 111,
      failureCount: 4,
    });
    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      'SELECT payload FROM notifications',
    );
    const forbidden = ['full_name', 'fullName', 'email', 'telegram_username', 'telegramUsername', 'registration_id', 'registrationId'];
    for (const row of rows) {
      for (const key of Object.keys(row.payload)) {
        expect(forbidden).not.toContain(key);
      }
    }
  });

  it('rejects unknown events at the DB boundary', async () => {
    const admin = await createUser(8208, 'admin');
    await expect(
      enqueueNotification({
        recipientUserId: admin.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: 'not_real' as any,
        dedupeKey: 'x',
      }),
    ).rejects.toThrow();
  });
});
