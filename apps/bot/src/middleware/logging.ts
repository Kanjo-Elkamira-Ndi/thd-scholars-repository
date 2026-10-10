import type { Context } from 'telegraf';
import { logger } from '../utils/logger';

export const loggingMiddleware = async (ctx: Context, next: () => Promise<void>): Promise<void> => {
  const startedAt = Date.now();
  await next();
  logger.info(
    {
      updateId: ctx.update?.update_id,
      updateType: ctx.updateType,
      telegramId: ctx.from?.id,
      durationMs: Date.now() - startedAt,
    },
    'update handled',
  );
};
