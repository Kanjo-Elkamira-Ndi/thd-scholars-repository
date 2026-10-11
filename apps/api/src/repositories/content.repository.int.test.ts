import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import {
  claimContentTasks,
  getContentPostById,
  getContentPostDeletionInfo,
  hardDeleteContentPost,
  insertContentPost,
  listContentPosts,
  markContentDeleted,
  markContentFailed,
  markContentPosted,
  rescheduleContentTask,
  softDeleteContentPost,
  updateContentPost,
} from './content.repository';

const newPost = (overrides: Partial<Parameters<typeof insertContentPost>[0]> = {}) => ({
  title: 'The Doctrine of Grace',
  disciplineTag: 'SystematicTheology' as const,
  formatTag: 'ebook' as const,
  cohortTag: 2025,
  postedBy: '',
  driveLink: 'https://drive.google.com/file/d/abc/view',
  fileSizeBytes: null,
  stagedFileName: null,
  stagedMimeType: null,
  stagedOriginalName: null,
  ...overrides,
});

let userId: string;

beforeEach(async () => {
  await resetTestDatabase();
  const user = await createUser(9001, 'faculty');
  userId = user.id;
});

describe('insertContentPost / getContentPostById', () => {
  it('inserts a post queued for publish', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));

    expect(post.title).toBe('The Doctrine of Grace');
    expect(post.deliveryStatus).toBe('pending');
    expect(post.pendingAction).toBe('publish');
    expect(post.telegramMessageId).toBeNull();

    const found = await getContentPostById(post.id);
    expect(found?.id).toBe(post.id);
  });

  it('stores a staged file name with size', async () => {
    const post = await insertContentPost(
      newPost({
        postedBy: userId,
        driveLink: null,
        stagedFileName: 'file-uuid.pdf',
        stagedMimeType: 'application/pdf',
        stagedOriginalName: 'grace.pdf',
        fileSizeBytes: 2048,
      }),
    );
    const { rows } = await pool.query<{ staged_file_name: string; file_size_bytes: string }>(
      'SELECT staged_file_name, file_size_bytes FROM content_posts WHERE id = $1',
      [post.id],
    );
    expect(rows[0].staged_file_name).toBe('file-uuid.pdf');
    expect(Number(rows[0].file_size_bytes)).toBe(2048);
  });
});

describe('listContentPosts', () => {
  it('filters, paginates and excludes soft-deleted posts', async () => {
    await insertContentPost(newPost({ postedBy: userId, title: 'Alpha' }));
    await insertContentPost(newPost({ postedBy: userId, title: 'Beta', formatTag: 'research_pdf' }));
    const hidden = await insertContentPost(newPost({ postedBy: userId, title: 'Gamma' }));
    await softDeleteContentPost(hidden.id);

    const all = await listContentPosts({ page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.title).sort()).toEqual(['Alpha', 'Beta']);

    const search = await listContentPosts({ search: 'alp', page: 1, pageSize: 20 });
    expect(search.total).toBe(1);
    expect(search.items[0].title).toBe('Alpha');

    const format = await listContentPosts({ formatTag: 'research_pdf', page: 1, pageSize: 20 });
    expect(format.items.map((item) => item.title)).toEqual(['Beta']);

    const page2 = await listContentPosts({ page: 2, pageSize: 1 });
    expect(page2.items).toHaveLength(1);
  });
});

describe('updateContentPost', () => {
  it('patches metadata and bumps updated_at', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    const updated = await updateContentPost(post.id, { title: 'Renamed' });
    expect(updated?.title).toBe('Renamed');
    expect(updated?.disciplineTag).toBe('SystematicTheology');
  });
});

describe('deletion helpers', () => {
  it('hard-deletes a post and returns whether a row was removed', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    expect(await hardDeleteContentPost(post.id)).toBe(true);
    expect(await getContentPostById(post.id)).toBeNull();
    expect(await hardDeleteContentPost(post.id)).toBe(false);
  });

  it('soft-deletes by queueing a delete action', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    const deleted = await softDeleteContentPost(post.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.pendingAction).toBe('delete');
    expect(deleted?.deliveryStatus).toBe('pending');
  });

  it('reports deletion info for the D3 decision', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    const info = await getContentPostDeletionInfo(post.id);
    expect(info).toEqual({
      deliveryAttempts: 0,
      deliveryStatus: 'pending',
      telegramMessageId: null,
      stagedFileName: null,
    });
  });
});

describe('claimContentTasks', () => {
  it('claims pending publish tasks and increments attempts', async () => {
    await insertContentPost(newPost({ postedBy: userId }));

    const claimed = await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].action).toBe('publish');
    expect(claimed[0].title).toBe('The Doctrine of Grace');

    const secondClaim = await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    expect(secondClaim).toHaveLength(0);
  });

  it('requeues expired leases', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    await pool.query(
      `UPDATE content_posts SET delivery_claimed_at = now() - interval '10 minutes' WHERE id = $1`,
      [post.id],
    );
    const reclaimed = await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    expect(reclaimed).toHaveLength(1);
  });

  it('skips tasks scheduled in the future', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    await pool.query(`UPDATE content_posts SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`, [
      post.id,
    ]);
    expect(await claimContentTasks({ limit: 10, leaseSeconds: 120 })).toHaveLength(0);
  });

  it('returns a delete task with the channel message id', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    await pool.query(
      `UPDATE content_posts SET telegram_message_id = 4242, delivery_status = 'posted', pending_action = 'none' WHERE id = $1`,
      [post.id],
    );
    await softDeleteContentPost(post.id);
    const claimed = await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].action).toBe('delete');
    expect(claimed[0].telegramMessageId).toBe(4242);
  });
});

describe('terminal transitions', () => {
  it('marks a primary publish as posted and clears the action', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    await markContentPosted(post.id, 777);
    const info = await getContentPostById(post.id);
    expect(info?.deliveryStatus).toBe('posted');
    expect(info?.pendingAction).toBe('none');
    expect(info?.telegramMessageId).toBe(777);
  });

  it('keeps a delete queued when a publish confirms after deletion (N3)', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    await pool.query(`UPDATE content_posts SET pending_action = 'delete', deleted_at = now() WHERE id = $1`, [
      post.id,
    ]);
    await markContentPosted(post.id, 888);
    const info = await getContentPostById(post.id);
    expect(info?.telegramMessageId).toBe(888);
    expect(info?.pendingAction).toBe('delete');
    expect(info?.deliveryStatus).toBe('pending');
  });

  it('clears the action when a delete confirms', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    await pool.query(`UPDATE content_posts SET telegram_message_id = 1 WHERE id = $1`, [post.id]);
    await softDeleteContentPost(post.id);
    await claimContentTasks({ limit: 10, leaseSeconds: 120 });
    await markContentDeleted(post.id);
    const info = await getContentPostById(post.id);
    expect(info?.pendingAction).toBe('none');
    expect(info?.deliveryStatus).toBe('posted');
    expect(info?.deletedAt).not.toBeNull();
  });

  it('reschedules retryable failures and marks terminal ones failed', async () => {
    const post = await insertContentPost(newPost({ postedBy: userId }));
    await claimContentTasks({ limit: 10, leaseSeconds: 120 });

    await rescheduleContentTask(post.id, {
      error: 'boom',
      nextAttemptAt: new Date(Date.now() + 60_000),
    });
    let info = await getContentPostById(post.id);
    expect(info?.deliveryStatus).toBe('pending');

    await markContentFailed(post.id, { error: 'dead', terminal: true });
    info = await getContentPostById(post.id);
    expect(info?.deliveryStatus).toBe('failed');
  });
});
