import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      BOT_TOKEN: 'test-bot-token',
      API_BASE_URL: 'http://localhost:3000',
      API_INTERNAL_TOKEN: 'test-internal-token',
      MINIAPP_URL: 'https://t.me/test_bot/app',
    },
  },
});
