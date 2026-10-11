import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import { env } from '../config/env';
import pool from '../db/pool';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import {
  getContentPostById,
  insertContentPost,
  softDeleteContentPost,
  type InsertContentPostInput,
} from '../repositories/content.repository';

const TOKEN = 'test-internal-token';

const insertPost = (userId: string, overrides: Partial<InsertContentPostInput> = {}) =>
  insertContentPost({
    title: 'The Doctrine of Grace',
    disciplineTag: 'SystematicTheology',
    formatTag: 'ebook',
    cohortTag: 2025,
    postedBy: userId,
    driveLink: 'https://drive.google.com/file/d/abc/view',
    fileSizeBytes: null,
    stagedFileName: null,
    stagedMimeType: null,
    stagedOriginalName: null,
    ...overrides,
  });

const claim = (body: Record<string, unknown> = {}) =>
  request(app).post('/internal/content/claim').set('x-internal-token', TOKEN).send(body);

const confirm = (id: string, body: Record<string, unknown>) =>
  request(app)
    .post(`/internal/content/${id}/confirm`)
    .set('x-internal-token', TOKEN)
    .send(body);

let userId: string;

beforeEach(async () => {
  await resetTestDatabase();
  await mkdir(env.CONTENT_STAGING_DIR, { recursive: true });
  userId = (await createUser(8001, 'faculty')).id;
});

describe('POST /internal/content/claim', () => {
  it('returns queued publish tasks', async () => {
    await insertPost(userId);

    const res = await claim();
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ action: 'publish', title: 'The Doctrine of Grace' });
  });

  it('fails and audits a task whose staged file is missing instead of returning it', async () => {
    const post = await insertPost(userId, {
      driveLink: null,
      fileSizeBytes: 10,
      stagedFileName: 'missing-file',
      stagedMimeType: 'application/pdf',
      stagedOriginalName: 'book.pdf',
    });

    const res = await claim();
    expect(res.body.items).toHaveLength(0);

    const info = await getContentPostById(post.id);
    expect(info?.deliveryStatus).toBe('failed');

    const { rows } = await pool.query<{ action: string; details: { title?: string } }>(
      `SELECT action, details FROM audit_logs WHERE target_id = $1`,
      [post.id],
    );
    expect(rows.some((row) => row.action === 'content_delivery_failed')).toBe(true);
    expect(rows.find((row) => row.action === 'content_delivery_failed')?.details.title).toBe(
      'The Doctrine of Grace',
    );
  });

  it('requires the internal token', async () => {
    const res = await request(app).post('/internal/content/claim').send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /internal/content/:id/confirm', () => {
  it('stores the message id and clears the pending action on posted', async () => {
    const post = await insertPost(userId);

    const res = await confirm(post.id, { outcome: 'posted', telegramMessageId: 999 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deliveryStatus: 'posted' });

    const info = await getContentPostById(post.id);
    expect(info?.telegramMessageId).toBe(999);
    expect(info?.pendingAction).toBe('none');
    expect(info?.deliveryStatus).toBe('posted');
  });

  it('keeps a delete queued when a publish confirms after deletion (N3)', async () => {
    const post = await insertPost(userId);
    await claim();
    await softDeleteContentPost(post.id);

    const res = await confirm(post.id, { outcome: 'posted', telegramMessageId: 888 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deliveryStatus: 'pending' });

    const info = await getContentPostById(post.id);
    expect(info?.telegramMessageId).toBe(888);
    expect(info?.pendingAction).toBe('delete');
    expect(info?.deletedAt).not.toBeNull();

    const deleteClaim = await claim();
    expect(deleteClaim.body.items[0].action).toBe('delete');

    const deleted = await confirm(post.id, { outcome: 'deleted' });
    expect(deleted.body).toEqual({ deliveryStatus: 'posted', hardDeleted: true });
    expect(await getContentPostById(post.id)).toBeNull();
  });

  it('treats a repeated deleted confirmation as an idempotent no-op', async () => {
    const post = await insertPost(userId);
    await confirm(post.id, { outcome: 'deleted' });

    const again = await confirm(post.id, { outcome: 'deleted' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ deliveryStatus: 'posted', hardDeleted: true });
  });

  it('reschedules a retryable failure below the max attempts', async () => {
    const post = await insertPost(userId);
    await claim();

    const res = await confirm(post.id, { outcome: 'failed', error: 'boom' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deliveryStatus: 'pending' });

    const { rows } = await pool.query<{ delivery_status: string; next_attempt_at: Date | null }>(
      'SELECT delivery_status, next_attempt_at FROM content_posts WHERE id = $1',
      [post.id],
    );
    expect(rows[0].delivery_status).toBe('pending');
    expect(rows[0].next_attempt_at).not.toBeNull();
  });

  it('marks a task failed at the max attempts and audits it with the title', async () => {
    const post = await insertPost(userId);
    await pool.query(`UPDATE content_posts SET delivery_attempts = 4 WHERE id = $1`, [post.id]);
    await claim();

    const res = await confirm(post.id, { outcome: 'failed', error: 'permanent' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deliveryStatus: 'failed' });

    const info = await getContentPostById(post.id);
    expect(info?.deliveryStatus).toBe('failed');

    const { rows } = await pool.query<{ details: { error?: string } }>(
      `SELECT details FROM audit_logs WHERE target_id = $1 AND action = 'content_delivery_failed'`,
      [post.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].details.error).toBe('permanent');
  });

  it('rejects a malformed id', async () => {
    const res = await confirm('not-a-uuid', { outcome: 'posted', telegramMessageId: 1 });
    expect(res.status).toBe(400);
  });
});

describe('GET /internal/content/:id/download', () => {
  it('streams the staged bytes with the stored mime type and filename', async () => {
    const bytes = Buffer.from('hello world');
    await writeFile(join(env.CONTENT_STAGING_DIR, 'dl-file'), bytes);
    const post = await insertPost(userId, {
      driveLink: null,
      fileSizeBytes: bytes.length,
      stagedFileName: 'dl-file',
      stagedMimeType: 'application/pdf',
      stagedOriginalName: 'book.pdf',
    });

    const res = await request(app)
      .get(`/internal/content/${post.id}/download`)
      .set('x-internal-token', TOKEN)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('book.pdf');
    expect((res.body as Buffer).toString()).toBe('hello world');
  });

  it('404s a post with no staged file', async () => {
    const post = await insertPost(userId, { stagedFileName: 'gone' });
    const res = await request(app)
      .get(`/internal/content/${post.id}/download`)
      .set('x-internal-token', TOKEN);
    expect(res.status).toBe(404);
  });
});
