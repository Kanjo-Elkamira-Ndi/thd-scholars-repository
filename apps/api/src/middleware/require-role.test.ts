import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@thd/shared';
import { requireRole } from './require-role';

const makeReq = (user?: User): Request => ({ user } as unknown as Request);

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

describe('requireRole', () => {
  it('rejects unauthenticated requests with 401', () => {
    const handler = requireRole('admin');
    const req = makeReq();
    const next = vi.fn();
    handler(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }),
    );
  });

  it('allows admin on an admin route', () => {
    const handler = requireRole('admin');
    const req = makeReq(makeUser('admin'));
    const next = vi.fn();
    handler(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('denies scholar on admin, registrar, and faculty routes (403)', () => {
    for (const role of ['admin', 'registrar', 'faculty'] as const) {
      const handler = requireRole(role);
      const req = makeReq(makeUser('scholar'));
      const next = vi.fn();
      handler(req, {} as Response, next as NextFunction);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN' }));
    }
  });

  it('allows faculty on faculty route but denies on registrar route', () => {
    const allowed = requireRole('faculty');
    const req = makeReq(makeUser('faculty'));
    const nextA = vi.fn();
    allowed(req, {} as Response, nextA as NextFunction);
    expect(nextA).toHaveBeenCalledWith();

    const denied = requireRole('registrar');
    const nextD = vi.fn();
    denied(req, {} as Response, nextD as NextFunction);
    expect(nextD).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('allows registrar on registrar route but denies on faculty route', () => {
    const allowed = requireRole('registrar');
    const req = makeReq(makeUser('registrar'));
    const nextA = vi.fn();
    allowed(req, {} as Response, nextA as NextFunction);
    expect(nextA).toHaveBeenCalledWith();

    const denied = requireRole('faculty');
    const nextD = vi.fn();
    denied(req, {} as Response, nextD as NextFunction);
    expect(nextD).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});
