import type { JobDefinition } from './run-job';

export const JOB_NAMES_BY_KEY = ['quarterly_audit', 'access_review_reminder'] as const;

export const applyForceSuffix = (
  job: JobDefinition,
  suffix: string = String(Date.now()),
): JobDefinition => ({
  ...job,
  runKey: () => `${job.runKey()}:${suffix}`,
});

export const selectJobDefinition = (
  registry: Record<string, JobDefinition>,
  name: string | undefined,
  force: boolean,
): JobDefinition | null => {
  if (!name || !registry[name]) return null;
  return force ? applyForceSuffix(registry[name]) : registry[name];
};
