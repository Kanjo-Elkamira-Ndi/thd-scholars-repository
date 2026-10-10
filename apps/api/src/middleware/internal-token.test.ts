import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { internalServiceToken } from './internal-token';

const TOKEN = 'test-internal-token';

const makeReq = (header?: string): Request =>
  ({
    get: (name: string) => (name.toLowerCase() === 'x-internal-token' ? header : undefined),
  }) as unknown as Request;

describe('internalServiceToken', () => {
  it('accepts the correct token and marks the request as from the bot', () => {
    const req = makeReq(TOKEN);
    const next = vi.fn();
    internalServiceToken(req, {} as Response, next as NextFunction);
    expect((req as { service?: string }).service).toBe('bot');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a wrong token with 401', () => {
    const req = makeReq('wrong-token');
    const next = vi.fn();
    internalServiceToken(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }),
    );
  });

  it('rejects a wrong-length token with 401 (never 500)', () => {
    const req = makeReq('ab');
    const next = vi.fn();
    expect(() => internalServiceToken(req, {} as Response, next as NextFunction)).not.toThrow();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }),
    );
  });

  it('rejects a missing token with 401', () => {
    const req = makeReq(undefined);
    const next = vi.fn();
    internalServiceToken(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });
});
