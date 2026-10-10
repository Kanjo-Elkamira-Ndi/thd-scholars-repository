import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { createBot } from './bot';
import { COMMANDS } from './commands/definitions';
import { env } from './config/env';
import { createApiClient } from './services/api-client';
import { logger } from './utils/logger';

// Node 20+ enables "Happy Eyeballs" address-family autoselection by default.
// Telegraf uses node-fetch v2, which hangs (ETIMEDOUT) on hosts that advertise
// an unreachable IPv6 route. Prefer IPv4 and disable autoselection so the bot
// can always reach the Telegram API.
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);

const main = async (): Promise<void> => {
  const api = createApiClient({
    baseUrl: env.apiBaseUrl,
    token: env.apiInternalToken,
    timeoutMs: env.apiTimeoutMs,
  });
  const bot = createBot({ token: env.botToken, api, miniAppUrl: env.miniAppUrl });

  await bot.telegram.setMyCommands(COMMANDS);

  const stop = (signal: string): void => {
    logger.info({ signal }, 'stopping bot');
    bot.stop(signal);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  if (env.mode === 'webhook' && env.webhook) {
    logger.info({ path: env.webhook.path, port: env.webhook.port }, 'bot running (webhook)');
    await bot.launch({
      webhook: {
        domain: env.webhook.domain,
        path: env.webhook.path,
        secretToken: env.webhook.secretToken,
        port: env.webhook.port,
      },
    });
  } else {
    logger.info('bot running (polling)');
    await bot.launch();
  }
};

main().catch((err: unknown) => {
  logger.error({ err }, 'failed to start bot');
  process.exit(1);
});
