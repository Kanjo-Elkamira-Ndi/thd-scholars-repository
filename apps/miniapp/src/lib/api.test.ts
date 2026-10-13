import type { RegistrationPayload, UserStatusResponse } from '@thd/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { API_BASE_URL, apiFetch, authHeaders, getMe, postRegistration } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const sample: UserStatusResponse = {
  user: {
    id: 'u1',
    telegramId: 100,
    telegramUsername: 'ada',
    fullName: 'Ada Lovelace',
    email: null,
    role: 'scholar',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  roster: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe('authHeaders', () => {
  it('prefers real Telegram initData', () => {
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'auth_date=1&hash=abc' },
    };
    expect(authHeaders()).toEqual({ authorization: 'tma auth_date=1&hash=abc' });
  });

  it('falls back to the dev mock user', () => {
    vi.stubEnv('VITE_MOCK_USER', JSON.stringify({ id: 42, username: 'ada' }));
    expect(authHeaders()).toEqual({ 'x-mock-user': '{"id":42,"username":"ada"}' });
  });

  it('returns no auth headers when neither is available', () => {
    expect(authHeaders()).toEqual({});
  });
});

describe('getMe', () => {
  it('parses a successful response and hits the /me endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sample));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_MOCK_USER', JSON.stringify({ id: 100 }));

    await expect(getMe()).resolves.toEqual(sample);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/me`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('maps the API error envelope onto ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Bad init data' } }, 401),
        ),
    );

    await expect(getMe()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Bad init data',
    });
  });

  it('maps a thrown network failure to a NETWORK_ERROR ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await getMe().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
    expect((error as ApiError).status).toBe(0);
  });
});

describe('apiFetch error details', () => {
  it('attaches the error envelope details to ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid payload',
              details: { formErrors: [], fieldErrors: { registrationId: ['bad'] } },
            },
          },
          400,
        ),
      ),
    );

    await expect(apiFetch('/registrations', { method: 'POST' })).rejects.toMatchObject({
      status: 400,
      details: { fieldErrors: { registrationId: ['bad'] } },
    });
  });
});

describe('postRegistration', () => {
  it('posts to /registrations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ decision: 'approved', reason: null }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const payload: RegistrationPayload = {
      fullName: 'Dev Scholar',
      registrationId: 'DIBI-THD-0042',
      cohortYear: 2025,
      email: 'dev@example.com',
      telegramUsername: '@dev_scholar',
      programTrack: 'Theology',
      declarationAccepted: true,
    };

    await expect(postRegistration(payload)).resolves.toEqual({
      decision: 'approved',
      reason: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/registrations'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
