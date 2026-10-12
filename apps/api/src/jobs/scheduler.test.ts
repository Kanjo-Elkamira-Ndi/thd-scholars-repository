import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stop: vi.fn(),
  schedule: vi.fn(() => ({ stop: vi.fn() })),
  runJob: vi.fn().mockResolvedValue({ status: 'skipped' }),
}));

vi.mock('node-cron', () => ({ default: { schedule: mocks.schedule } }));
vi.mock('./run-job', () => ({ runJob: mocks.runJob }));
vi.mock('../config/env', () => ({
  env: {
    JOBS_ENABLED: true,
    JOBS_TIMEZONE: 'UTC',
    AUDIT_JOB_CRON: '0 6 1 1,4,7,10 *',
    ACCESS_REVIEW_REMINDER_CRON: '0 6 * * 1',
  },
}));

import { startJobs, stopJobs } from './scheduler';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  stopJobs();
});

describe('scheduler', () => {
  it('schedules both jobs in the configured timezone and runs startup catch-up', () => {
    startJobs();
    expect(mocks.schedule).toHaveBeenCalledTimes(2);
    expect(mocks.schedule).toHaveBeenCalledWith(
      '0 6 1 1,4,7,10 *',
      expect.any(Function),
      { timezone: 'UTC' },
    );
    expect(mocks.runJob).toHaveBeenCalledTimes(2);
  });

  it('stops every scheduled task', () => {
    const stops = [vi.fn(), vi.fn()];
    mocks.schedule.mockReturnValueOnce({ stop: stops[0] } as never);
    mocks.schedule.mockReturnValueOnce({ stop: stops[1] } as never);
    startJobs();
    stopJobs();
    expect(stops[0]).toHaveBeenCalled();
    expect(stops[1]).toHaveBeenCalled();
  });

  it('does nothing when jobs are disabled', async () => {
    vi.resetModules();
    vi.doMock('../config/env', () => ({
      env: { JOBS_ENABLED: false, JOBS_TIMEZONE: 'UTC', AUDIT_JOB_CRON: 'x', ACCESS_REVIEW_REMINDER_CRON: 'y' },
    }));
    const mod = await import('./scheduler');
    mocks.schedule.mockClear();
    mocks.runJob.mockClear();
    mod.startJobs();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.runJob).not.toHaveBeenCalled();
  });
});
