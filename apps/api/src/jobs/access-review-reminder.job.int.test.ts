import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { accessReviewReminderJob } from './access-review-reminder.job';
import { runJob } from './run-job';

beforeEach(resetTestDatabase);

describe('accessReviewReminderJob', () => {
  it('writes nothing when no access review is pending', async () => {
    await createUser(8501, 'admin');
    await insertRosterRow({ registrationId: 'DIBI-THD-8501', accessReviewPending: false });

    const result = await runJob(accessReviewReminderJob);
    expect(result.status).toBe('completed');
    const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');
    expect(rows[0].count).toBe('0');
  });

  it('reminds every admin once per (deduped) week when items are pending', async () => {
    await createUser(8502, 'admin');
    await createUser(8503, 'admin');
    await insertRosterRow({ registrationId: 'DIBI-THD-8502', accessReviewPending: true });
    await insertRosterRow({ registrationId: 'DIBI-THD-8503', accessReviewPending: true });

    await runJob(accessReviewReminderJob);
    const { rows } = await pool.query<{ event: string; payload: { count: number }; count: string }>(
      `SELECT event, payload, count(*) OVER ()::text AS count FROM notifications`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ event: 'access_review_reminder', payload: { count: 2 } });

    const second = await runJob(accessReviewReminderJob);
    expect(second.status).toBe('skipped');
  });
});
