import type {
  AuditLog,
  ContentCreateInput,
  ContentDeliveryStatus,
  ContentFormat,
  ContentPost,
  ContentUpdateInput,
  DashboardPayload,
  DisciplineTag,
  MemberRemoval,
  MemberSummary,
  RegistrationPayload,
  RegistrationResult,
  Role,
  RosterAuditEntry,
  RosterEntry,
  RosterStatus,
  RosterUpdateInput,
  SystemSettings,
  User,
  UserStatusResponse,
} from '@thd/shared';
import { ApiError } from './errors';
import { getInitData, getMockUser } from './telegram';

export { ApiError } from './errors';

const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Normalised API base (no trailing slash), e.g. `http://localhost:3000/api`. */
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

/**
 * Auth headers for the current environment.
 *
 * Real Telegram initData wins; in local dev with no Telegram client we fall
 * back to the API's mocked identity via `x-mock-user` (only honoured when the
 * API has `AUTH_MOCK_ENABLED=true`).
 */
export function authHeaders(): Record<string, string> {
  const initData = getInitData();
  if (initData) return { authorization: `tma ${initData}` };

  const mockUser = getMockUser();
  if (mockUser) return { 'x-mock-user': JSON.stringify(mockUser) };

  return {};
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

async function readErrorEnvelope(response: Response): Promise<ApiErrorEnvelope | null> {
  try {
    return (await response.json()) as ApiErrorEnvelope;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    if ((cause as { name?: string })?.name === 'AbortError') throw cause;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  if (!response.ok) {
    const envelope = await readErrorEnvelope(response);
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? `Request failed with status ${response.status}`,
      envelope?.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Current user + roster status. The app's identity call. */
export function getMe(signal?: AbortSignal): Promise<UserStatusResponse> {
  return apiFetch<UserStatusResponse>('/me', { signal });
}

/** Submit a registration. The API replies 201 with the decision and optional reason. */
export function postRegistration(
  payload: RegistrationPayload,
  signal?: AbortSignal,
): Promise<RegistrationResult> {
  return apiFetch<RegistrationResult>('/registrations', { method: 'POST', body: payload, signal });
}

type QueryValue = string | number | boolean | null | undefined;

/** Serialise query params, dropping empty/`null`/`undefined` values. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContentListQuery {
  discipline?: DisciplineTag;
  format?: ContentFormat;
  cohortYear?: number;
  search?: string;
  mine?: boolean;
  deliveryStatus?: ContentDeliveryStatus;
  page?: number;
  pageSize?: number;
}

export interface RosterListQuery {
  status?: RosterStatus;
  cohortYear?: number;
  accessReviewPending?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Browse the content library. */
export function listContent(
  query: ContentListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<ContentPost>> {
  return apiFetch<Paginated<ContentPost>>(`/content${buildQuery({ ...query })}`, { signal });
}

/** Fetch a single content post (404 if missing or soft-deleted). */
export async function getContentPost(id: string, signal?: AbortSignal): Promise<ContentPost> {
  const { contentPost } = await apiFetch<{ contentPost: ContentPost }>(`/content/${id}`, {
    signal,
  });
  return contentPost;
}

/** Create a content post from a Drive link (no file bytes). */
export async function createContent(
  input: ContentCreateInput,
  signal?: AbortSignal,
): Promise<ContentPost> {
  const { contentPost } = await apiFetch<{ contentPost: ContentPost }>('/content', {
    method: 'POST',
    body: input,
    signal,
  });
  return contentPost;
}

/** Update the mutable metadata of a content post. */
export async function updateContent(
  id: string,
  patch: ContentUpdateInput,
  signal?: AbortSignal,
): Promise<ContentPost> {
  const { contentPost } = await apiFetch<{ contentPost: ContentPost }>(`/content/${id}`, {
    method: 'PATCH',
    body: patch,
    signal,
  });
  return contentPost;
}

/** Delete a content post. The API hard-deletes fresh posts and soft-deletes others. */
export function deleteContent(
  id: string,
  signal?: AbortSignal,
): Promise<{ hardDeleted: boolean }> {
  return apiFetch<{ hardDeleted: boolean }>(`/content/${id}`, { method: 'DELETE', signal });
}

export interface UploadContentFields {
  title: string;
  disciplineTag: DisciplineTag;
  formatTag: ContentFormat;
  cohortYear?: number;
}

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Upload a content file with real byte progress (XHR, not fetch).
 * Aborting rejects with a `NETWORK_ERROR`; callers that cancelled should ignore it.
 */
export function uploadContent(
  fields: UploadContentFields,
  file: File,
  { onProgress, signal }: UploadOptions = {},
): Promise<ContentPost> {
  return new Promise<ContentPost>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/content`);
    for (const [key, value] of Object.entries(authHeaders())) {
      xhr.setRequestHeader(key, value);
    }

    const form = new FormData();
    form.append('title', fields.title);
    form.append('disciplineTag', fields.disciplineTag);
    form.append('formatTag', fields.formatTag);
    if (fields.cohortYear !== undefined && fields.cohortYear !== null) {
      form.append('cohortYear', String(fields.cohortYear));
    }
    form.append('file', file);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    const parseEnvelope = (): ApiErrorEnvelope | null => {
      try {
        return JSON.parse(xhr.responseText) as ApiErrorEnvelope;
      } catch {
        return null;
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((JSON.parse(xhr.responseText) as { contentPost: ContentPost }).contentPost);
        } catch {
          reject(new ApiError(xhr.status, 'REQUEST_FAILED', 'Unexpected server response.'));
        }
        return;
      }
      const envelope = parseEnvelope();
      reject(
        new ApiError(
          xhr.status,
          envelope?.error?.code ?? 'REQUEST_FAILED',
          envelope?.error?.message ?? `Upload failed with status ${xhr.status}`,
          envelope?.error?.details,
        ),
      );
    };
    xhr.onerror = () => {
      reject(
        new ApiError(
          0,
          'NETWORK_ERROR',
          'Could not reach the server. Check your connection and try again.',
        ),
      );
    };
    xhr.onabort = () => {
      reject(
        new ApiError(
          0,
          'NETWORK_ERROR',
          'Could not reach the server. Check your connection and try again.',
        ),
      );
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}

/** Browse the roster with optional filters. */
export function listRoster(
  query: RosterListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<RosterEntry>> {
  return apiFetch<Paginated<RosterEntry>>(`/roster${buildQuery({ ...query })}`, { signal });
}

/** Fetch a single roster entry (404 if missing). */
export async function getRosterEntry(id: string, signal?: AbortSignal): Promise<RosterEntry> {
  const { rosterEntry } = await apiFetch<{ rosterEntry: RosterEntry }>(`/roster/${id}`, {
    signal,
  });
  return rosterEntry;
}

/** Update a roster entry's status/cohort/track/supervisor. */
export async function updateRoster(
  id: string,
  patch: RosterUpdateInput,
  signal?: AbortSignal,
): Promise<RosterEntry> {
  const { rosterEntry } = await apiFetch<{ rosterEntry: RosterEntry }>(`/roster/${id}`, {
    method: 'PATCH',
    body: patch,
    signal,
  });
  return rosterEntry;
}

/** Roster/membership inconsistencies for the audit segment. */
export async function getRosterAudit(
  signal?: AbortSignal,
): Promise<RosterAuditEntry[]> {
  const { issues } = await apiFetch<{ issues: RosterAuditEntry[] }>('/roster/audit', { signal });
  return issues;
}

/** Queue a member removal. The bot delivers it asynchronously. */
export function removeMember(
  userId: string,
  reason?: string,
  signal?: AbortSignal,
): Promise<{ removal: MemberRemoval; created: boolean }> {
  return apiFetch<{ removal: MemberRemoval; created: boolean }>(`/members/${userId}/remove`, {
    method: 'POST',
    body: reason ? { reason } : {},
    signal,
  });
}

export interface AuditLogQuery {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogPage {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

/** Role-aware dashboard payload; the shape depends on the caller's role. */
export async function getDashboard(signal?: AbortSignal): Promise<DashboardPayload> {
  const { dashboard } = await apiFetch<{ dashboard: DashboardPayload }>('/dashboard', { signal });
  return dashboard;
}

/** List every user account (admin only). */
export async function listUsers(signal?: AbortSignal): Promise<User[]> {
  const { users } = await apiFetch<{ users: User[] }>('/users', { signal });
  return users;
}

/** Change a user's role. Rejects self-changes and the last admin. */
export async function updateUserRole(
  id: string,
  role: Role,
  signal?: AbortSignal,
): Promise<User> {
  const { user } = await apiFetch<{ user: User }>(`/users/${id}/role`, {
    method: 'PATCH',
    body: { role },
    signal,
  });
  return user;
}

/** Filtered audit log page. */
export function listAuditLogs(
  query: AuditLogQuery = {},
  signal?: AbortSignal,
): Promise<AuditLogPage> {
  return apiFetch<AuditLogPage>(`/audit-logs${buildQuery({ ...query })}`, { signal });
}

/** Read the system settings. */
export async function getSettings(signal?: AbortSignal): Promise<SystemSettings> {
  const { settings } = await apiFetch<{ settings: SystemSettings }>('/settings', { signal });
  return settings;
}

/** Patch only the fields you send. */
export async function updateSettings(
  patch: Partial<SystemSettings>,
  signal?: AbortSignal,
): Promise<SystemSettings> {
  const { settings } = await apiFetch<{ settings: SystemSettings }>('/settings', {
    method: 'PATCH',
    body: patch,
    signal,
  });
  return settings;
}

/** Roster-backed member directory (admins and registrars). */
export async function listMembers(signal?: AbortSignal): Promise<MemberSummary[]> {
  const { members } = await apiFetch<{ members: MemberSummary[] }>('/members', { signal });
  return members;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
