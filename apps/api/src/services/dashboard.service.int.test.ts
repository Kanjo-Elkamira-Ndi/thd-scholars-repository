import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertAuditLog } from '../repositories/audit-logs.repository';
import { insertContentPost } from '../repositories/content.repository';
import { getDashboard } from './dashboard.service';

beforeEach(resetTestDatabase);

const post = (postedBy: string, title: string) =>
  insertContentPost({
    title,
    disciplineTag: 'SystematicTheology',
    formatTag: 'ebook',
    cohortTag: null,
    postedBy,
    driveLink: null,
    fileSizeBytes: null,
    stagedFileName: null,
    stagedMimeType: null,
    stagedOriginalName: null,
  });

describe('dashboard service (integration)', () => {
  it('admin variant: active scholars, 30-day pending requests, reviews, discipline counts, trimmed activity', async () => {
    const admin = await createUser(9801, 'admin');
    const scholar = await createUser(9802, 'scholar');
    const other = await createUser(9803, 'scholar');
    await insertRosterRow({
      registrationId: 'DIBI-THD-9802',
      userId: scholar.id,
      status: 'graduated',
      accessReviewPending: true,
    });
    await insertRosterRow({ registrationId: 'DIBI-THD-9803', userId: other.id, status: 'active' });
    await pool.query(`INSERT INTO join_requests (user_id, status) VALUES ($1, 'pending')`, [
      other.id,
    ]);
    // pending but older than 30 days -> excluded
    const stale = await createUser(9804, 'scholar');
    await pool.query(
      `INSERT INTO join_requests (user_id, status, created_at) VALUES ($1, 'pending', now() - interval '40 days')`,
      [stale.id],
    );
    await post(admin.id, 'Lecture 1');
    await post(admin.id, 'Lecture 2');
    await insertAuditLog({
      actorUserId: admin.id,
      action: 'update_settings',
      targetType: 'settings',
      targetId: null,
      details: { secret: 'x' },
    });

    const payload = await getDashboard({ id: admin.id, role: 'admin' });

    expect(payload.role).toBe('admin');
    if (payload.role !== 'admin') throw new Error('unreachable');
    expect(payload.totalScholars).toBe(1);
    expect(payload.pendingJoinRequests).toBe(1);
    expect(payload.pendingAccessReviews).toBe(1);
    expect(payload.contentByDiscipline).toEqual([{ discipline: 'SystematicTheology', count: 2 }]);
    expect(payload.recentActivity).toHaveLength(1);
    expect(payload.recentActivity[0]).not.toHaveProperty('details');
    expect(Object.keys(payload.recentActivity[0]).sort()).toEqual(
      ['action', 'actorUserId', 'createdAt', 'targetType'].sort(),
    );
  });

  it('scholar variant: roster is the entry, recentContent only when active', async () => {
    const scholar = await createUser(9805, 'scholar');
    const faculty = await createUser(9806, 'faculty');
    await insertRosterRow({ registrationId: 'DIBI-THD-9805', userId: scholar.id, status: 'active' });
    await post(scholar.id, 'My note');
    const active = await getDashboard({ id: scholar.id, role: 'scholar' });
    expect(active.role).toBe('scholar');
    if (active.role !== 'scholar') throw new Error('unreachable');
    expect(active.roster?.status).toBe('active');
    expect(active.recentContent.map((p) => p.title)).toEqual(['My note']);

    // flip to pending -> recentContent must be empty on the next call
    await pool.query(`UPDATE roster SET status = 'pending' WHERE user_id = $1`, [scholar.id]);
    const pending = await getDashboard({ id: scholar.id, role: 'scholar' });
    if (pending.role !== 'scholar') throw new Error('unreachable');
    expect(pending.recentContent).toEqual([]);
    expect(faculty.role).toBe('faculty');
  });

  it('faculty variant: author-scoped counts and recent content', async () => {
    const faculty = await createUser(9807, 'faculty');
    await post(faculty.id, 'A');
    await post(faculty.id, 'B');
    await pool.query(`UPDATE content_posts SET delivery_status = 'failed' WHERE title = 'A'`);
    const payload = await getDashboard({ id: faculty.id, role: 'faculty' });
    if (payload.role !== 'faculty') throw new Error('unreachable');
    expect(payload.myContentCount).toBe(2);
    expect(payload.failedDeliveries).toBe(1);
    expect(payload.recentContent).toHaveLength(2);
  });

  it('registrar variant: totals and own pending reviews', async () => {
    const registrar = await createUser(9808, 'registrar');
    const otherAdmin = await createUser(9809, 'admin');
    const s1 = await createUser(9810, 'scholar');
    const s2 = await createUser(9811, 'scholar');
    await insertRosterRow({
      registrationId: 'DIBI-THD-9810',
      userId: s1.id,
      status: 'graduated',
      accessReviewPending: true,
      updatedBy: registrar.id,
    });
    await insertRosterRow({
      registrationId: 'DIBI-THD-9811',
      userId: s2.id,
      status: 'withdrawn',
      accessReviewPending: true,
      updatedBy: otherAdmin.id,
    });
    const payload = await getDashboard({ id: registrar.id, role: 'registrar' });
    if (payload.role !== 'registrar') throw new Error('unreachable');
    expect(payload.pendingAccessReviews).toBe(2);
    expect(payload.myPendingAccessReviews).toBe(1);
    expect(payload.totalScholars).toBe(0);
    expect(typeof payload.rosterAuditIssues).toBe('number');
  });
});
