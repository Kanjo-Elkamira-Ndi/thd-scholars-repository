import type { Telegraf } from 'telegraf';
import { describe, expect, it, vi } from 'vitest';
import type { BotApiClient } from './api-client';
import { syncMembershipOnce, type MembershipSyncDeps } from './membership-sync';

const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

const buildDeps = (overrides: {
  targets: { userId: string; telegramId: number }[];
  getChatMember: ReturnType<typeof vi.fn>;
  sleep?: ReturnType<typeof vi.fn>;
}): MembershipSyncDeps => {
  const api = {
    getMembershipReconcileTargets: vi.fn().mockResolvedValue(overrides.targets),
    pushMembershipSnapshot: vi.fn().mockResolvedValue(undefined),
  } as unknown as BotApiClient;
  return {
    api,
    telegram: { getChatMember: overrides.getChatMember } as unknown as Telegraf['telegram'],
    channelId: '-100',
    logger,
    intervalMs: 1000,
    ratePerSec: 2,
    sleep: (overrides.sleep ?? vi.fn().mockResolvedValue(undefined)) as (
      ms: number,
    ) => Promise<void>,
  };
};

describe('syncMembershipOnce', () => {
  it('maps member statuses to isMember', async () => {
    const getChatMember = vi
      .fn()
      .mockResolvedValueOnce({ status: 'member' })
      .mockResolvedValueOnce({ status: 'left' })
      .mockResolvedValueOnce({ status: 'creator' });
    const deps = buildDeps({
      targets: [
        { userId: 'u1', telegramId: 1 },
        { userId: 'u2', telegramId: 2 },
        { userId: 'u3', telegramId: 3 },
      ],
      getChatMember,
    });

    await syncMembershipOnce(deps);

    expect(deps.api.pushMembershipSnapshot).toHaveBeenCalledWith([
      { telegramId: 1, isMember: true, memberStatus: 'member' },
      { telegramId: 2, isMember: false, memberStatus: 'left' },
      { telegramId: 3, isMember: true, memberStatus: 'creator' },
    ]);
  });

  it('omits users whose lookup fails and continues', async () => {
    const getChatMember = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'member' });
    const deps = buildDeps({
      targets: [
        { userId: 'u1', telegramId: 1 },
        { userId: 'u2', telegramId: 2 },
      ],
      getChatMember,
    });

    await syncMembershipOnce(deps);

    expect(deps.api.pushMembershipSnapshot).toHaveBeenCalledWith([
      { telegramId: 2, isMember: true, memberStatus: 'member' },
    ]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('pauses on a 429 retry_after without rejecting', async () => {
    const getChatMember = vi
      .fn()
      .mockRejectedValueOnce({ response: { parameters: { retry_after: 3 } } })
      .mockResolvedValueOnce({ status: 'member' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const deps = buildDeps({
      targets: [
        { userId: 'u1', telegramId: 1 },
        { userId: 'u2', telegramId: 2 },
      ],
      getChatMember,
      sleep,
    });

    await expect(syncMembershipOnce(deps)).resolves.toBeUndefined();

    expect(sleep).toHaveBeenCalledWith(3000);
    expect(deps.api.pushMembershipSnapshot).toHaveBeenCalledWith([
      { telegramId: 2, isMember: true, memberStatus: 'member' },
    ]);
  });

  it('throttles calls to the configured rate', async () => {
    const getChatMember = vi.fn().mockResolvedValue({ status: 'member' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const deps = buildDeps({
      targets: [
        { userId: 'u1', telegramId: 1 },
        { userId: 'u2', telegramId: 2 },
        { userId: 'u3', telegramId: 3 },
      ],
      getChatMember,
      sleep,
    });

    await syncMembershipOnce(deps);

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('skips the snapshot push when there are no targets', async () => {
    const deps = buildDeps({ targets: [], getChatMember: vi.fn() });
    await syncMembershipOnce(deps);
    expect(deps.api.pushMembershipSnapshot).not.toHaveBeenCalled();
  });
});
