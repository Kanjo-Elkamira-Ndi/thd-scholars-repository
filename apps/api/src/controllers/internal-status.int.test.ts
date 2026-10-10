import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';

beforeEach(resetTestDatabase);

describe('GET /internal/users/:telegramId/status', () => {
  it('returns 401 without the internal token', async () => {
    const res = await request(app).get('/internal/users/111/status');
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric telegramId', async () => {
    const res = await request(app)
      .get('/internal/users/abc/status')
      .set('x-internal-token', 'test-internal-token');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown user', async () => {
    const res = await request(app)
      .get('/internal/users/9999999999/status')
      .set('x-internal-token', 'test-internal-token');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns { user, roster } for a known user', async () => {
    const user = await createUser(3333333333, 'scholar');
    const rosterId = await insertRosterRow({
      registrationId: 'DIBI-THD-0301',
      status: 'active',
      userId: user.id,
    });
    const res = await request(app)
      .get('/internal/users/3333333333/status')
      .set('x-internal-token', 'test-internal-token');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.roster.id).toBe(rosterId);
  });

  it('returns a null roster for a user with no roster entry', async () => {
    await createUser(4444444444, 'scholar');
    const res = await request(app)
      .get('/internal/users/4444444444/status')
      .set('x-internal-token', 'test-internal-token');
    expect(res.status).toBe(200);
    expect(res.body.roster).toBeNull();
  });
});
