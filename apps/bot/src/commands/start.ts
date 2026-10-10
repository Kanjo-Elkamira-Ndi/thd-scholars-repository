import type { Context } from 'telegraf';
import { renderStart, startKeyboard } from '../templates';

export const startCommand = async (ctx: Context, miniAppUrl: string): Promise<void> => {
  await ctx.reply(renderStart(), { reply_markup: startKeyboard(miniAppUrl) });
};
