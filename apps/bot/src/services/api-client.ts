import type {
  ClaimContentTasksInput,
  ClaimContentTasksResponse,
  ClaimJoinRequestsInput,
  ClaimJoinRequestsResponse,
  CompleteContentTaskInput,
  CompleteJoinRequestInput,
  MemberRemovalTask,
  MembershipReconcileTarget,
  MembershipSnapshotEntry,
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

export interface ContentDownloadResult {
  body: ArrayBuffer;
  mimeType: string | null;
  fileName: string | null;
}

export interface BotApiClient {
  getUserStatus(telegramId: number): Promise<UserStatusResponse>;
  recordJoinRequest(input: RecordJoinRequestInput): Promise<{ joinRequestId: string }>;
  claimJoinRequests(input?: ClaimJoinRequestsInput): Promise<ClaimJoinRequestsResponse>;
  completeJoinRequest(id: string, input: CompleteJoinRequestInput): Promise<void>;
  claimContentTasks(input?: ClaimContentTasksInput): Promise<ClaimContentTasksResponse>;
  completeContentTask(
    id: string,
    input: CompleteContentTaskInput,
  ): Promise<{ deliveryStatus: string }>;
  downloadContent(id: string): Promise<ContentDownloadResult>;
  getMembershipReconcileTargets(): Promise<MembershipReconcileTarget[]>;
  pushMembershipSnapshot(entries: MembershipSnapshotEntry[]): Promise<void>;
  claimMemberRemovals(limit?: number): Promise<MemberRemovalTask[]>;
  completeMemberRemoval(
    id: string,
    input: { outcome: 'removed' | 'failed'; error?: string },
  ): Promise<void>;
}

const parseFileName = (contentDisposition: string | null): string | null => {
  if (!contentDisposition) return null;
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return match ? match[1] : null;
};

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

    async claimContentTasks(input = {}): Promise<ClaimContentTasksResponse> {
      const body = await request('/internal/content/claim', { method: 'POST', body: input });
      return body as ClaimContentTasksResponse;
    },

    async completeContentTask(
      id: string,
      input: CompleteContentTaskInput,
    ): Promise<{ deliveryStatus: string }> {
      const body = await request(`/internal/content/${id}/confirm`, { method: 'POST', body: input });
      return body as { deliveryStatus: string };
    },

    async downloadContent(id: string): Promise<ContentDownloadResult> {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/internal/content/${id}/download`, {
          method: 'GET',
          headers: { 'X-Internal-Token': token },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new BotApiError(
          0,
          'NETWORK_ERROR',
          err instanceof Error ? err.message : 'download failed',
        );
      }

      if (!res.ok) {
        let code = 'UNKNOWN';
        let message = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { code?: string; message?: string } };
          code = body.error?.code ?? code;
          message = body.error?.message ?? message;
        } catch {
          // non-json error body
        }
        throw new BotApiError(res.status, code, message);
      }

      const body = await res.arrayBuffer();
      return {
        body,
        mimeType: res.headers.get('content-type'),
        fileName: parseFileName(res.headers.get('content-disposition')),
      };
    },

    async getMembershipReconcileTargets(): Promise<MembershipReconcileTarget[]> {
      const body = await request('/internal/members/reconcile-targets');
      return (body as { targets: MembershipReconcileTarget[] }).targets;
    },

    async pushMembershipSnapshot(entries: MembershipSnapshotEntry[]): Promise<void> {
      await request('/internal/members/snapshot', {
        method: 'PUT',
        body: { members: entries },
      });
    },

    async claimMemberRemovals(limit?: number): Promise<MemberRemovalTask[]> {
      const body = await request('/internal/members/removals/claim', {
        method: 'POST',
        body: limit === undefined ? {} : { limit },
      });
      return (body as { items: MemberRemovalTask[] }).items;
    },

    async completeMemberRemoval(
      id: string,
      input: { outcome: 'removed' | 'failed'; error?: string },
    ): Promise<void> {
      await request(`/internal/members/removals/${id}/confirm`, { method: 'POST', body: input });
    },
  };
};
