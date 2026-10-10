import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@thd/shared';
import { signInitData } from '../auth/telegram-init-data';
import { authUser } from './auth';

const { envMock, upsertMock } = vi.hoisted(() => {
  const envMock = {
    BOT_TOKEN: '123456789:TEST-BOT-TOKEN',
    TELEGRAM_AUTH_MAX_AGE_SECONDS: 86400,
    API_INTERNAL_TOKEN: 'test-internal-token',
    MINIAPP_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgres://dummy/dummy',
    PORT: 3000,
    NODE_ENV: 'test',
    AUTH_MOCK_ENABLED: true,
  };
  const upsertMock = vi.fn();
  return { envMock, upsertMock };
});

vi.mock('../config/env', () => ({ env: envMock }));
vi.mock('../repositories/users.repository', () => ({ upsertByTelegram: upsertMock }));

const baseUser: User = {
  id: '11111111-1111-1111-1111-111111111111',
  telegramId: 4444444444,
  telegramUsername: 'dev_admin',
  fullName: 'Dev Admin',
  email: null,
  role: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const makeReq = (headers: Record<string, string> = {}): Request =>
  ({ get: (name: string) => headers[name.toLowerCase()] }) as unknown as Request;

describe('authUser', () => {
  it('ignores X-Mock-User when AUTH_MOCK_ENABLED=false', async () => {
    envMock.AUTH_MOCK_ENABLED = false;
    const next = vi.fn();
    await authUser(
      makeReq({ authorization: 'tma some-init-data', 'x-mock-user': '{"id":1}' }),
      {} as Response,
      next as NextFunction,
    );
    expect(upsertMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('rejects a missing Authorization header', async () => {
    envMock.AUTH_MOCK_ENABLED = false;
    const next = vi.fn();
    await authUser(makeReq({}), {} as Response, next as NextFunction);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('rejects a non-tma Authorization scheme', async () => {
    envMock.AUTH_MOCK_ENABLED = false;
    const next = vi.fn();
    await authUser(makeReq({ authorization: 'Bearer abc' }), {} as Response, next as NextFunction);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('rejects an X-Mock-User carrying a role key', async () => {
    envMock.AUTH_MOCK_ENABLED = true;
    const next = vi.fn();
    await authUser(
      makeReq({ 'x-mock-user': '{"id":1,"role":"admin"}' }),
      {} as Response,
      next as NextFunction,
    );
    expect(upsertMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('accepts a valid X-Mock-User and attaches the stubbed user', async () => {
    envMock.AUTH_MOCK_ENABLED = true;
    upsertMock.mockResolvedValue(baseUser);
    const req = makeReq({
      'x-mock-user': '{"id":4444444444,"username":"dev_admin","firstName":"Dev","lastName":"Admin"}',
    });
    const next = vi.fn();
    await authUser(req, {} as Response, next as NextFunction);
    expect(req.user).toEqual(baseUser);
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts a validly signed initData when mock is off', async () => {
    envMock.AUTH_MOCK_ENABLED = false;
    upsertMock.mockResolvedValue(baseUser);
    const initData = signInitData(
      { telegramId: 4444444444, username: 'dev_admin' },
      envMock.BOT_TOKEN,
    );
    const req = makeReq({ authorization: `tma ${initData}` });
    const next = vi.fn();
    await authUser(req, {} as Response, next as NextFunction);
    expect(req.user).toEqual(baseUser);
    expect(next).toHaveBeenCalledWith();
  });
});
