import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { submitRegistration } from '../services/registration.service';

const TOKEN = 'test-internal-token';

const recordBody = (overrides: Record<string, unknown> = {}) => ({
  telegramId: 555000111,
  telegramUsername: 'jane_doe',
  firstName: 'Jane',
  lastName: 'Doe',
  chatId: -1001234567890,
  joinRequestedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const registrationPayload = {
  fullName: 'Dev Scholar',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  email: 'dev@example.com',
  telegramUsername: 'dev_scholar',
  programTrack: 'Theology',
  declarationAccepted: true,
};

beforeEach(resetTestDatabase);

describe('POST /internal/join-requests', () => {
  it('returns 401 without the internal token', async () => {
    const res = await request(app).post('/internal/join-requests').send(recordBody());
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app)
      .post('/internal/join-requests')
      .set('x-internal-token', TOKEN)
      .send({ telegramId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('records a pending request and updates it in place on repeat', async () => {
    const first = await request(app)
      .post('/internal/join-requests')
      .set('x-internal-token', TOKEN)
      .send(recordBody());
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/internal/join-requests')
      .set('x-internal-token', TOKEN)
      .send(recordBody({ chatId: -100999 }));
    expect(second.status).toBe(201);

    const { rows } = await pool.query<{ status: string; chat_id: string }>(
      'SELECT status, chat_id FROM join_requests',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(Number(rows[0].chat_id)).toBe(-100999);
  });

  it('upserts the user but never overwrites an existing full_name', async () => {
    const user = await createUser(555000222, 'scholar');
    await pool.query('UPDATE users SET full_name = $2 WHERE id = $1', [user.id, 'DIBI Name']);

    await request(app)
      .post('/internal/join-requests')
      .set('x-internal-token', TOKEN)
      .send(recordBody({ telegramId: 555000222, firstName: 'Telegram', lastName: 'Handle' }));

    const { rows } = await pool.query<{ full_name: string }>(
      'SELECT full_name FROM users WHERE id = $1',
      [user.id],
    );
    expect(rows[0].full_name).toBe('DIBI Name');
  });
});

describe('registration enqueues delivery', () => {
  it('updates the open pending row and preserves chat_id', async () => {
    await request(app)
      .post('/internal/join-requests')
      .set('x-internal-token', TOKEN)
      .send(recordBody({ telegramId: 1111111111 }));
    const user = await createUser(1111111111, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active', userId: user.id });

    const result = await submitRegistration({ user, payload: registrationPayload });
    expect(result.decision).toBe('approved');

    const { rows } = await pool.query<{
      status: string;
      chat_id: string;
      delivery_status: string;
      delivery_attempts: number;
    }>('SELECT status, chat_id, delivery_status, delivery_attempts FROM join_requests WHERE user_id = $1', [
      user.id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('approved');
    expect(Number(rows[0].chat_id)).toBe(-1001234567890);
    expect(rows[0].delivery_status).toBe('pending');
    expect(rows[0].delivery_attempts).toBe(0);
  });

  it('inserts a decided row with a null chat_id when there is no open request', async () => {
    const user = await createUser(1111111112, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active', userId: user.id });

    await submitRegistration({ user, payload: registrationPayload });

    const { rows } = await pool.query<{ chat_id: string | null; delivery_status: string }>(
      'SELECT chat_id, delivery_status FROM join_requests WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0].chat_id).toBeNull();
    expect(rows[0].delivery_status).toBe('pending');
  });
});

describe('POST /internal/join-requests/claim', () => {
  it('returns 401 without the internal token', async () => {
    const res = await request(app).post('/internal/join-requests/claim').send({});
    expect(res.status).toBe(401);
  });

  it('leases a decided row, marking it processing and incrementing attempts', async () => {
    await request(app)
      .post('/internal/join-requests')
      .set('x-internal-token', TOKEN)
      .send(recordBody({ telegramId: 1111111113 }));
    const user = await createUser(1111111113, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active', userId: user.id });
    await submitRegistration({ user, payload: registrationPayload });

    const res = await request(app)
      .post('/internal/join-requests/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      decision: 'approved',
      telegramId: 1111111113,
      chatId: -1001234567890,
      attempts: 1,
    });
    expect(res.body.inviteLinkExpirySeconds).toBe(86400);

    const { rows } = await pool.query<{ delivery_status: string; delivery_attempts: number }>(
      'SELECT delivery_status, delivery_attempts FROM join_requests WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0].delivery_status).toBe('processing');
    expect(rows[0].delivery_attempts).toBe(1);
  });

  it('never double-claims under concurrency', async () => {
    const userA = await createUser(1111111114, 'scholar');
    const userB = await createUser(1111111115, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0501', status: 'active', userId: userA.id });
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active', userId: userB.id });
    await submitRegistration({
      user: userA,
      payload: { ...registrationPayload, registrationId: 'DIBI-THD-0501' },
    });
    await submitRegistration({ user: userB, payload: registrationPayload });

    const [a, b] = await Promise.all([
      request(app).post('/internal/join-requests/claim').set('x-internal-token', TOKEN).send({ limit: 1 }),
      request(app).post('/internal/join-requests/claim').set('x-internal-token', TOKEN).send({ limit: 1 }),
    ]);
    const ids = [...a.body.items, ...b.body.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reclaims a stale processing lease', async () => {
    const user = await createUser(1111111116, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active', userId: user.id });
    await submitRegistration({ user, payload: registrationPayload });

    await request(app)
      .post('/internal/join-requests/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 1 });
    await pool.query(
      "UPDATE join_requests SET delivery_claimed_at = now() - make_interval(secs => 3600) WHERE user_id = $1",
      [user.id],
    );

    const res = await request(app)
      .post('/internal/join-requests/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 1 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].attempts).toBe(2);
  });
});

describe('POST /internal/join-requests/:id/complete', () => {
  const seedClaimed = async (telegramId: number): Promise<string> => {
    const user = await createUser(telegramId, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active', userId: user.id });
    await submitRegistration({ user, payload: registrationPayload });
    const claim = await request(app)
      .post('/internal/join-requests/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 1 });
    return claim.body.items[0].id as string;
  };

  it('returns 400 for a non-uuid id', async () => {
    const res = await request(app)
      .post('/internal/join-requests/not-a-uuid/complete')
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'delivered' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .post('/internal/join-requests/00000000-0000-0000-0000-000000000000/complete')
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'delivered' });
    expect(res.status).toBe(404);
  });

  it('marks delivered and is idempotent', async () => {
    const id = await seedClaimed(1111111117);
    const first = await request(app)
      .post(`/internal/join-requests/${id}/complete`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'delivered' });
    expect(first.status).toBe(200);
    expect(first.body.deliveryStatus).toBe('delivered');

    const repeat = await request(app)
      .post(`/internal/join-requests/${id}/complete`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'delivered' });
    expect(repeat.status).toBe(200);
    expect(repeat.body.deliveryStatus).toBe('delivered');

    const { rows } = await pool.query<{ delivery_status: string; delivered_at: Date | null }>(
      'SELECT delivery_status, delivered_at FROM join_requests WHERE id = $1',
      [id],
    );
    expect(rows[0].delivery_status).toBe('delivered');
    expect(rows[0].delivered_at).not.toBeNull();
  });

  it('reschedules a failure below the attempt cap', async () => {
    const id = await seedClaimed(1111111118);
    const res = await request(app)
      .post(`/internal/join-requests/${id}/complete`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed', error: 'sendMessage failed' });
    expect(res.status).toBe(200);
    expect(res.body.deliveryStatus).toBe('pending');

    const { rows } = await pool.query<{ delivery_status: string; next_attempt_at: Date | null }>(
      'SELECT delivery_status, next_attempt_at FROM join_requests WHERE id = $1',
      [id],
    );
    expect(rows[0].delivery_status).toBe('pending');
    expect(rows[0].next_attempt_at).not.toBeNull();
  });

  it('terminates with an audit row once the attempt cap is reached', async () => {
    const id = await seedClaimed(1111111119);
    await pool.query('UPDATE join_requests SET delivery_attempts = 5 WHERE id = $1', [id]);

    const res = await request(app)
      .post(`/internal/join-requests/${id}/complete`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed', error: 'still failing' });
    expect(res.status).toBe(200);
    expect(res.body.deliveryStatus).toBe('failed');

    const { rows } = await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'join_request_delivery_failed'",
      [id],
    );
    expect(rows).toHaveLength(1);
  });

  it('stores an invite link exactly once across repeated completions', async () => {
    const id = await seedClaimed(1111111120);
    const body = {
      outcome: 'delivered',
      inviteLink: {
        link: 'https://t.me/+single-use-abc',
        expiresAt: '2026-01-02T00:00:00.000Z',
      },
    };
    const first = await request(app)
      .post(`/internal/join-requests/${id}/complete`)
      .set('x-internal-token', TOKEN)
      .send(body);
    expect(first.status).toBe(200);

    const repeat = await request(app)
      .post(`/internal/join-requests/${id}/complete`)
      .set('x-internal-token', TOKEN)
      .send(body);
    expect(repeat.status).toBe(200);

    const { rows } = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM invite_links WHERE link = 'https://t.me/+single-use-abc'",
    );
    expect(rows[0].count).toBe('1');
  });
});
