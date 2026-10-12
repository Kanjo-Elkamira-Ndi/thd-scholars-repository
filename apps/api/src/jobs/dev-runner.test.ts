import { describe, expect, it } from 'vitest';
import { applyForceSuffix, selectJobDefinition } from './dev-runner';
import type { JobDefinition } from './run-job';

const job: JobDefinition = {
  name: 'quarterly_audit',
  runKey: () => '2026-Q4',
  run: async () => ({ details: {} }),
};

describe('dev-runner', () => {
  it('appends a unique suffix when forced', () => {
    expect(applyForceSuffix(job, '123').runKey()).toBe('2026-Q4:123');
    expect(applyForceSuffix(job).runKey()).toMatch(/^2026-Q4:\d+$/);
  });

  it('returns null for an unknown job name', () => {
    const registry = { quarterly_audit: job };
    expect(selectJobDefinition(registry, undefined, false)).toBeNull();
    expect(selectJobDefinition(registry, 'nope', false)).toBeNull();
    expect(selectJobDefinition(registry, 'quarterly_audit', false)).toBe(job);
    expect(selectJobDefinition(registry, 'quarterly_audit', true)?.runKey()).toMatch(/^2026-Q4:\d+$/);
  });
});
