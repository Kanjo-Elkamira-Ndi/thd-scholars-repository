import type { JoinRequestDeliveryTask } from '@thd/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  deliverTask,
  runDeliveryTick,
  startDeliveryLoop,
  stopDeliveryLoop,
  type DeliveryDeps,
} from './delivery';

const task = (over: Partial<JoinRequestDeliveryTask> = {}): JoinRequestDeliveryTask => ({
  id: 'jr-1',
  decision: 'approved',
  reason: null,
  telegramId: 555,
  telegramUserId: 555,
  fullName: 'Jane Doe',
  chatId: -100123,
  attempts: 1,
  ...over,
});

const makeDeps = () => {
  const telegram = {
    approveChatJoinRequest: vi.fn().mockResolvedValue(true),
    declineChatJoinRequest: vi.fn().mockResolvedValue(true),
    getChatMember: vi.fn().mockResolvedValue({ status: 'member' }),
    createChatInviteLink: vi.fn().mockResolvedValue({ invite_link: 'https://t.me/+abc' }),
    revokeChatInviteLink: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn().mockResolvedValue({}),
  };
  const api = {
    completeJoinRequest: vi.fn().mockResolvedValue(undefined),
    claimJoinRequests: vi.fn().mockResolvedValue({ items: [], inviteLinkExpirySeconds: 86400 }),
  };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return {
    deps: { api, telegram, channelId: '@channel', logger } as unknown as DeliveryDeps,
    api,
    telegram,
    logger,
  };
};

describe('deliverTask — approve', () => {
  it('approves the request, DMs the user, and completes delivered', async () => {
    const { deps, api, telegram } = makeDeps();

    await deliverTask(task(), deps, 86400);

    expect(telegram.approveChatJoinRequest).toHaveBeenCalledWith(-100123, 555);
    expect(telegram.sendMessage).toHaveBeenCalledWith(555, expect.stringContaining('Jane Doe'));
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', { outcome: 'delivered' });
  });

  it('is delivered even when the approval DM fails (non-fatal)', async () => {
    const { deps, api, telegram, logger } = makeDeps();
    telegram.sendMessage.mockRejectedValue(new Error('blocked'));

    await deliverTask(task(), deps, 86400);

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', { outcome: 'delivered' });
  });

  it('issues an invite link when there is no channel request', async () => {
    const { deps, api, telegram } = makeDeps();

    await deliverTask(task({ chatId: null }), deps, 86400);

    expect(telegram.approveChatJoinRequest).not.toHaveBeenCalled();
    expect(telegram.createChatInviteLink).toHaveBeenCalledWith(
      '@channel',
      expect.objectContaining({ member_limit: 1, expire_date: expect.any(Number) }),
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith(555, expect.stringContaining('https://t.me/+abc'));
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', {
      outcome: 'delivered',
      inviteLink: { link: 'https://t.me/+abc', expiresAt: expect.any(String) },
    });
  });

  it('crash-after-approve retry: already a member → delivered, no invite link', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.approveChatJoinRequest.mockRejectedValue(new Error('HIDE_REQUESTER_MISSING'));

    await deliverTask(task(), deps, 86400);

    expect(telegram.getChatMember).toHaveBeenCalledWith('@channel', 555);
    expect(telegram.createChatInviteLink).not.toHaveBeenCalled();
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', { outcome: 'delivered' });
  });

  it('request gone and not a member → invite path', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.approveChatJoinRequest.mockRejectedValue(new Error('no join request'));
    telegram.getChatMember.mockResolvedValue({ status: 'left' });

    await deliverTask(task(), deps, 86400);

    expect(telegram.createChatInviteLink).toHaveBeenCalledOnce();
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', {
      outcome: 'delivered',
      inviteLink: expect.objectContaining({ link: 'https://t.me/+abc' }),
    });
  });

  it('reports a failure for a non-request-gone approve error', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.approveChatJoinRequest.mockRejectedValue(new Error('429 Too Many Requests'));

    await deliverTask(task(), deps, 86400);

    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', {
      outcome: 'failed',
      error: '429 Too Many Requests',
    });
  });

  it('revokes the link and reports a failure when the invite DM fails', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.sendMessage.mockRejectedValue(new Error('blocked'));

    await deliverTask(task({ chatId: null }), deps, 86400);

    expect(telegram.revokeChatInviteLink).toHaveBeenCalledWith('@channel', 'https://t.me/+abc');
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', {
      outcome: 'failed',
      error: 'blocked',
    });
  });
});

describe('deliverTask — decline', () => {
  it('declines the request, DMs the reason, and completes delivered', async () => {
    const { deps, api, telegram } = makeDeps();

    await deliverTask(task({ decision: 'declined', reason: 'No matching roster entry' }), deps, 86400);

    expect(telegram.declineChatJoinRequest).toHaveBeenCalledWith(-100123, 555);
    expect(telegram.sendMessage).toHaveBeenCalledWith(555, expect.stringContaining('No matching roster entry'));
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', { outcome: 'delivered' });
  });

  it('treats a request-gone decline as delivered', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.declineChatJoinRequest.mockRejectedValue(new Error('USER_ALREADY_PARTICIPANT'));

    await deliverTask(task({ decision: 'declined', reason: 'x' }), deps, 86400);

    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', { outcome: 'delivered' });
  });

  it('sends a DM only when there is no channel request', async () => {
    const { deps, api, telegram } = makeDeps();

    await deliverTask(task({ decision: 'declined', chatId: null, reason: 'x' }), deps, 86400);

    expect(telegram.declineChatJoinRequest).not.toHaveBeenCalled();
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', { outcome: 'delivered' });
  });

  it('reports a failure for a non-request-gone decline error', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.declineChatJoinRequest.mockRejectedValue(new Error('403 Forbidden'));

    await deliverTask(task({ decision: 'declined', reason: 'x' }), deps, 86400);

    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', {
      outcome: 'failed',
      error: '403 Forbidden',
    });
  });
});

describe('runDeliveryTick', () => {
  it('claims a batch and delivers each task', async () => {
    const { deps, api } = makeDeps();
    api.claimJoinRequests.mockResolvedValue({ items: [task()], inviteLinkExpirySeconds: 86400 });

    await runDeliveryTick({ ...deps, intervalMs: 1000, batchSize: 10 });

    expect(api.claimJoinRequests).toHaveBeenCalledWith({ limit: 10 });
    expect(api.completeJoinRequest).toHaveBeenCalledWith('jr-1', { outcome: 'delivered' });
  });
});

describe('delivery loop lifecycle', () => {
  it('polls on an interval until stopped', async () => {
    vi.useFakeTimers();
    try {
      const { deps, api } = makeDeps();
      const loopDeps = { ...deps, intervalMs: 1000, batchSize: 5 };

      startDeliveryLoop(loopDeps);
      await vi.advanceTimersByTimeAsync(0);
      expect(api.claimJoinRequests).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(api.claimJoinRequests).toHaveBeenCalledTimes(2);

      stopDeliveryLoop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.claimJoinRequests).toHaveBeenCalledTimes(2);
    } finally {
      stopDeliveryLoop();
      vi.useRealTimers();
    }
  });
});
