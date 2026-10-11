import type { MemberRemovalTask } from '@thd/shared';
import type { Logger } from 'pino';
import type { Telegraf } from 'telegraf';
import { isUserNotInChat } from '../utils/telegram-errors';
import type { BotApiClient } from './api-client';

export interface MemberRemovalDeps {
  api: BotApiClient;
  telegram: Telegraf['telegram'];
  channelId: string;
  logger: Pick<Logger, 'warn' | 'info' | 'error'>;
}

export interface MemberRemovalLoopDeps extends MemberRemovalDeps {
  intervalMs: number;
  batchSize: number;
}

export const removeMember = async (
  task: MemberRemovalTask,
  deps: MemberRemovalDeps,
): Promise<void> => {
  const { api, telegram, channelId, logger } = deps;
  try {
    try {
      await telegram.banChatMember(channelId, task.telegramId);
    } catch (err) {
      if (!isUserNotInChat(err)) {
        throw err;
      }
      await api.completeMemberRemoval(task.id, { outcome: 'removed' });
      return;
    }
    await telegram.unbanChatMember(channelId, task.telegramId, { only_if_banned: true });
    await api.completeMemberRemoval(task.id, { outcome: 'removed' });
  } catch (err) {
    logger.error({ err, memberRemovalId: task.id }, 'member removal failed');
    await api
      .completeMemberRemoval(task.id, { outcome: 'failed', error: (err as Error).message })
      .catch((reportErr) => {
        logger.error({ err: reportErr }, 'failed to report member removal failure');
      });
  }
};

export const runMemberRemovalTick = async (deps: MemberRemovalLoopDeps): Promise<void> => {
  const items = await deps.api.claimMemberRemovals(deps.batchSize);
  await Promise.all(items.map((task) => removeMember(task, deps)));
};

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export const startMemberRemovalLoop = (deps: MemberRemovalLoopDeps): void => {
  if (running) {
    return;
  }
  running = true;
  deps.logger.info(
    { intervalMs: deps.intervalMs, batchSize: deps.batchSize },
    'member removal loop started',
  );
  const tick = async (): Promise<void> => {
    if (!running) {
      return;
    }
    try {
      await runMemberRemovalTick(deps);
    } catch (err) {
      deps.logger.error({ err }, 'member removal tick failed');
    }
    if (running) {
      timer = setTimeout(() => void tick(), deps.intervalMs);
    }
  };
  void tick();
};

export const stopMemberRemovalLoop = (): void => {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};
