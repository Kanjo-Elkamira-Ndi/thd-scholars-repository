import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@thd/shared';

vi.mock('../config/env', () => ({
  env: {
    REGISTRATION_RATE_LIMIT_WINDOW_SECONDS: 900,
    REGISTRATION_RATE_LIMIT_MAX: 3,
  },
}));

import { registrationRateLimiter } from './registration-rate-limit';

const makeUser = (telegramId: number): User => ({
  id: `user-${telegramId}`,
  telegramId,
  telegramUsername: null,
  fullName: 'Test User',
  email: null,
  role: 'scholar',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const buildApp = (): express.Express => {
  const app = express();
  app.use((req, _res, next) => {
    const telegramId = Number(req.get('x-telegram-id'));
    if (Number.isFinite(telegramId)) req.user = makeUser(telegramId);
    next();
  });
  app.use(registrationRateLimiter);
  app.get('/probe', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
};

describe('registrationRateLimiter', () => {
  it('allows requests up to the limit then returns 429 RATE_LIMITED', async () => {
    const app = buildApp();
    const agent = request(app);

    for (let i = 0; i < 3; i += 1) {
      const res = await agent.get('/probe').set('x-telegram-id', '100');
      expect(res.status).toBe(200);
    }

    const blocked = await agent.get('/probe').set('x-telegram-id', '100');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many registration attempts' },
    });
  });

  it('tracks each telegram id independently', async () => {
    const app = buildApp();
    const agent = request(app);

    for (let i = 0; i < 3; i += 1) {
      await agent.get('/probe').set('x-telegram-id', '200');
    }
    await agent.get('/probe').set('x-telegram-id', '200');

    const other = await agent.get('/probe').set('x-telegram-id', '201');
    expect(other.status).toBe(200);
  });
});
