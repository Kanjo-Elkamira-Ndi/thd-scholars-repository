import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: path.join(__dirname, '..', '..', '.env') });

export interface BotEnv {
  nodeEnv: 'development' | 'test' | 'production';
  botToken: string;
  apiBaseUrl: string;
  apiInternalToken: string;
  miniAppUrl: string;
  apiTimeoutMs: number;
  mode: 'polling' | 'webhook';
  webhook?: { domain: string; path: string; secretToken: string; port: number };
}

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  API_INTERNAL_TOKEN: z.string().min(1, 'API_INTERNAL_TOKEN is required'),
  MINIAPP_URL: z.string().min(1, 'MINIAPP_URL is required'),
  BOT_MODE: z.enum(['polling', 'webhook']).optional(),
  BOT_WEBHOOK_DOMAIN: z.string().url().optional(),
  BOT_WEBHOOK_PATH: z.string().min(1).default('/telegram/webhook'),
  BOT_WEBHOOK_SECRET: z.string().min(1).optional(),
  BOT_WEBHOOK_PORT: z.coerce.number().int().positive().default(8080),
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export const parseEnv = (raw: NodeJS.ProcessEnv): BotEnv => {
  const result = RawEnvSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  const data = result.data;
  const mode = data.BOT_MODE ?? (data.NODE_ENV === 'production' ? 'webhook' : 'polling');

  const env: BotEnv = {
    nodeEnv: data.NODE_ENV,
    botToken: data.BOT_TOKEN,
    apiBaseUrl: data.API_BASE_URL,
    apiInternalToken: data.API_INTERNAL_TOKEN,
    miniAppUrl: data.MINIAPP_URL,
    apiTimeoutMs: data.API_TIMEOUT_MS,
    mode,
  };

  if (mode === 'webhook') {
    if (!data.BOT_WEBHOOK_DOMAIN || !data.BOT_WEBHOOK_SECRET) {
      throw new Error(
        'BOT_WEBHOOK_DOMAIN and BOT_WEBHOOK_SECRET are required when BOT_MODE=webhook',
      );
    }
    env.webhook = {
      domain: data.BOT_WEBHOOK_DOMAIN,
      path: data.BOT_WEBHOOK_PATH,
      secretToken: data.BOT_WEBHOOK_SECRET,
      port: data.BOT_WEBHOOK_PORT,
    };
  }

  return env;
};

export const env = parseEnv(process.env);
