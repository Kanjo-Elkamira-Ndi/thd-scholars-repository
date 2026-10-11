import { describe, expect, it, vi } from 'vitest';
import { BotApiError, createApiClient } from './api-client';

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const options = { baseUrl: 'http://api.test', token: 'tok', timeoutMs: 1000 };

describe('createApiClient.getUserStatus', () => {
  it('sends the internal token and parses the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ user: { id: 'u1' }, roster: null }));
    const api = createApiClient({ ...options, fetchImpl });

    const result = await api.getUserStatus(111);

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/internal/users/111/status',
      expect.objectContaining({ headers: { 'X-Internal-Token': 'tok' } }),
    );
    expect(result).toEqual({ user: { id: 'u1' }, roster: null });
  });

  it('POSTs the join request with the internal token and json body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ joinRequestId: 'jr-1' }, 201));
    const api = createApiClient({ ...options, fetchImpl });
    const input = {
      telegramId: 1,
      chatId: -100,
      joinRequestedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = await api.recordJoinRequest(input);

    expect(result).toEqual({ joinRequestId: 'jr-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/internal/join-requests',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Internal-Token': 'tok', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  });

  it('claims join requests with an empty body by default', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [], inviteLinkExpirySeconds: 86400 }));
    const api = createApiClient({ ...options, fetchImpl });

    const result = await api.claimJoinRequests();

    expect(result).toEqual({ items: [], inviteLinkExpirySeconds: 86400 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/internal/join-requests/claim',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('reports completion to the id-scoped endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ deliveryStatus: 'delivered' }));
    const api = createApiClient({ ...options, fetchImpl });

    await api.completeJoinRequest('jr-9', { outcome: 'delivered' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/internal/join-requests/jr-9/complete',
      expect.objectContaining({ method: 'POST', body: '{"outcome":"delivered"}' }),
    );
  });

  it('throws BotApiError with the API error code on a non-2xx response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { code: 'NOT_FOUND', message: 'no user' } }, 404),
      );
    const api = createApiClient({ ...options, fetchImpl });

    const error = await api.getUserStatus(111).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BotApiError);
    expect((error as BotApiError).status).toBe(404);
    expect((error as BotApiError).code).toBe('NOT_FOUND');
  });

  it('throws BotApiError with NETWORK_ERROR when the request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('timed out'));
    const api = createApiClient({ ...options, fetchImpl });

    const error = await api.getUserStatus(111).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BotApiError);
    expect((error as BotApiError).code).toBe('NETWORK_ERROR');
  });
});
