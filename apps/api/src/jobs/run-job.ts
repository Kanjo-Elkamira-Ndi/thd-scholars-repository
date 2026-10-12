import { createHash } from 'node:crypto';
import { env } from '../config/env';
import pool from '../db/pool';
import * as jobRunsRepo from '../repositories/job-runs.repository';
import { logger } from '../utils/logger';

export interface JobContext {
  jobRunId: string;
  runKey: string;
}

export interface JobResult {
  details: Record<string, unknown>;
}

export interface JobDefinition {
  name: string;
  runKey: () => string;
  run: (context: JobContext) => Promise<JobResult>;
}

export type JobOutcome = 'completed' | 'skipped' | 'failed';

export const advisoryLockKey = (name: string): number =>
  createHash('sha256').update(name).digest().readInt32BE(0);

export const runJob = async (job: JobDefinition): Promise<{ status: JobOutcome }> => {
  const client = await pool.connect();
  const lockKey = advisoryLockKey(job.name);
  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
    try {
      const runKey = job.runKey();
      const claimed = await jobRunsRepo.claimJobRun(
        { job: job.name, runKey, staleMinutes: env.JOB_RUN_STALE_MINUTES },
        client,
      );
      if (!claimed) {
        logger.info({ job: job.name, runKey }, 'Job run skipped (already done or in progress)');
        return { status: 'skipped' };
      }

      try {
        const result = await job.run({ runKey, jobRunId: claimed.id });
        await jobRunsRepo.completeJobRun(claimed.id, result.details ?? {}, client);
        logger.info({ job: job.name, runKey }, 'Job run completed');
        return { status: 'completed' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await jobRunsRepo.failJobRun(claimed.id, { error: message }, client);
        logger.error({ job: job.name, runKey, err: message }, 'Job run failed');
        return { status: 'failed' };
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    }
  } finally {
    client.release();
  }
};
