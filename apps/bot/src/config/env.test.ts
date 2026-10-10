import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const base = {
  NODE_ENV: 'development',
  BOT_TOKEN: 'token',
  API_INTERNAL_TOKEN: 'internal',
  MINIAPP_URL: 'https://t.me/your_bot/app',
};

describe('parseEnv', () => {
  it('defaults to polling outside production', () => {
    const env = parseEnv({ ...base });
    expect(env.mode).toBe('polling');
    expect(env.webhook).toBeUndefined();
    expect(env.apiBaseUrl).toBe('http://localhost:3000');
    expect(env.apiTimeoutMs).toBe(5000);
  });

  it('requires webhook config in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/BOT_WEBHOOK/);
  });

  it('requires webhook domain and secret when BOT_MODE=webhook', () => {
    expect(() => parseEnv({ ...base, BOT_MODE: 'webhook' })).toThrow(/BOT_WEBHOOK_DOMAIN/);
    const ok = parseEnv({
      ...base,
      BOT_MODE: 'webhook',
      BOT_WEBHOOK_DOMAIN: 'https://bot.example.com',
      BOT_WEBHOOK_SECRET: 'secret',
    });
    expect(ok.mode).toBe('webhook');
    expect(ok.webhook?.port).toBe(8080);
    expect(ok.webhook?.path).toBe('/telegram/webhook');
    expect(ok.webhook?.secretToken).toBe('secret');
  });

  it('fails when a required field is missing', () => {
    expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(/BOT_TOKEN/);
  });
});
