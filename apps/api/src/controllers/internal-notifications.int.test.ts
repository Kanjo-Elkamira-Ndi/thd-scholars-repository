import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import pool from '../db/pool';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertNotification } from '../repositories/notifications.repository';

const TOKEN = 'test-internal-token';

beforeEach(resetTestDatabase);

describe('internal notifications auth', () => {
  it('returns 401 without the internal token', async () => {
    const calls = [
      request(app).post('/internal/notifications/claim').send({}),
      request(app)
        .post('/internal/notifications/00000000-0000-0000-0000-000000000000/confirm')
        .send({ outcome: 'sent' }),
    ];
    for (const call of calls) {
      const res = await call;
      expect(res.status).toBe(401);
    }
  });
});

describe('POST /internal/notifications/claim', () => {
  it('claims pending notifications with recipient role and telegram id', async () => {
    const admin = await createUser(9101, 'admin');
    await insertNotification({
      recipientUserId: admin.id,
      event: 'audit_flagged',
      payload: { total: 2 },
      dedupeKey: 'k1',
    });

    const res = await request(app)
      .post('/internal/notifications/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      userId: admin.id,
      telegramId: 9101,
      recipientRole: 'admin',
      event: 'audit_flagged',
      payload: { total: 2 },
      attempts: 1,
    });
  });

  it('validates the limit', async () => {
    const res = await request(app)
      .post('/internal/notifications/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 0 });
    expect(res.status).toBe(400);
  });
});

describe('POST /internal/notifications/:id/confirm', () => {
  it('marks a successful delivery as sent', async () => {
    const admin = await createUser(9102, 'admin');
    const row = await insertNotification({
      recipientUserId: admin.id,
      event: 'audit_flagged',
      dedupeKey: 'k2',
    });
    await request(app)
      .post('/internal/notifications/claim')
      .set('x-internal-token', TOKEN)
      .send({});

    const res = await request(app)
      .post(`/internal/notifications/${row!.id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'sent' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
    const { rows } = await pool.query<{ status: string; sent_at: Date | null }>(
      'SELECT status, sent_at FROM notifications WHERE id = $1',
      [row!.id],
    );
    expect(rows[0].status).toBe('sent');
    expect(rows[0].sent_at).not.toBeNull();
  });

  it('reschedules a retryable failure and permanently fails a terminal one', async () => {
    const admin = await createUser(9103, 'admin');
    const retryable = await insertNotification({
      recipientUserId: admin.id,
      event: 'audit_flagged',
      dedupeKey: 'k3',
    });
    const terminal = await insertNotification({
      recipientUserId: admin.id,
      event: 'role_changed',
      dedupeKey: 'k4',
    });
    await request(app)
      .post('/internal/notifications/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 10 });

    const retry = await request(app)
      .post(`/internal/notifications/${retryable!.id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed', error: 'timeout' });
    expect(retry.body.status).toBe('pending');

    const gone = await request(app)
      .post(`/internal/notifications/${terminal!.id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed', error: 'bot blocked', terminal: true });
    expect(gone.body.status).toBe('failed');
  });

  it('fails permanently once attempts are exhausted, and is idempotent', async () => {
    const admin = await createUser(9104, 'admin');
    const row = await insertNotification({
      recipientUserId: admin.id,
      event: 'role_changed',
      dedupeKey: 'k5',
    });
    await pool.query('UPDATE notifications SET attempts = 5 WHERE id = $1', [row!.id]);
    await request(app)
      .post('/internal/notifications/claim')
      .set('x-internal-token', TOKEN)
      .send({});

    const res = await request(app)
      .post(`/internal/notifications/${row!.id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed', error: 'still failing' });
    expect(res.body.status).toBe('failed');

    const again = await request(app)
      .post(`/internal/notifications/${row!.id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'sent' });
    expect(again.body.status).toBe('failed');
  });

  it('requires an error when the outcome is failed', async () => {
    const admin = await createUser(9105, 'admin');
    const row = await insertNotification({
      recipientUserId: admin.id,
      event: 'audit_flagged',
      dedupeKey: 'k6',
    });
    const res = await request(app)
      .post(`/internal/notifications/${row!.id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed' });
    expect(res.status).toBe(400);
  });
});
