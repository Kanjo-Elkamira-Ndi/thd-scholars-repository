import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import {
  countByAuthor,
  countFailedByAuthor,
  insertContentPost,
  listRecentByAuthor,
} from './content.repository';
import { countPendingSince } from './join-requests.repository';
import { countAccessReviewPendingBy, countActiveScholars } from './roster.repository';

beforeEach(resetTestDatabase);

describe('dashboard aggregates (integration)', () => {
  it('counts only active roster rows as scholars', async () => {
    const a = await createUser(9701, 'scholar');
    const b = await createUser(9702, 'scholar');
    const c = await createUser(9703, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-9701', userId: a.id, status: 'active' });
    await insertRosterRow({ registrationId: 'DIBI-THD-9702', userId: b.id, status: 'graduated' });
    await insertRosterRow({ registrationId: 'DIBI-THD-9703', userId: c.id, status: 'pending' });
    expect(await countActiveScholars()).toBe(1);
  });

  it('counts pending access reviews by the acting user', async () => {
    const admin = await createUser(9704, 'admin');
    const other = await createUser(9705, 'admin');
    const s1 = await createUser(9706, 'scholar');
    const s2 = await createUser(9707, 'scholar');
    await insertRosterRow({
      registrationId: 'DIBI-THD-9706',
      userId: s1.id,
      status: 'graduated',
      accessReviewPending: true,
      updatedBy: admin.id,
    });
    await insertRosterRow({
      registrationId: 'DIBI-THD-9707',
      userId: s2.id,
      status: 'withdrawn',
      accessReviewPending: true,
      updatedBy: other.id,
    });
    expect(await countAccessReviewPendingBy(admin.id)).toBe(1);
  });

  it('counts join requests created since a cutoff', async () => {
    const u = await createUser(9708, 'scholar');
    await pool.query(
      `INSERT INTO join_requests (user_id, status, created_at) VALUES ($1, 'pending', now())`,
      [u.id],
    );
    expect(await countPendingSince(new Date(Date.now() - 1000))).toBe(1);
    expect(await countPendingSince(new Date(Date.now() + 1000))).toBe(0);
  });

  it('counts and lists content by author, excluding soft-deleted', async () => {
    const faculty = await createUser(9709, 'faculty');
    for (let i = 0; i < 3; i += 1) {
      await insertContentPost({
        title: `Post ${i}`,
        disciplineTag: 'SystematicTheology',
        formatTag: 'ebook',
        cohortTag: null,
        postedBy: faculty.id,
        driveLink: null,
        fileSizeBytes: null,
        stagedFileName: null,
        stagedMimeType: null,
        stagedOriginalName: null,
      });
    }
    await pool.query(
      `UPDATE content_posts SET deleted_at = now() WHERE posted_by = $1 AND title = 'Post 2'`,
      [faculty.id],
    );
    await pool.query(
      `UPDATE content_posts SET delivery_status = 'failed' WHERE posted_by = $1 AND title = 'Post 1'`,
      [faculty.id],
    );

    expect(await countByAuthor(faculty.id)).toBe(2);
    expect(await countFailedByAuthor(faculty.id)).toBe(1);
    const recent = await listRecentByAuthor(faculty.id, 10);
    expect(recent).toHaveLength(2);
    expect(recent[0].postedBy).toBe(faculty.id);
  });
});
