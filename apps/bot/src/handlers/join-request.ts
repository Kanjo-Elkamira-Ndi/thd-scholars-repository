import type { Logger } from 'pino';
import type { Context } from 'telegraf';
import type { BotApiClient } from '../services/api-client';
import { joinRequestPendingKeyboard, renderJoinRequestPending } from '../templates';

export interface JoinRequestDeps {
  api: BotApiClient;
  miniAppUrl: string;
  logger: Pick<Logger, 'warn'>;
}

export const handleChatJoinRequest = async (
  ctx: Context,
  { api, miniAppUrl, logger }: JoinRequestDeps,
): Promise<void> => {
  const request = ctx.chatJoinRequest;
  if (!request || request.chat.type !== 'channel') {
    return;
  }

  const from = request.from;
  try {
    await api.recordJoinRequest({
      telegramId: from.id,
      telegramUsername: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      chatId: request.chat.id,
      joinRequestedAt: new Date(request.date * 1000).toISOString(),
    });
  } catch (err) {
    logger.warn({ err, telegramId: from.id }, 'failed to record join request');
    return;
  }

  const userChatId = request.user_chat_id;
  if (typeof userChatId !== 'number') {
    logger.warn({ telegramId: from.id }, 'join request has no user_chat_id; pending DM skipped');
    return;
  }

  try {
    await ctx.telegram.sendMessage(userChatId, renderJoinRequestPending(), {
      reply_markup: joinRequestPendingKeyboard(miniAppUrl),
    });
  } catch (err) {
    logger.warn({ err, telegramId: from.id }, 'Failed to send join request pending DM');
  }
};
