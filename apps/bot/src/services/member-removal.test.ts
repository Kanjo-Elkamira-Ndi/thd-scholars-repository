import type { MemberRemovalTask } from '@thd/shared';
import type { Telegraf } from 'telegraf';
import { describe, expect, it, vi } from 'vitest';
import type { BotApiClient } from './api-client';
import { removeMember, runMemberRemovalTick, type MemberRemovalDeps } from './member-removal';

const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

const task = (overrides: Partial<MemberRemovalTask> = {}): MemberRemovalTask => ({
  id: 'mr-1',
  userId: 'u1',
  telegramId: 42,
  attempts: 1,
  ...overrides,
});

const buildDeps = (overrides: {
  banChatMember?: ReturnType<typeof vi.fn>;
  unbanChatMember?: ReturnType<typeof vi.fn>;
  claimMemberRemovals?: ReturnType<typeof vi.fn>;
}): MemberRemovalDeps & { api: BotApiClient } => {
  const api = {
    claimMemberRemovals: overrides.claimMemberRemovals ?? vi.fn().mockResolvedValue([]),
    completeMemberRemoval: vi.fn().mockResolvedValue(undefined),
  } as unknown as BotApiClient;
  return {
    api,
    telegram: {
      banChatMember: overrides.banChatMember ?? vi.fn().mockResolvedValue(true),
      unbanChatMember: overrides.unbanChatMember ?? vi.fn().mockResolvedValue(true),
    } as unknown as Telegraf['telegram'],
    channelId: '-100',
    logger,
  };
};

describe('removeMember', () => {
  it('bans, unbans (only_if_banned), and confirms removal', async () => {
    const deps = buildDeps({});

    await removeMember(task(), deps);

    expect(deps.telegram.banChatMember).toHaveBeenCalledWith('-100', 42);
    expect(deps.telegram.unbanChatMember).toHaveBeenCalledWith('-100', 42, {
      only_if_banned: true,
    });
    expect(deps.api.completeMemberRemoval).toHaveBeenCalledWith('mr-1', { outcome: 'removed' });
  });

  it('treats a not-in-chat ban error as success without unbanning', async () => {
    const deps = buildDeps({
      banChatMember: vi.fn().mockRejectedValue({ description: 'Bad Request: user not found' }),
    });

    await removeMember(task(), deps);

    expect(deps.telegram.unbanChatMember).not.toHaveBeenCalled();
    expect(deps.api.completeMemberRemoval).toHaveBeenCalledWith('mr-1', { outcome: 'removed' });
  });

  it('reports a failure when the ban fails for another reason', async () => {
    const deps = buildDeps({
      banChatMember: vi.fn().mockRejectedValue(new Error('chat not enough rights')),
    });

    await removeMember(task(), deps);

    expect(deps.api.completeMemberRemoval).toHaveBeenCalledWith('mr-1', {
      outcome: 'failed',
      error: 'chat not enough rights',
    });
  });

  it('reports a failure when the unban fails', async () => {
    const deps = buildDeps({
      unbanChatMember: vi.fn().mockRejectedValue(new Error('unban boom')),
    });

    await removeMember(task(), deps);

    expect(deps.api.completeMemberRemoval).toHaveBeenCalledWith('mr-1', {
      outcome: 'failed',
      error: 'unban boom',
    });
  });
});

describe('runMemberRemovalTick', () => {
  it('claims a batch and processes every removal', async () => {
    const claimMemberRemovals = vi
      .fn()
      .mockResolvedValue([task({ id: 'a', telegramId: 1 }), task({ id: 'b', telegramId: 2 })]);
    const deps = buildDeps({ claimMemberRemovals });

    await runMemberRemovalTick({ ...deps, intervalMs: 1000, batchSize: 10 });

    expect(claimMemberRemovals).toHaveBeenCalledWith(10);
    expect(deps.api.completeMemberRemoval).toHaveBeenCalledTimes(2);
  });
});
