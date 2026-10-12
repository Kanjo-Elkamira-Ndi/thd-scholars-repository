import pool from '../db/pool';
import type { Db } from '../db/transaction';

export const claimJobRun = async (
  input: { job: string; runKey: string; staleMinutes: number },
  db: Db = pool,
): Promise<{ id: string } | null> => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO job_runs (job, run_key, status)
     VALUES ($1, $2, 'started')
     ON CONFLICT (job, run_key) DO UPDATE
       SET status = 'started',
           started_at = now(),
           finished_at = NULL,
           details = NULL,
           last_error = NULL
       WHERE job_runs.status = 'failed'
          OR (job_runs.status = 'started'
              AND job_runs.started_at < now() - make_interval(mins => $3))
     RETURNING id`,
    [input.job, input.runKey, input.staleMinutes],
  );
  return rows.length ? { id: rows[0].id } : null;
};

export const completeJobRun = async (
  id: string,
  details: Record<string, unknown> | null,
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE job_runs
        SET status = 'completed', finished_at = now(), details = $2
      WHERE id = $1`,
    [id, details],
  );
};

export const failJobRun = async (
  id: string,
  input: { error: string; details?: Record<string, unknown> | null },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `UPDATE job_runs
        SET status = 'failed', finished_at = now(), last_error = $2, details = $3
      WHERE id = $1`,
    [id, input.error, input.details ?? null],
  );
};
