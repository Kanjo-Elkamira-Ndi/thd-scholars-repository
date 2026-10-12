import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { resetTestDatabase } from '../db/testing/test-database';
import * as repo from './job-runs.repository';

beforeEach(resetTestDatabase);

const claim = (runKey: string, staleMinutes = 30) =>
  repo.claimJobRun({ job: 'quarterly_audit', runKey, staleMinutes });

describe('job-runs.repository', () => {
  it('claims a fresh run and completes it', async () => {
    const first = await claim('2026-Q4');
    expect(first).not.toBeNull();
    await repo.completeJobRun(first!.id, { total: 3 });
    expect(await claim('2026-Q4')).toBeNull();
    const { rows } = await pool.query<{ status: string; details: { total: number } }>(
      `SELECT status, details FROM job_runs WHERE id = $1`,
      [first!.id],
    );
    expect(rows[0].status).toBe('completed');
    expect(rows[0].details).toEqual({ total: 3 });
  });

  it('skips a fresh started run but takes over a stale one', async () => {
    const first = await claim('2026-Q4');
    expect(await claim('2026-Q4')).toBeNull();

    await pool.query(`UPDATE job_runs SET started_at = now() - interval '45 minutes' WHERE id = $1`, [
      first!.id,
    ]);
    const retaken = await claim('2026-Q4');
    expect(retaken?.id).toBe(first!.id);
  });

  it('retakes a failed run', async () => {
    const first = await claim('2026-Q4');
    await repo.failJobRun(first!.id, { error: 'boom' });
    const retaken = await claim('2026-Q4');
    expect(retaken?.id).toBe(first!.id);
    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM job_runs WHERE id = $1`,
      [first!.id],
    );
    expect(rows[0].status).toBe('started');
  });
});
