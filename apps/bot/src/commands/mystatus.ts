import type { Context } from 'telegraf';
import { BotApiError, type BotApiClient } from '../services/api-client';
import { renderNotRegistered, renderStatus } from '../templates';

export const mystatusCommand = async (ctx: Context, api: BotApiClient): Promise<void> => {
  const telegramId = ctx.from?.id;
  if (telegramId === undefined) {
    return;
  }
  try {
    const status = await api.getUserStatus(telegramId);
    await ctx.reply(renderStatus(status));
  } catch (err) {
    if (err instanceof BotApiError && err.status === 404) {
      await ctx.reply(renderNotRegistered());
      return;
    }
    throw err;
  }
};
