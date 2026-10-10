import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserByTelegramId: vi.fn(),
  getRosterByUserId: vi.fn(),
}));

vi.mock('../repositories/users.repository', () => ({
  getUserByTelegramId: mocks.getUserByTelegramId,
}));
vi.mock('../repositories/roster.repository', () => ({
  getRosterByUserId: mocks.getRosterByUserId,
}));

import { getUserStatus } from './internal-status-controller';

const makeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe('getUserStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a non-numeric telegramId', async () => {
    const req = { params: { telegramId: 'abc' } } as unknown as Request;
    await expect(getUserStatus(req, makeRes())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  });

  it('returns 404 for an unknown user', async () => {
    mocks.getUserByTelegramId.mockResolvedValue(null);
    const req = { params: { telegramId: '111' } } as unknown as Request;
    await expect(getUserStatus(req, makeRes())).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('returns { user, roster } for a known user', async () => {
    mocks.getUserByTelegramId.mockResolvedValue({ id: 'u1', telegramId: 111 });
    mocks.getRosterByUserId.mockResolvedValue({ id: 'r1', status: 'active' });
    const req = { params: { telegramId: '111' } } as unknown as Request;
    const res = makeRes();

    await getUserStatus(req, res);

    expect(mocks.getRosterByUserId).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: { id: 'u1', telegramId: 111 },
      roster: { id: 'r1', status: 'active' },
    });
  });
});
