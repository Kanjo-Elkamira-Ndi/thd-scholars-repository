import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import { signInitData } from '../auth/telegram-init-data';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';

const auth = (telegramId: number) => ({
  authorization: `tma ${signInitData({ telegramId }, 'test-bot-token')}`,
});

const adminOnly = [
  ['get', '/api/users'],
  ['get', '/api/audit-logs'],
  ['get', '/api/settings'],
  ['get', '/api/members'],
] as const;

let adminTg: number;
let registrarTg: number;
let scholarTg: number;
let facultyTg: number;
let scholarId: string;

beforeEach(async () => {
  await resetTestDatabase();
  adminTg = 8001;
  registrarTg = 8002;
  scholarTg = 8003;
  facultyTg = 8004;
  await createUser(adminTg, 'admin');
  await createUser(registrarTg, 'registrar');
  scholarId = (await createUser(scholarTg, 'scholar')).id;
  await createUser(facultyTg, 'faculty');
});

describe('admin endpoints auth truth table', () => {
  it('rejects unauthenticated requests with 401', async () => {
    for (const [method, path] of adminOnly) {
      const res = await request(app)[method](path);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
    const audit = await request(app).get('/api/roster/audit');
    expect(audit.status).toBe(401);
  });

  it('forbids scholars and faculty from admin-only endpoints', async () => {
    for (const tg of [scholarTg, facultyTg]) {
      for (const [method, path] of adminOnly) {
        const res = await request(app)[method](path).set(auth(tg));
        expect(res.status, `${method} ${path} as ${tg}`).toBe(403);
      }
    }
  });

  it('forbids registrars from admin-only endpoints', async () => {
    for (const [method, path] of adminOnly) {
      const res = await request(app)[method](path).set(auth(registrarTg));
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('forbids scholars and faculty from roster audit', async () => {
    for (const tg of [scholarTg, facultyTg]) {
      const res = await request(app).get('/api/roster/audit').set(auth(tg));
      expect(res.status).toBe(403);
    }
  });

  it('allows an admin through admin-only endpoints', async () => {
    for (const [method, path] of adminOnly) {
      const res = await request(app)[method](path).set(auth(adminTg));
      expect(res.status, `${method} ${path}`).toBe(200);
    }
  });

  it('allows registrar and admin through roster audit', async () => {
    for (const tg of [registrarTg, adminTg]) {
      const res = await request(app).get('/api/roster/audit').set(auth(tg));
      expect(res.status, `${tg}`).toBe(200);
    }
  });
});

describe('PATCH /api/users/:id/role', () => {
  it('rejects changing your own role with 400', async () => {
    const me = await request(app).get('/api/users').set(auth(adminTg));
    const self = me.body.users.find(
      (u: { telegramId: number }) => u.telegramId === adminTg,
    );
    const res = await request(app)
      .patch(`/api/users/${self.id}/role`)
      .set(auth(adminTg))
      .send({ role: 'scholar' });
    expect(res.status).toBe(400);
  });

  it('demotes another admin when an admin remains', async () => {
    const otherAdmin = await createUser(8099, 'admin');
    const res = await request(app)
      .patch(`/api/users/${otherAdmin.id}/role`)
      .set(auth(adminTg))
      .send({ role: 'faculty' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('faculty');
  });

  it('promotes a scholar to faculty', async () => {
    const res = await request(app)
      .patch(`/api/users/${scholarId}/role`)
      .set(auth(adminTg))
      .send({ role: 'faculty' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('faculty');
  });
});

describe('POST /api/members/:userId/remove', () => {
  it('lets an admin queue a removal with 202 and is idempotent', async () => {
    const first = await request(app)
      .post(`/api/members/${scholarId}/remove`)
      .set(auth(adminTg))
      .send({ reason: 'policy violation' });
    expect(first.status).toBe(202);
    expect(first.body.created).toBe(true);

    const second = await request(app)
      .post(`/api/members/${scholarId}/remove`)
      .set(auth(adminTg))
      .send({});
    expect(second.status).toBe(202);
    expect(second.body.created).toBe(false);
    expect(second.body.removal.id).toBe(first.body.removal.id);
  });

  it('rejects a registrar removing a scholar they did not flag with 403', async () => {
    await insertRosterRow({
      registrationId: 'DIBI-THD-8003',
      userId: scholarId,
      status: 'graduated',
    });
    const res = await request(app)
      .post(`/api/members/${scholarId}/remove`)
      .set(auth(registrarTg))
      .send({ reason: 'nope' });
    expect(res.status).toBe(403);
  });

  it('lets the flagging registrar remove their own flagged scholar', async () => {
    const me = await request(app)
      .get('/api/users')
      .set(auth(adminTg));
    const registrar = me.body.users.find(
      (u: { telegramId: number }) => u.telegramId === registrarTg,
    );
    await insertRosterRow({
      registrationId: 'DIBI-THD-8003',
      userId: scholarId,
      status: 'graduated',
      updatedBy: registrar.id,
      accessReviewPending: true,
    });
    const res = await request(app)
      .post(`/api/members/${scholarId}/remove`)
      .set(auth(registrarTg))
      .send({ reason: 'access review' });
    expect(res.status).toBe(202);
    expect(res.body.removal.initiatedByRole).toBe('registrar');
  });
});
