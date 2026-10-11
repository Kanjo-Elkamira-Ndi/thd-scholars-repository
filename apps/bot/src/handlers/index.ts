import type { Telegraf } from 'telegraf';
import { handleChatJoinRequest, type JoinRequestDeps } from './join-request';

export const registerHandlers = (bot: Telegraf, deps: JoinRequestDeps): void => {
  bot.on('chat_join_request', (ctx) => handleChatJoinRequest(ctx, deps));
};
