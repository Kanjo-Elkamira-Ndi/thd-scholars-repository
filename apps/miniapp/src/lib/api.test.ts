import type { ContentPost, RegistrationPayload, SystemSettings, UserStatusResponse } from '@thd/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import {
  API_BASE_URL,
  apiFetch,
  authHeaders,
  buildQuery,
  deleteContent,
  getContentPost,
  getDashboard,
  getMe,
  getRosterAudit,
  getSettings,
  listAuditLogs,
  listContent,
  listMembers,
  listRoster,
  listUsers,
  postRegistration,
  removeMember,
  updateRoster,
  updateSettings,
  updateUserRole,
  uploadContent,
} from './api';

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

describe('buildQuery', () => {
  it('serialises values and drops empty ones', () => {
    expect(buildQuery({ discipline: 'Missiology', page: 2 })).toBe('?discipline=Missiology&page=2');
    expect(buildQuery({ page: undefined, search: '', status: null })).toBe('');
    expect(buildQuery({ accessReviewPending: false })).toBe('?accessReviewPending=false');
  });
});

describe('content resources', () => {
  const post: ContentPost = {
    id: 'c1',
    title: 'Hermeneutics 101',
    disciplineTag: 'Hermeneutics',
    formatTag: 'audio_lecture',
    cohortTag: 2025,
    postedBy: 'u1',
    telegramMessageId: null,
    driveLink: null,
    fileSizeBytes: null,
    pendingAction: 'publish',
    deliveryStatus: 'pending',
    deliveryAttempts: 0,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('listContent builds a query string with only set filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 2, pageSize: 10 }));
    vi.stubGlobal('fetch', fetchMock);

    await listContent({ discipline: 'Missiology', page: 2, search: '' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/content?discipline=Missiology&page=2`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('mine + deliveryStatus serialise into the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 }));
    vi.stubGlobal('fetch', fetchMock);

    await listContent({ mine: true, deliveryStatus: 'failed' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/content?mine=true&deliveryStatus=failed`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getContentPost unwraps the envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ contentPost: post })));
    await expect(getContentPost('c1')).resolves.toEqual(post);
  });

  it('deleteContent returns the hardDeleted flag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ hardDeleted: true })));
    await expect(deleteContent('c1')).resolves.toEqual({ hardDeleted: true });
  });
});

