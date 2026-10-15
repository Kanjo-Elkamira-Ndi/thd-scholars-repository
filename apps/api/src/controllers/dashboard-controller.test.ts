import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDashboard: vi.fn() }));
vi.mock('../services/dashboard.service', () => ({ getDashboard: mocks.getDashboard }));

import { getDashboard } from './dashboard-controller';

const makeRes = () => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res as unknown as Response;
};

beforeEach(() => vi.clearAllMocks());

describe('getDashboard controller', () => {
  it('returns the payload with the request user role, ignoring query and body', async () => {
    const payload = { role: 'scholar', roster: null, recentContent: [] };
    mocks.getDashboard.mockResolvedValue(payload);
    const req = {
      user: { id: 'u1', role: 'scholar' },
      query: { role: 'admin' },
      body: { role: 'admin' },
      header: () => undefined,
    } as unknown as Request;
    const res = makeRes();

    await getDashboard(req, res);

    expect(mocks.getDashboard).toHaveBeenCalledWith({ id: 'u1', role: 'scholar' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ dashboard: payload });
  });

  it('401s without a user', async () => {
    await expect(
      getDashboard({ user: undefined } as unknown as Request, makeRes()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });
});
