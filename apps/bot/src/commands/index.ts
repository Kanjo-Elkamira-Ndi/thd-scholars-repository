import type { Telegraf } from 'telegraf';
import type { BotApiClient } from '../services/api-client';
import { helpCommand } from './help';
import { mystatusCommand } from './mystatus';
import { startCommand } from './start';

export interface CommandDeps {
  api: BotApiClient;
  miniAppUrl: string;
}

export const registerCommands = (bot: Telegraf, deps: CommandDeps): void => {
  bot.start((ctx) => startCommand(ctx, deps.miniAppUrl));
  bot.help((ctx) => helpCommand(ctx));
  bot.command('mystatus', (ctx) => mystatusCommand(ctx, deps.api));
};