describe('roster resources', () => {
  it('listRoster serialises the accessReviewPending filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 }));
    vi.stubGlobal('fetch', fetchMock);

    await listRoster({ accessReviewPending: true, status: 'active' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/roster?accessReviewPending=true&status=active`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('updateRoster PATCHes and unwraps the entry', async () => {
    const entry = { id: 'r1', status: 'graduated' } as unknown as Record<string, unknown>;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ rosterEntry: entry })));
    await expect(updateRoster('r1', { status: 'graduated' })).resolves.toEqual(entry);
  });

  it('getRosterAudit unwraps the issues array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ issues: [{ issue: 'active_not_member' }] })));
    await expect(getRosterAudit()).resolves.toEqual([{ issue: 'active_not_member' }]);
  });

  it('removeMember posts to the removal endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ removal: { id: 'x' }, created: true }, 202));
    vi.stubGlobal('fetch', fetchMock);

    await expect(removeMember('u9', 'spam')).resolves.toEqual({ removal: { id: 'x' }, created: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/members/u9/remove`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('dashboard + admin resources', () => {
  const adminPayload = {
    role: 'admin',
    totalScholars: 3,
    pendingJoinRequests: 1,
    pendingAccessReviews: 2,
    contentByDiscipline: [{ discipline: 'Missiology', count: 4 }],
    recentActivity: [
      { action: 'update_settings', actorUserId: 'u1', targetType: 'settings', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
  };

  it('getDashboard GETs /dashboard and unwraps the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ dashboard: adminPayload }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDashboard()).resolves.toEqual(adminPayload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/dashboard`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('listUsers GETs /users and unwraps the array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ users: [sample.user] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listUsers()).resolves.toEqual([sample.user]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/users`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('updateUserRole PATCHes /users/:id/role with { role }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: { ...sample.user, role: 'faculty' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateUserRole('u1', 'faculty')).resolves.toMatchObject({ role: 'faculty' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/users/u1/role`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'faculty' }) }),
    );
  });

  it('listAuditLogs GETs /audit-logs with query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ logs: [], total: 0, page: 2, pageSize: 50 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listAuditLogs({ action: 'update_settings', page: 2, pageSize: 50 })).resolves.toEqual({
      logs: [],
      total: 0,
      page: 2,
      pageSize: 50,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/audit-logs?action=update_settings&page=2&pageSize=50`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('listAuditLogs omits unset params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ logs: [], total: 0, page: 1, pageSize: 20 }));
    vi.stubGlobal('fetch', fetchMock);

    await listAuditLogs();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/audit-logs`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getSettings GETs /settings and unwraps the object', async () => {
    const settings: SystemSettings = {
      registrationIdPattern: 'DIBI-THD-####',
      availableCohortYears: [2026],
      inviteLinkExpirySeconds: 3600,
      maxUploadSizeBytes: 1024,
      maxContentUploadBytes: 2048,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ settings }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSettings()).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/settings`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('updateSettings PATCHes only the given fields', async () => {
    const settings = { maxContentUploadBytes: 4096 };
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ settings: { ...settings, registrationIdPattern: 'kept' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateSettings({ maxContentUploadBytes: 4096 })).resolves.toEqual({
      ...settings,
      registrationIdPattern: 'kept',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/settings`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ maxContentUploadBytes: 4096 }),
      }),
    );
  });

  it('listMembers GETs /members and unwraps the array', async () => {
    const members = [{ id: 'm1', userId: 'u1', fullName: 'Ada' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ members }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listMembers()).resolves.toEqual(members);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/members`,
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

interface FakeProgressEvent {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

class FakeXhr {
  static last: FakeXhr | null = null;
  method = '';
  url = '';
  status = 201;
  responseText = '';
  headers: Record<string, string> = {};
  sentBody: FormData | null = null;
  onprogress: ((event: FakeProgressEvent) => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: { onprogress: ((event: FakeProgressEvent) => void) | null } = { onprogress: null };

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }
  send(body: FormData): void {
    this.sentBody = body;
  }
  abort(): void {
    this.onabort?.();
  }
}

describe('uploadContent', () => {
  const file = new File(['bytes'], 'lecture.mp3', { type: 'audio/mpeg' });

  afterEach(() => {
    FakeXhr.last = null;
  });

  it('POSTs multipart with auth and resolves the created post', async () => {
    vi.stubEnv('VITE_MOCK_USER', JSON.stringify({ id: 42 }));
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);

    const promise = uploadContent(
      { title: 'Lesson 1', disciplineTag: 'Hermeneutics', formatTag: 'audio_lecture', cohortYear: 2025 },
      file,
    );

    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(`${API_BASE_URL}/content`);
    expect(xhr.headers).toEqual({ 'x-mock-user': '{"id":42}' });
    expect(xhr.sentBody?.get('title')).toBe('Lesson 1');
    expect(xhr.sentBody?.get('cohortYear')).toBe('2025');
    expect(xhr.sentBody?.get('file')).toBe(file);

    xhr.status = 201;
    xhr.responseText = JSON.stringify({ contentPost: { id: 'c9' } });
    xhr.onload?.();

    await expect(promise).resolves.toEqual({ id: 'c9' });
  });

  it('reports byte progress', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const onProgress = vi.fn();

    uploadContent({ title: 'T', disciplineTag: 'Missiology', formatTag: 'research_pdf' }, file, {
      onProgress,
    });

    const xhr = FakeXhr.last as FakeXhr;
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 });
    expect(onProgress).toHaveBeenCalledWith(25);
  });

  it('maps an error envelope onto ApiError', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);

    const promise = uploadContent(
      { title: 'T', disciplineTag: 'Missiology', formatTag: 'research_pdf' },
      file,
    );

    const xhr = FakeXhr.last as FakeXhr;
    xhr.status = 400;
    xhr.responseText = JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Bad file' } });
    xhr.onload?.();

    await expect(promise).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Bad file',
    });
  });

  it('maps a network failure to a NETWORK_ERROR ApiError', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);

    const promise = uploadContent(
      { title: 'T', disciplineTag: 'Missiology', formatTag: 'research_pdf' },
      file,
    );

    (FakeXhr.last as FakeXhr).onerror?.();
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
