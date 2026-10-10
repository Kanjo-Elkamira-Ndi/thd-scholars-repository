import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRoster: vi.fn(),
  createRosterEntry: vi.fn(),
  updateRosterEntry: vi.fn(),
}));

vi.mock('../services/roster.service', () => ({
  listRoster: mocks.listRoster,
  createRosterEntry: mocks.createRosterEntry,
  updateRosterEntry: mocks.updateRosterEntry,
}));

import { patchRoster } from './roster-controller';

const makeRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

const makeReq = (params: Record<string, string>, body: unknown = {}): Request =>
  ({ params, body, user: { id: 'registrar-1' } }) as unknown as Request;

beforeEach(() => vi.clearAllMocks());

describe('patchRoster', () => {
  it('rejects a non-UUID id with VALIDATION_ERROR without calling the service', async () => {
    await expect(patchRoster(makeReq({ id: 'not-a-uuid' }), makeRes())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(mocks.updateRosterEntry).not.toHaveBeenCalled();
  });

  it('delegates a valid UUID to the service', async () => {
    mocks.updateRosterEntry.mockResolvedValue({ id: 'abc' });
    const res = makeRes();
    await patchRoster(
      makeReq({ id: '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }, { status: 'active' }),
      res,
    );
    expect(mocks.updateRosterEntry).toHaveBeenCalledWith({
      actorUserId: 'registrar-1',
      id: '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      patch: { status: 'active' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
