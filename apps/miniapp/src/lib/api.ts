import type { RegistrationPayload, RegistrationResult, UserStatusResponse } from '@thd/shared';
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

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
