import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../pool';
import { resetTestDatabase } from '../testing/test-database';
import { createUser } from '../testing/fixtures';

beforeEach(resetTestDatabase);

describe('migration 0011 jobs & notifications', () => {
  it('creates the notifications and job_runs tables', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('notifications', 'job_runs')
        ORDER BY table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual(['job_runs', 'notifications']);
  });

  it('enforces the (recipient_user_id, dedupe_key) uniqueness', async () => {
    const user = await createUser(8001, 'admin');
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, event, dedupe_key)
       VALUES ($1, 'audit_flagged', 'k1')`,
      [user.id],
    );
    await expect(
      pool.query(
        `INSERT INTO notifications (recipient_user_id, event, dedupe_key)
         VALUES ($1, 'audit_flagged', 'k1')`,
        [user.id],
      ),
    ).rejects.toThrow();

    const other = await createUser(8002, 'registrar');
    await expect(
      pool.query(
        `INSERT INTO notifications (recipient_user_id, event, dedupe_key)
         VALUES ($1, 'audit_flagged', 'k1')`,
        [other.id],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects unknown notification events and statuses', async () => {
    const user = await createUser(8003, 'admin');
    await expect(
      pool.query(
        `INSERT INTO notifications (recipient_user_id, event, dedupe_key)
         VALUES ($1, 'not_a_real_event', 'k')`,
        [user.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO notifications (recipient_user_id, event, dedupe_key, status)
         VALUES ($1, 'audit_flagged', 'k', 'nope')`,
        [user.id],
      ),
    ).rejects.toThrow();
  });

  it('enforces the (job, run_key) uniqueness on job_runs', async () => {
    await pool.query(`INSERT INTO job_runs (job, run_key) VALUES ('quarterly_audit', '2026-Q4')`);
    await expect(
      pool.query(`INSERT INTO job_runs (job, run_key) VALUES ('quarterly_audit', '2026-Q4')`),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO job_runs (job, run_key) VALUES ('access_review_reminder', '2026-Q4')`,
      ),
    ).resolves.toBeDefined();
  });
});
