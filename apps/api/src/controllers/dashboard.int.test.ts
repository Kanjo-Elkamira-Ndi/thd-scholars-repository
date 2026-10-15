import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import { signInitData } from '../auth/telegram-init-data';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertContentPost } from '../repositories/content.repository';

const auth = (telegramId: number) => ({
  authorization: `tma ${signInitData({ telegramId }, 'test-bot-token')}`,
});

let adminTg: number;
let registrarTg: number;
let scholarTg: number;
let facultyTg: number;

beforeEach(async () => {
  await resetTestDatabase();
  adminTg = 8101;
  registrarTg = 8102;
  scholarTg = 8103;
  facultyTg = 8104;
  await createUser(adminTg, 'admin');
  await createUser(registrarTg, 'registrar');
  await createUser(scholarTg, 'scholar');
  await createUser(facultyTg, 'faculty');
});

describe('GET /api/dashboard', () => {
  it('returns a scholar payload for a scholar token', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(scholarTg));
    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('scholar');
    expect(res.body.dashboard.recentContent).toEqual([]);
  });

  it('scholar recentContent is empty unless the roster is active', async () => {
    const me = await request(app).get('/api/dashboard').set(auth(scholarTg));
    expect(me.body.dashboard.roster).toBeNull();

    const scholar = await createUser(8199, 'scholar');
    await insertRosterRow({
      registrationId: 'DIBI-THD-8199',
      userId: scholar.id,
      status: 'active',
    });
    await insertContentPost({
      title: 'My note',
      disciplineTag: 'SystematicTheology',
      formatTag: 'ebook',
      cohortTag: null,
      postedBy: scholar.id,
      driveLink: null,
      fileSizeBytes: null,
      stagedFileName: null,
      stagedMimeType: null,
      stagedOriginalName: null,
    });
    const res = await request(app).get('/api/dashboard').set(auth(8199));
    expect(res.status).toBe(200);
    expect(res.body.dashboard.roster.status).toBe('active');
    expect(res.body.dashboard.recentContent.map((p: { title: string }) => p.title)).toEqual([
      'My note',
    ]);
  });

  it('returns a faculty payload for a faculty token', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(facultyTg));
    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('faculty');
    expect(res.body.dashboard.myContentCount).toBe(0);
  });

  it('returns a registrar payload for a registrar token', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(registrarTg));
    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('registrar');
    expect(res.body.dashboard.myPendingAccessReviews).toBe(0);
  });

  it('returns an admin payload for an admin token', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(adminTg));
    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('admin');
    expect(res.body.dashboard.contentByDiscipline).toEqual([]);
    expect(res.body.dashboard.recentActivity).toEqual([]);
  });

  it('ignores a role query/body override from a scholar', async () => {
    const res = await request(app)
      .get('/api/dashboard?role=admin')
      .set(auth(scholarTg))
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('scholar');
  });

  it('404s the removed /api/dashboard/stats for an admin', async () => {
    const res = await request(app).get('/api/dashboard/stats').set(auth(adminTg));
    expect(res.status).toBe(404);
  });

  it('401s without a token', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });
});
