import { Telegraf } from 'telegraf';
import { registerCommands } from './commands';
import { errorMiddleware } from './middleware/error';
import { loggingMiddleware } from './middleware/logging';
import type { BotApiClient } from './services/api-client';

export interface CreateBotOptions {
  token: string;
  api: BotApiClient;
  miniAppUrl: string;
}

export const createBot = ({ token, api, miniAppUrl }: CreateBotOptions): Telegraf => {
  const bot = new Telegraf(token);
  bot.use(loggingMiddleware);
  bot.catch(errorMiddleware);
  registerCommands(bot, { api, miniAppUrl });
  return bot;
};
