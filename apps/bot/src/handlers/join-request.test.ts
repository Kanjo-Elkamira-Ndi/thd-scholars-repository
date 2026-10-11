import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JoinRequestDeps } from './join-request';
import { handleChatJoinRequest } from './join-request';

const makeCtx = (request: Record<string, unknown> = {}) =>
  ({
    chatJoinRequest: {
      chat: { id: -100123, type: 'channel' },
      from: { id: 555, username: 'jane', first_name: 'Jane', last_name: 'Doe' },
      user_chat_id: 555,
      date: 1767225600,
      ...request,
    },
    telegram: { sendMessage: vi.fn().mockResolvedValue({}) },
  }) as unknown as Parameters<typeof handleChatJoinRequest>[0] & {
    telegram: { sendMessage: ReturnType<typeof vi.fn> };
  };

const makeDeps = () => {
  const api = { recordJoinRequest: vi.fn().mockResolvedValue({ joinRequestId: 'jr-1' }) };
  const logger = { warn: vi.fn() };
  return {
    deps: { api, miniAppUrl: 'https://t.me/x/app', logger } as unknown as JoinRequestDeps,
    api,
    logger,
  };
};

let ctx: ReturnType<typeof makeCtx>;

beforeEach(() => {
  ctx = makeCtx();
});

describe('handleChatJoinRequest', () => {
  it('records the request and DMs user_chat_id with the button', async () => {
    const { deps, api } = makeDeps();

    await handleChatJoinRequest(ctx, deps);

    expect(api.recordJoinRequest).toHaveBeenCalledWith({
      telegramId: 555,
      telegramUsername: 'jane',
      firstName: 'Jane',
      lastName: 'Doe',
      chatId: -100123,
      joinRequestedAt: new Date(1767225600 * 1000).toISOString(),
    });
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      555,
      expect.stringContaining('Thanks for requesting to join'),
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Complete Registration', url: 'https://t.me/x/app' }]],
        },
      },
    );
  });

  it('ignores non-channel requests', async () => {
    const { deps, api } = makeDeps();
    const directCtx = makeCtx({ chat: { id: 555, type: 'private' } });

    await handleChatJoinRequest(directCtx, deps);

    expect(api.recordJoinRequest).not.toHaveBeenCalled();
    expect(directCtx.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('is non-fatal when user_chat_id is absent', async () => {
    const { deps, api, logger } = makeDeps();
    const noChatCtx = makeCtx({ user_chat_id: undefined });

    await handleChatJoinRequest(noChatCtx, deps);

    expect(api.recordJoinRequest).toHaveBeenCalledOnce();
    expect(noChatCtx.telegram.sendMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('is non-fatal when recording fails', async () => {
    const { deps, api, logger } = makeDeps();
    api.recordJoinRequest.mockRejectedValue(new Error('boom'));

    await handleChatJoinRequest(ctx, deps);

    expect(ctx.telegram.sendMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('is non-fatal when the DM fails', async () => {
    const { deps, logger } = makeDeps();
    ctx.telegram.sendMessage.mockRejectedValue(new Error('blocked'));

    await handleChatJoinRequest(ctx, deps);

    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
