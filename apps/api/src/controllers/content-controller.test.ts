import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getContentPost: vi.fn(),
}));

vi.mock('../services/content.service', () => ({
  getContentPost: mocks.getContentPost,
}));

import { getContentById } from './content-controller';

const makeRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

const makeReq = (params: Record<string, string>): Request =>
  ({ params, user: { id: 'faculty-1' } }) as unknown as Request;

beforeEach(() => vi.clearAllMocks());

describe('getContentById', () => {
  it('rejects a non-UUID id with VALIDATION_ERROR without calling the service', async () => {
    await expect(getContentById(makeReq({ id: 'not-a-uuid' }), makeRes())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(mocks.getContentPost).not.toHaveBeenCalled();
  });

  it('returns a contentPost envelope for a valid id', async () => {
    const post = { id: '11111111-1111-1111-1111-111111111111', title: 'The Doctrine of Grace' };
    mocks.getContentPost.mockResolvedValue(post);
    const res = makeRes();

    await getContentById(makeReq({ id: post.id }), res);

    expect(mocks.getContentPost).toHaveBeenCalledWith(post.id);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ contentPost: post });
  });

  it('propagates NOT_FOUND from the service', async () => {
    mocks.getContentPost.mockRejectedValue(
      Object.assign(new Error('Content post not found'), { code: 'NOT_FOUND', status: 404 }),
    );

    await expect(
      getContentById(makeReq({ id: '11111111-1111-1111-1111-111111111111' }), makeRes()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
