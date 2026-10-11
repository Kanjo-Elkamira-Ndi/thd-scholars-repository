import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { insertAuditLog } from '../repositories/audit-logs.repository';
import { insertContentPost } from '../repositories/content.repository';
import { getDashboardStats } from './dashboard.service';

beforeEach(resetTestDatabase);

describe('dashboard service (integration)', () => {
  it('aggregates scholars, requests, reviews, content and recent activity', async () => {
    const admin = await createUser(9601, 'admin');
    const scholar = await createUser(9602, 'scholar');
    const other = await createUser(9603, 'scholar');
    await insertRosterRow({
      registrationId: 'DIBI-THD-9602',
      userId: scholar.id,
      status: 'graduated',
      accessReviewPending: true,
    });
    await insertRosterRow({ registrationId: 'DIBI-THD-9603', userId: other.id, status: 'active' });
    await pool.query(`INSERT INTO join_requests (user_id, status) VALUES ($1, 'pending')`, [other.id]);
    await insertContentPost({
      title: 'Lecture 1',
      disciplineTag: 'SystematicTheology',
      formatTag: 'audio_lecture',
      cohortTag: null,
      postedBy: admin.id,
      driveLink: null,
      fileSizeBytes: null,
      stagedFileName: null,
      stagedMimeType: null,
      stagedOriginalName: null,
    });
    await insertContentPost({
      title: 'Lecture 2',
      disciplineTag: 'SystematicTheology',
      formatTag: 'ebook',
      cohortTag: null,
      postedBy: admin.id,
      driveLink: null,
      fileSizeBytes: null,
      stagedFileName: null,
      stagedMimeType: null,
      stagedOriginalName: null,
    });
    await insertAuditLog({
      actorUserId: admin.id,
      action: 'update_settings',
      targetType: 'settings',
      targetId: null,
      details: null,
    });

    const stats = await getDashboardStats();

    expect(stats.totalScholars).toBe(2);
    expect(stats.pendingJoinRequests).toBe(1);
    expect(stats.pendingAccessReviews).toBe(1);
    expect(stats.contentByDiscipline).toEqual([{ discipline: 'SystematicTheology', count: 2 }]);
    expect(stats.recentActivity).toHaveLength(1);
    expect(stats.recentActivity[0].action).toBe('update_settings');
  });
});
