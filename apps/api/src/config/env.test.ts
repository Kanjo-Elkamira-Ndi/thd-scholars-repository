import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  BOT_TOKEN: 'test-bot-token',
  API_INTERNAL_TOKEN: 'test-internal-token',
  MINIAPP_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/thd_scholars_test',
  AUTH_MOCK_ENABLED: 'false',
};

afterEach(() => {
  for (const [key, value] of Object.entries(BASE_ENV)) process.env[key] = value;
  vi.resetModules();
});

const importEnv = () => import('./env');

describe('env', () => {
  it('rejects AUTH_MOCK_ENABLED=true when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MOCK_ENABLED = 'true';
    await expect(importEnv()).rejects.toThrow(/forbidden/i);
  });

  it('allows AUTH_MOCK_ENABLED=true outside production', async () => {
    process.env.AUTH_MOCK_ENABLED = 'true';
    const { env } = await importEnv();
    expect(env.AUTH_MOCK_ENABLED).toBe(true);
  });

  it('defaults AUTH_MOCK_ENABLED=false and the auth window to 86400', async () => {
    process.env.AUTH_MOCK_ENABLED = 'false';
    const { env } = await importEnv();
    expect(env.AUTH_MOCK_ENABLED).toBe(false);
    expect(env.TELEGRAM_AUTH_MAX_AGE_SECONDS).toBe(86400);
  });
});
