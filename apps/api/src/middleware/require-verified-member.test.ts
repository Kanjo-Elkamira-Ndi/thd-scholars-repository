import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@thd/shared';

const mocks = vi.hoisted(() => ({
  getActiveRosterByUserId: vi.fn(),
}));

vi.mock('../repositories/roster.repository', () => ({
  getActiveRosterByUserId: mocks.getActiveRosterByUserId,
}));

import { requireVerifiedMember } from './require-verified-member';

const makeUser = (role: User['role']): User => ({
  id: `user-${role}`,
  telegramId: 1,
  telegramUsername: null,
  fullName: role,
  email: null,
  role,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeRes = (): Response => ({} as Response);

const invoke = async (user?: User): Promise<NextFunction> => {
  const next = vi.fn() as unknown as NextFunction;
  await requireVerifiedMember({ user } as Request, makeRes(), next);
  return next;
};

beforeEach(() => {
  mocks.getActiveRosterByUserId.mockReset();
});

describe('requireVerifiedMember', () => {
  it('rejects an unauthenticated request with UNAUTHORIZED', async () => {
    const next = await invoke(undefined);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }));
    expect(mocks.getActiveRosterByUserId).not.toHaveBeenCalled();
  });

  it.each(['faculty', 'registrar', 'admin'] as const)('passes %s without a roster lookup', async (role) => {
    const next = await invoke(makeUser(role));
    expect(next).toHaveBeenCalledWith();
    expect(mocks.getActiveRosterByUserId).not.toHaveBeenCalled();
  });

  it('passes a scholar with an active roster entry', async () => {
    mocks.getActiveRosterByUserId.mockResolvedValue({ id: 'roster-1', status: 'active' });
    const next = await invoke(makeUser('scholar'));
    expect(next).toHaveBeenCalledWith();
    expect(mocks.getActiveRosterByUserId).toHaveBeenCalledWith('user-scholar');
  });

  it('blocks a scholar with no active roster entry', async () => {
    mocks.getActiveRosterByUserId.mockResolvedValue(null);
    const next = await invoke(makeUser('scholar'));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_VERIFIED', status: 403 }));
  });
});
