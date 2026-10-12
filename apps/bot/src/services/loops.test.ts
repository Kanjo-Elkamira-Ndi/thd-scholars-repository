import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

const logger = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() });

describe('bot loop isolation', () => {
  it('membership sync loop logs and survives a rejecting tick', async () => {
    vi.useFakeTimers();
    const { startMembershipSyncLoop, stopMembershipSyncLoop } = await import('./membership-sync');
    const log = logger();
    const api = { getMembershipReconcileTargets: vi.fn().mockRejectedValue(new Error('boom')) };

    startMembershipSyncLoop({
      api: api as never,
      telegram: {} as never,
      channelId: '-100',
      logger: log as never,
      intervalMs: 1000,
      ratePerSec: 20,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(log.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'membership sync tick failed');
    stopMembershipSyncLoop();
  });

  it('member removal loop logs and survives a rejecting tick', async () => {
    vi.useFakeTimers();
    const { startMemberRemovalLoop, stopMemberRemovalLoop } = await import('./member-removal');
    const log = logger();
    const api = { claimMemberRemovals: vi.fn().mockRejectedValue(new Error('boom')) };

    startMemberRemovalLoop({
      api: api as never,
      telegram: {} as never,
      channelId: '-100',
      logger: log as never,
      intervalMs: 1000,
      batchSize: 10,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(log.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'member removal tick failed');
    stopMemberRemovalLoop();
  });

  it('join-request delivery loop logs and survives a rejecting tick', async () => {
    vi.useFakeTimers();
    const { startDeliveryLoop, stopDeliveryLoop } = await import('./delivery');
    const log = logger();
    const api = { claimJoinRequests: vi.fn().mockRejectedValue(new Error('boom')) };

    startDeliveryLoop({
      api: api as never,
      telegram: {} as never,
      channelId: '-100',
      logger: log as never,
      intervalMs: 1000,
      batchSize: 10,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'join-request delivery tick failed',
    );
    stopDeliveryLoop();
  });

  it('content delivery loop logs and survives a rejecting tick', async () => {
    vi.useFakeTimers();
    const { startContentLoop, stopContentLoop } = await import('./content-delivery');
    const log = logger();
    const api = { claimContentTasks: vi.fn().mockRejectedValue(new Error('boom')) };

    startContentLoop({
      api: api as never,
      telegram: {} as never,
      channelId: '-100',
      logger: log as never,
      intervalMs: 1000,
      batchSize: 10,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(log.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'content delivery tick failed');
    stopContentLoop();
  });
});

describe('notification delivery loop isolation', () => {
  it('notification loop logs and survives a rejecting tick', async () => {
    vi.useFakeTimers();
    const { startNotificationLoop, stopNotificationLoop } = await import('./notification-delivery');
    const log = logger();
    const api = { claimNotifications: vi.fn().mockRejectedValue(new Error('boom')) };

    startNotificationLoop({
      api: api as never,
      telegram: {} as never,
      logger: log as never,
      intervalMs: 1000,
      batchSize: 10,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'notification delivery tick failed',
    );
    stopNotificationLoop();
  });
});
