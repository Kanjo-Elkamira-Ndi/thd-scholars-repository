import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { resetTestDatabase } from '../db/testing/test-database';
import { createUser } from '../db/testing/fixtures';
import * as repo from './notifications.repository';

beforeEach(resetTestDatabase);

describe('notifications.repository', () => {
  it('inserts a pending notification and dedupes on (recipient, dedupe_key)', async () => {
    const user = await createUser(8101, 'admin');
    const first = await repo.insertNotification({
      recipientUserId: user.id,
      event: 'audit_flagged',
      payload: { total: 2 },
      dedupeKey: 'k1',
    });
    expect(first).not.toBeNull();
    expect(first?.status).toBe('pending');
    expect(first?.payload).toEqual({ total: 2 });

    const second = await repo.insertNotification({
      recipientUserId: user.id,
      event: 'audit_flagged',
      payload: { total: 2 },
      dedupeKey: 'k1',
    });
    expect(second).toBeNull();
  });

  it('resolves every admin and registrar recipient', async () => {
    await createUser(8102, 'admin');
    await createUser(8103, 'admin');
    await createUser(8104, 'registrar');
    await createUser(8105, 'scholar');
    const ids = await repo.findRecipientUserIds(['admin', 'registrar']);
    expect(ids).toHaveLength(3);
  });

  it('fans out one row per recipient for a shared dedupe key', async () => {
    await createUser(8106, 'admin');
    await createUser(8107, 'registrar');
    await createUser(8108, 'admin');
    const ids = await repo.findRecipientUserIds(['admin', 'registrar']);
    const inserted = await Promise.all(
      ids.map((id) =>
        repo.insertNotification({
          recipientUserId: id,
          event: 'repeated_registration_failure',
          payload: { failureCount: 3 },
          dedupeKey: 'repeated_failure:u:1',
        }),
      ),
    );
    expect(inserted.filter(Boolean)).toHaveLength(3);

    const again = await Promise.all(
      ids.map((id) =>
        repo.insertNotification({
          recipientUserId: id,
          event: 'repeated_registration_failure',
          payload: { failureCount: 3 },
          dedupeKey: 'repeated_failure:u:1',
        }),
      ),
    );
    expect(again.every((row) => row === null)).toBe(true);
    const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');
    expect(rows[0].count).toBe('3');
  });

  it('claims a batch, leases it, and exposes recipient role + telegram id', async () => {
    const admin = await createUser(8109, 'admin');
    await repo.insertNotification({
      recipientUserId: admin.id,
      event: 'audit_flagged',
      dedupeKey: 'k2',
    });
    const tasks = await repo.claimNotifications({ limit: 5, leaseSeconds: 120 });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ userId: admin.id, telegramId: 8109, recipientRole: 'admin', attempts: 1 });

    const { rows } = await pool.query<{ status: string }>('SELECT status FROM notifications');
    expect(rows[0].status).toBe('processing');
  });

  it('re-leases a stale processing row', async () => {
    const admin = await createUser(8110, 'admin');
    const row = await repo.insertNotification({
      recipientUserId: admin.id,
      event: 'audit_flagged',
      dedupeKey: 'k3',
    });
    await pool.query(
      `UPDATE notifications SET status = 'processing', claimed_at = now() - interval '10 minutes' WHERE id = $1`,
      [row!.id],
    );
    const tasks = await repo.claimNotifications({ limit: 5, leaseSeconds: 120 });
    expect(tasks.map((task) => task.id)).toContain(row!.id);
  });

  it('skips rows whose next_attempt_at is in the future, and marks sent/rescheduled/failed', async () => {
    const admin = await createUser(8111, 'admin');
    const row = await repo.insertNotification({
      recipientUserId: admin.id,
      event: 'audit_flagged',
      dedupeKey: 'k4',
    });
    await repo.rescheduleNotification(row!.id, {
      error: 'boom',
      nextAttemptAt: new Date(Date.now() + 60_000),
    });
    expect(await repo.claimNotifications({ limit: 5, leaseSeconds: 120 })).toHaveLength(0);

    const reloaded = await repo.getNotification(row!.id);
    expect(reloaded?.status).toBe('pending');
    expect(reloaded?.lastError).toBe('boom');

    await repo.markNotificationSent(row!.id);
    expect((await repo.getNotification(row!.id))?.sentAt).not.toBeNull();

    await repo.markNotificationFailed(row!.id, { error: 'gone' });
    expect((await repo.getNotification(row!.id))?.status).toBe('failed');
  });
});
