import pool from '../src/db/pool';
import { accessReviewReminderJob } from '../src/jobs/access-review-reminder.job';
import { selectJobDefinition } from '../src/jobs/dev-runner';
import { quarterlyAuditJob } from '../src/jobs/quarterly-audit.job';
import { runJob, type JobDefinition } from '../src/jobs/run-job';

const registry: Record<string, JobDefinition> = {
  quarterly_audit: quarterlyAuditJob,
  access_review_reminder: accessReviewReminderJob,
};

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run a job with NODE_ENV=production');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const name = args.find((arg) => !arg.startsWith('--'));
  const force = args.includes('--force');
  const job = selectJobDefinition(registry, name, force);
  if (!job) {
    console.error(`Usage: npm run run:job -- <${Object.keys(registry).join('|')}> [--force]`);
    process.exit(1);
  }

  const result = await runJob(job);
  console.log(`${job.name}: ${result.status}`);
  await pool.end();
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
