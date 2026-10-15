import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { signInitData } from '../auth/telegram-init-data';

const auth = (telegramId: number) => ({
  authorization: `tma ${signInitData({ telegramId }, 'test-bot-token')}`,
});

const DRIVE_LINK = 'https://drive.google.com/file/d/abc/view';

const jsonPost = (overrides: Record<string, unknown> = {}) => ({
  title: 'The Doctrine of Grace',
  disciplineTag: 'SystematicTheology',
  formatTag: 'ebook',
  driveLink: DRIVE_LINK,
  ...overrides,
});

let facultyTg: number;
let otherFacultyTg: number;
let adminTg: number;
let scholarTg: number;
let facultyId: string;
let scholarId: string;

beforeEach(async () => {
  await resetTestDatabase();
  facultyTg = 7001;
  otherFacultyTg = 7002;
  adminTg = 7003;
  scholarTg = 7004;
  facultyId = (await createUser(facultyTg, 'faculty')).id;
  await createUser(otherFacultyTg, 'faculty');
  await createUser(adminTg, 'admin');
  scholarId = (await createUser(scholarTg, 'scholar')).id;
});

describe('auth + membership', () => {
  it('rejects unauthenticated list requests', async () => {
    const res = await request(app).get('/api/content');
    expect(res.status).toBe(401);
  });

  it('forbids a scholar with no active roster entry', async () => {
    const res = await request(app).get('/api/content').set(auth(scholarTg));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_VERIFIED');
  });

  it('allows a scholar with an active roster entry', async () => {
    await insertRosterRow({ registrationId: 'DIBI-THD-0001', status: 'active', userId: scholarId });

    const res = await request(app).get('/api/content').set(auth(scholarTg));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('lets faculty list without a roster entry', async () => {
    const res = await request(app).get('/api/content').set(auth(facultyTg));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/content', () => {
  it('creates a Drive-linked post', async () => {
    const res = await request(app).post('/api/content').set(auth(facultyTg)).send(jsonPost());
    expect(res.status).toBe(201);
    expect(res.body.contentPost).toMatchObject({
      title: 'The Doctrine of Grace',
      driveLink: DRIVE_LINK,
      pendingAction: 'publish',
      deliveryStatus: 'pending',
      postedBy: facultyId,
    });
  });

  it('rejects a non-Google drive link', async () => {
    const res = await request(app)
      .post('/api/content')
      .set(auth(facultyTg))
      .send(jsonPost({ driveLink: 'https://example.com/file/1' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a request with neither a file nor a link', async () => {
    const res = await request(app)
      .post('/api/content')
      .set(auth(facultyTg))
      .send({ title: 'No source', disciplineTag: 'SystematicTheology', formatTag: 'ebook' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a multipart request that supplies both a file and a link', async () => {
    const res = await request(app)
      .post('/api/content')
      .set(auth(facultyTg))
      .field('title', 'Both')
      .field('disciplineTag', 'SystematicTheology')
      .field('formatTag', 'ebook')
      .field('driveLink', DRIVE_LINK)
      .attach('file', Buffer.from('%PDF-1.7\nbody'), 'book.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a multipart file upload and stages it', async () => {
    const res = await request(app)
      .post('/api/content')
      .set(auth(facultyTg))
      .field('title', 'Staged Ebook')
      .field('disciplineTag', 'SystematicTheology')
      .field('formatTag', 'ebook')
      .attach('file', Buffer.from('%PDF-1.7\nbody of work'), 'book.pdf');

    expect(res.status).toBe(201);
    expect(res.body.contentPost.driveLink).toBeNull();
    const { rows } = await pool.query<{ staged_file_name: string | null }>(
      'SELECT staged_file_name FROM content_posts WHERE id = $1',
      [res.body.contentPost.id],
    );
    expect(rows[0].staged_file_name).toBeTruthy();
  });

  it('is forbidden to scholars', async () => {
    await insertRosterRow({ registrationId: 'DIBI-THD-1', status: 'active', userId: scholarId });
    const res = await request(app).post('/api/content').set(auth(scholarTg)).send(jsonPost());
    expect(res.status).toBe(403);
  });
});

describe('GET /api/content', () => {
  const create = async (overrides: Record<string, unknown>) =>
    request(app).post('/api/content').set(auth(facultyTg)).send(jsonPost(overrides));

  it('filters by discipline and searches titles', async () => {
    await create({ title: 'Alpha Grace', disciplineTag: 'SystematicTheology' });
    await create({ title: 'Beta Missions', disciplineTag: 'Missiology' });

    const byDiscipline = await request(app)
      .get('/api/content')
      .query({ discipline: 'Missiology' })
      .set(auth(facultyTg));
    expect(byDiscipline.body.total).toBe(1);
    expect(byDiscipline.body.items[0].title).toBe('Beta Missions');

    const bySearch = await request(app)
      .get('/api/content')
      .query({ search: 'grace' })
      .set(auth(facultyTg));
    expect(bySearch.body.total).toBe(1);
    expect(bySearch.body.items[0].title).toBe('Alpha Grace');
  });

  it('escapes ILIKE wildcards so they match literally', async () => {
    await create({ title: 'Plain Title' });
    const res = await request(app)
      .get('/api/content')
      .query({ search: '%' })
      .set(auth(facultyTg));
    expect(res.body.total).toBe(0);
  });

  it('paginates', async () => {
    await create({ title: 'One' });
    await create({ title: 'Two' });
    const res = await request(app)
      .get('/api/content')
      .query({ page: 1, pageSize: 1 })
      .set(auth(facultyTg));
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.pageSize).toBe(1);
  });

  it('mine=true returns only the caller posts', async () => {
    await create({ title: 'Mine' });
    await request(app)
      .post('/api/content')
      .set(auth(otherFacultyTg))
      .send(jsonPost({ title: 'Theirs' }));

    const res = await request(app)
      .get('/api/content')
      .query({ mine: 'true' })
      .set(auth(facultyTg));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe('Mine');
    expect(res.body.items[0].postedBy).toBe(facultyId);
  });

  it('mine=true combines with the search filter', async () => {
    await create({ title: 'Alpha Grace' });
    await create({ title: 'Beta Missions' });
    const res = await request(app)
      .get('/api/content')
      .query({ mine: 'true', search: 'grace' })
      .set(auth(facultyTg));
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe('Alpha Grace');
  });

  it('deliveryStatus=failed returns only failed deliveries for the caller', async () => {
    const failed = await create({ title: 'Failed one' });
    await create({ title: 'Posted one' });
    await pool.query(`UPDATE content_posts SET delivery_status = 'failed' WHERE id = $1`, [
      failed.body.contentPost.id,
    ]);

    const res = await request(app)
      .get('/api/content')
      .query({ mine: 'true', deliveryStatus: 'failed' })
      .set(auth(facultyTg));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe('Failed one');
  });

  it('rejects an unknown deliveryStatus with 400', async () => {
    const res = await request(app)
      .get('/api/content')
      .query({ deliveryStatus: 'bogus' })
      .set(auth(facultyTg));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-boolean mine value with 400', async () => {
    const res = await request(app)
      .get('/api/content')
      .query({ mine: 'maybe' })
      .set(auth(facultyTg));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/content/:id', () => {
  const create = async () => {
    const res = await request(app).post('/api/content').set(auth(facultyTg)).send(jsonPost());
    return res.body.contentPost.id as string;
  };

  it('lets the author patch and forbids another faculty member', async () => {
    const id = await create();

    const forbidden = await request(app)
      .patch(`/api/content/${id}`)
      .set(auth(otherFacultyTg))
      .send({ title: 'Hijacked' });
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .patch(`/api/content/${id}`)
      .set(auth(facultyTg))
      .send({ title: 'Author Rename' });
    expect(ok.status).toBe(200);
    expect(ok.body.contentPost.title).toBe('Author Rename');
  });

  it('lets an admin patch any post', async () => {
    const id = await create();
    const res = await request(app)
      .patch(`/api/content/${id}`)
      .set(auth(adminTg))
      .send({ title: 'Admin Rename' });
    expect(res.status).toBe(200);
    expect(res.body.contentPost.title).toBe('Admin Rename');
  });

  it('rejects a malformed id and 404s an unknown id', async () => {
    const bad = await request(app).patch('/api/content/not-a-uuid').set(auth(facultyTg)).send({ title: 'x' });
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .patch('/api/content/00000000-0000-0000-0000-000000000000')
      .set(auth(facultyTg))
      .send({ title: 'x' });
    expect(missing.status).toBe(404);
  });
});

describe('DELETE /api/content/:id', () => {
  it('hard-deletes a never-claimed post owned by the caller', async () => {
    const created = await request(app).post('/api/content').set(auth(facultyTg)).send(jsonPost());
    const id = created.body.contentPost.id as string;

    const res = await request(app).delete(`/api/content/${id}`).set(auth(facultyTg));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hardDeleted: true });

    const remaining = await pool.query('SELECT id FROM content_posts WHERE id = $1', [id]);
    expect(remaining.rowCount).toBe(0);
  });

  it('forbids another faculty member', async () => {
    const created = await request(app).post('/api/content').set(auth(facultyTg)).send(jsonPost());
    const id = created.body.contentPost.id as string;
    const res = await request(app).delete(`/api/content/${id}`).set(auth(otherFacultyTg));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/content/:id', () => {
  it('returns a contentPost envelope for a valid id', async () => {
    const created = await request(app).post('/api/content').set(auth(facultyTg)).send(jsonPost());
    const id = created.body.contentPost.id as string;

    const res = await request(app).get(`/api/content/${id}`).set(auth(facultyTg));
    expect(res.status).toBe(200);
    expect(res.body.contentPost).toMatchObject({ id, title: 'The Doctrine of Grace' });
  });

  it('rejects a malformed id and 404s an unknown id', async () => {
    const bad = await request(app).get('/api/content/not-a-uuid').set(auth(facultyTg));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const missing = await request(app)
      .get('/api/content/00000000-0000-0000-0000-000000000000')
      .set(auth(facultyTg));
    expect(missing.status).toBe(404);
  });

  it('404s a soft-deleted post', async () => {
    const created = await request(app).post('/api/content').set(auth(facultyTg)).send(jsonPost());
    const id = created.body.contentPost.id as string;
    await pool.query('UPDATE content_posts SET deleted_at = now() WHERE id = $1', [id]);

    const res = await request(app).get(`/api/content/${id}`).set(auth(facultyTg));
    expect(res.status).toBe(404);
  });

  it('requires an active membership for scholars', async () => {
    const res = await request(app)
      .get('/api/content/00000000-0000-0000-0000-000000000000')
      .set(auth(scholarTg));
    expect(res.status).toBe(403);
  });
});
