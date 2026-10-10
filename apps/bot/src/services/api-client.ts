import type { UserStatusResponse } from '@thd/shared';

export class BotApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'BotApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface BotApiClient {
  getUserStatus(telegramId: number): Promise<UserStatusResponse>;
}

export const createApiClient = ({
  baseUrl,
  token,
  timeoutMs,
  fetchImpl = fetch,
}: ApiClientOptions): BotApiClient => {
  const request = async (path: string): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        headers: { 'X-Internal-Token': token },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new BotApiError(0, 'NETWORK_ERROR', `API request failed: ${(err as Error).message}`);
    }

    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const errorBody = body as { error?: { code?: string; message?: string } } | null;
      throw new BotApiError(
        res.status,
        errorBody?.error?.code ?? 'API_ERROR',
        errorBody?.error?.message ?? `API responded with ${res.status}`,
      );
    }
    return body;
  };

  return {
    async getUserStatus(telegramId: number): Promise<UserStatusResponse> {
      const body = await request(`/internal/users/${telegramId}/status`);
      return body as UserStatusResponse;
    },
  };
};
