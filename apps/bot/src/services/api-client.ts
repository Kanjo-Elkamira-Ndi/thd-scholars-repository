import type {
  ClaimJoinRequestsInput,
  ClaimJoinRequestsResponse,
  CompleteJoinRequestInput,
  RecordJoinRequestInput,
  UserStatusResponse,
} from '@thd/shared';

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
  recordJoinRequest(input: RecordJoinRequestInput): Promise<{ joinRequestId: string }>;
  claimJoinRequests(input?: ClaimJoinRequestsInput): Promise<ClaimJoinRequestsResponse>;
  completeJoinRequest(id: string, input: CompleteJoinRequestInput): Promise<void>;
}

export const createApiClient = ({
  baseUrl,
  token,
  timeoutMs,
  fetchImpl = fetch,
}: ApiClientOptions): BotApiClient => {
  const request = async (
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<unknown> => {
    const { method = 'GET', body } = options;
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          'X-Internal-Token': token,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new BotApiError(0, 'NETWORK_ERROR', `API request failed: ${(err as Error).message}`);
    }

    const parsed = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const errorBody = parsed as { error?: { code?: string; message?: string } } | null;
      throw new BotApiError(
        res.status,
        errorBody?.error?.code ?? 'API_ERROR',
        errorBody?.error?.message ?? `API responded with ${res.status}`,
      );
    }
    return parsed;
  };

  return {
    async getUserStatus(telegramId: number): Promise<UserStatusResponse> {
      const body = await request(`/internal/users/${telegramId}/status`);
      return body as UserStatusResponse;
    },

    async recordJoinRequest(input: RecordJoinRequestInput): Promise<{ joinRequestId: string }> {
      const body = await request('/internal/join-requests', { method: 'POST', body: input });
      return body as { joinRequestId: string };
    },

    async claimJoinRequests(input: ClaimJoinRequestsInput = {}): Promise<ClaimJoinRequestsResponse> {
      const body = await request('/internal/join-requests/claim', { method: 'POST', body: input });
      return body as ClaimJoinRequestsResponse;
    },

    async completeJoinRequest(id: string, input: CompleteJoinRequestInput): Promise<void> {
      await request(`/internal/join-requests/${id}/complete`, { method: 'POST', body: input });
    },
  };
};
