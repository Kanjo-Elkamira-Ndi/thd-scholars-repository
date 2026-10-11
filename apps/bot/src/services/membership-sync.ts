import type { MembershipSnapshotEntry } from '@thd/shared';
import type { Logger } from 'pino';
import type { Telegraf } from 'telegraf';
import type { BotApiClient } from './api-client';

export interface MembershipSyncDeps {
  api: BotApiClient;
  telegram: Telegraf['telegram'];
  channelId: string;
  logger: Pick<Logger, 'warn' | 'info' | 'error'>;
  intervalMs: number;
  ratePerSec: number;
  sleep?: (ms: number) => Promise<void>;
}

const MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getRetryAfter = (err: unknown): number | null => {
  if (!err || typeof err !== 'object') return null;
  const anyErr = err as {
    parameters?: { retry_after?: number };
    response?: { parameters?: { retry_after?: number } };
  };
  const retryAfter =
    anyErr.parameters?.retry_after ?? anyErr.response?.parameters?.retry_after ?? null;
  return typeof retryAfter === 'number' ? retryAfter : null;
};

export const syncMembershipOnce = async (deps: MembershipSyncDeps): Promise<void> => {
  const sleep = deps.sleep ?? defaultSleep;
  const targets = await deps.api.getMembershipReconcileTargets();
  const gapMs = Math.ceil(1000 / deps.ratePerSec);
  const snapshot: MembershipSnapshotEntry[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    if (index > 0) {
      await sleep(gapMs);
    }
    const target = targets[index];
    try {
      const member = await deps.telegram.getChatMember(deps.channelId, target.telegramId);
      snapshot.push({
        telegramId: target.telegramId,
        isMember: MEMBER_STATUSES.has(member.status),
        memberStatus: member.status,
      });
    } catch (err) {
      const retryAfter = getRetryAfter(err);
      if (retryAfter !== null) {
        await sleep(retryAfter * 1000);
        continue;
      }
      deps.logger.warn(
        { err, telegramId: target.telegramId },
        'membership getChatMember failed; skipping user',
      );
    }
  }

  if (snapshot.length > 0) {
    await deps.api.pushMembershipSnapshot(snapshot);
  }
};

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export const startMembershipSyncLoop = (deps: MembershipSyncDeps): void => {
  if (running) {
    return;
  }
  running = true;
  deps.logger.info(
    { intervalMs: deps.intervalMs, ratePerSec: deps.ratePerSec },
    'membership sync loop started',
  );
  const tick = async (): Promise<void> => {
    if (!running) {
      return;
    }
    try {
      await syncMembershipOnce(deps);
    } catch (err) {
      deps.logger.error({ err }, 'membership sync tick failed');
    }
    if (running) {
      timer = setTimeout(() => void tick(), deps.intervalMs);
    }
  };
  void tick();
};

export const stopMembershipSyncLoop = (): void => {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};
