import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { accessReviewReminderJob } from './access-review-reminder.job';
import { quarterlyAuditJob } from './quarterly-audit.job';
import { runJob } from './run-job';

let tasks: ScheduledTask[] = [];

export const startJobs = (): void => {
  if (!env.JOBS_ENABLED) {
    logger.info('Scheduled jobs are disabled');
    return;
  }

  tasks = [
    cron.schedule(env.AUDIT_JOB_CRON, () => void runJob(quarterlyAuditJob), {
      timezone: env.JOBS_TIMEZONE,
    }),
    cron.schedule(env.ACCESS_REVIEW_REMINDER_CRON, () => void runJob(accessReviewReminderJob), {
      timezone: env.JOBS_TIMEZONE,
    }),
  ];

  void runJob(quarterlyAuditJob);
  void runJob(accessReviewReminderJob);

  logger.info(
    {
      timezone: env.JOBS_TIMEZONE,
      cron: [env.AUDIT_JOB_CRON, env.ACCESS_REVIEW_REMINDER_CRON],
    },
    'Scheduled jobs started',
  );
};

export const stopJobs = (): void => {
  for (const task of tasks) {
    task.stop();
  }
  tasks = [];
};
