import { beforeEach, describe, expect, it, vi } from 'vitest';
import pool from '../db/pool';
import { resetTestDatabase } from '../db/testing/test-database';
import { runJob, type JobDefinition } from './run-job';

beforeEach(resetTestDatabase);

const makeJob = (over: Partial<JobDefinition> & { runKey: () => string }): JobDefinition => ({
  name: 'test_job',
  run: vi.fn().mockResolvedValue({ details: { ok: true } }),
  ...over,
});

describe('runJob', () => {
  it('claims, runs, and completes a job', async () => {
    const run = vi.fn().mockResolvedValue({ details: { total: 4 } });
    const result = await runJob(makeJob({ runKey: () => 'r1', run }));
    expect(result.status).toBe('completed');
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ runKey: 'r1' }));

    const { rows } = await pool.query<{ status: string; details: { total: number } }>(
      `SELECT status, details FROM job_runs WHERE run_key = 'r1'`,
    );
    expect(rows[0]).toEqual({ status: 'completed', details: { total: 4 } });
  });

  it('skips when the run key is already completed', async () => {
    const first = vi.fn().mockResolvedValue({ details: {} });
    await runJob(makeJob({ runKey: () => 'r2', run: first }));
    const second = vi.fn().mockResolvedValue({ details: {} });
    const result = await runJob(makeJob({ runKey: () => 'r2', run: second }));
    expect(result.status).toBe('skipped');
    expect(second).not.toHaveBeenCalled();
  });

  it('records a failure and allows a retake', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('kaboom'));
    const failed = await runJob(makeJob({ runKey: () => 'r3', run: boom }));
    expect(failed.status).toBe('failed');

    const retake = await runJob(makeJob({ runKey: () => 'r3' }));
    expect(failed.status).toBe('failed');
    expect(retake.status).toBe('completed');
  });

  it('releases the advisory lock even when the job throws', async () => {
    await runJob(makeJob({ runKey: () => 'r4', run: vi.fn().mockRejectedValue(new Error('x')) }));
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_locks WHERE locktype = 'advisory'`,
    );
    expect(rows[0].count).toBe('0');
  });

  it('serialises concurrent runs with the same run key', async () => {
    const run = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { details: {} };
    });
    const [a, b] = await Promise.all([
      runJob(makeJob({ runKey: () => 'rc', run })),
      runJob(makeJob({ runKey: () => 'rc', run })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['completed', 'skipped']);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
