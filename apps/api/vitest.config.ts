import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      BOT_TOKEN: 'test-bot-token',
      API_INTERNAL_TOKEN: 'test-internal-token',
      MINIAPP_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/thd_scholars_test',
      AUTH_MOCK_ENABLED: 'false',
    },
  },
});
