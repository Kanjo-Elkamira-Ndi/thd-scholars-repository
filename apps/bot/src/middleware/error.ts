import type { Context } from 'telegraf';
import { logger } from '../utils/logger';

export const errorMiddleware = async (err: unknown, ctx: Context): Promise<void> => {
  logger.error({ err, updateId: ctx.update?.update_id }, 'bot handler error');
  try {
    await ctx.reply('Something went wrong. Please try again in a moment.');
  } catch (replyError) {
    logger.error({ err: replyError }, 'failed to send error reply');
  }
};
