import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { getMembershipForUser } from '../repositories/channel-membership.repository';
import { insertMemberRemoval } from '../repositories/member-removals.repository';
import { submitRegistration } from '../services/registration.service';

const TOKEN = 'test-internal-token';

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

describe('internal members endpoints auth', () => {
  it('returns 401 without the internal token', async () => {
    const calls = [
      request(app).get('/internal/members/reconcile-targets'),
      request(app).put('/internal/members/snapshot').send({ members: [] }),
      request(app).post('/internal/members/removals/claim').send({}),
      request(app).post(
        '/internal/members/removals/00000000-0000-0000-0000-000000000000/confirm',
      ).send({ outcome: 'removed' }),
    ];
    for (const call of calls) {
      const res = await call;
      expect(res.status).toBe(401);
    }
  });
});

describe('GET /internal/members/reconcile-targets', () => {
  it('lists users with their telegram ids', async () => {
    const user = await createUser(9001, 'scholar');
    const res = await request(app)
      .get('/internal/members/reconcile-targets')
      .set('x-internal-token', TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.targets).toContainEqual({ userId: user.id, telegramId: 9001 });
  });
});

describe('PUT /internal/members/snapshot', () => {
  it('upserts only known telegram ids', async () => {
    const user = await createUser(9002, 'scholar');
    const res = await request(app)
      .put('/internal/members/snapshot')
      .set('x-internal-token', TOKEN)
      .send({
        members: [
          { telegramId: 9002, isMember: true, memberStatus: 'member' },
          { telegramId: 999999, isMember: true, memberStatus: 'member' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    const membership = await getMembershipForUser(user.id);
    expect(membership?.isMember).toBe(true);
    expect(membership?.memberStatus).toBe('member');
  });

  it('accepts an empty snapshot', async () => {
    const res = await request(app)
      .put('/internal/members/snapshot')
      .set('x-internal-token', TOKEN)
      .send({ members: [] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);
  });
});

describe('POST /internal/members/removals/claim', () => {
  it('leases an admin-initiated removal and maps the telegram id', async () => {
    const admin = await createUser(9003, 'admin');
    const scholar = await createUser(9004, 'scholar');
    await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: admin.id,
      initiatedByRole: 'admin',
      reason: null,
    });

    const res = await request(app)
      .post('/internal/members/removals/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ userId: scholar.id, telegramId: 9004, attempts: 1 });
  });

  it('never double-claims a removal under concurrency', async () => {
    const admin = await createUser(9004, 'admin');
    const scholar = await createUser(9005, 'scholar');
    await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: admin.id,
      initiatedByRole: 'admin',
      reason: null,
    });

    const [a, b] = await Promise.all([
      request(app)
        .post('/internal/members/removals/claim')
        .set('x-internal-token', TOKEN)
        .send({ limit: 1 }),
      request(app)
        .post('/internal/members/removals/claim')
        .set('x-internal-token', TOKEN)
        .send({ limit: 1 }),
    ]);
    const ids = [...a.body.items, ...b.body.items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('POST /internal/members/removals/:id/confirm', () => {
  const seedClaimed = async (): Promise<{ id: string; userId: string }> => {
    const admin = await createUser(9004, 'admin');
    const scholar = await createUser(9005, 'scholar');
    const { removal } = await insertMemberRemoval({
      userId: scholar.id,
      requestedBy: admin.id,
      initiatedByRole: 'admin',
      reason: null,
    });
    await request(app)
      .post('/internal/members/removals/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 1 });
    return { id: removal.id, userId: scholar.id };
  };

  it('marks done and clears membership on success', async () => {
    const { id, userId } = await seedClaimed();
    const res = await request(app)
      .post(`/internal/members/removals/${id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'removed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM member_removals WHERE id = $1',
      [id],
    );
    expect(rows[0].status).toBe('done');
    const membership = await getMembershipForUser(userId);
    expect(membership?.isMember).toBe(false);
  });

  it('reschedules a failure below the attempt cap', async () => {
    const { id } = await seedClaimed();
    const res = await request(app)
      .post(`/internal/members/removals/${id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed', error: 'banChatMember failed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');

    const { rows } = await pool.query<{ status: string; next_attempt_at: Date | null }>(
      'SELECT status, next_attempt_at FROM member_removals WHERE id = $1',
      [id],
    );
    expect(rows[0].status).toBe('pending');
    expect(rows[0].next_attempt_at).not.toBeNull();
  });

  it('terminates with an audit row at the attempt cap', async () => {
    const { id } = await seedClaimed();
    await pool.query('UPDATE member_removals SET delivery_attempts = 5 WHERE id = $1', [id]);

    const res = await request(app)
      .post(`/internal/members/removals/${id}/confirm`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'failed', error: 'still failing' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');

    const { rows } = await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'member_removal_failed'",
      [id],
    );
    expect(rows).toHaveLength(1);
  });

  it('returns 404 for an unknown removal', async () => {
    const res = await request(app)
      .post('/internal/members/removals/00000000-0000-0000-0000-000000000000/confirm')
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'removed' });
    expect(res.status).toBe(404);
  });
});

describe('membership freshness', () => {
  it('marks membership true when a join request is delivered', async () => {
    const user = await createUser(9006, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active', userId: user.id });
    await submitRegistration({ user, payload: registrationPayload });

    const claim = await request(app)
      .post('/internal/join-requests/claim')
      .set('x-internal-token', TOKEN)
      .send({ limit: 1 });
    const id = claim.body.items[0].id as string;

    await request(app)
      .post(`/internal/join-requests/${id}/complete`)
      .set('x-internal-token', TOKEN)
      .send({ outcome: 'delivered' });

    const membership = await getMembershipForUser(user.id);
    expect(membership?.isMember).toBe(true);
  });
});
