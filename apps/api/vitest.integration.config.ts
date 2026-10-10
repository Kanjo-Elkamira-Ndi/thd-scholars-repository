import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseInfo } from './src/db/testing/test-database';

const { url } = resolveTestDatabaseInfo();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['./src/db/testing/global-setup.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: true,
    env: {
      NODE_ENV: 'test',
      BOT_TOKEN: 'test-bot-token',
      API_INTERNAL_TOKEN: 'test-internal-token',
      MINIAPP_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: url,
      AUTH_MOCK_ENABLED: 'false',
      REGISTRATION_RATE_LIMIT_WINDOW_SECONDS: '900',
      REGISTRATION_RATE_LIMIT_MAX: '1000',
      REPEATED_REGISTRATION_FAILURE_THRESHOLD: '3',
      REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS: '86400',
    },
  },
});
