import type { Context } from 'telegraf';
import { renderHelp } from '../templates';

export const helpCommand = async (ctx: Context): Promise<void> => {
  await ctx.reply(renderHelp());
};
