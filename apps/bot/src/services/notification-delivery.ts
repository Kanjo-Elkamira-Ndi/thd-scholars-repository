import type { NotificationTask } from '@thd/shared';
import type { Logger } from 'pino';
import type { Telegraf } from 'telegraf';
import { renderNotification } from '../templates/notification';
import { isBotBlocked, isUserNotInChat } from '../utils/telegram-errors';
import type { BotApiClient } from './api-client';

export interface NotificationDeps {
  api: BotApiClient;
  telegram: Telegraf['telegram'];
  logger: Pick<Logger, 'warn' | 'info' | 'error'>;
}

export interface NotificationLoopDeps extends NotificationDeps {
  intervalMs: number;
  batchSize: number;
}

export const deliverNotification = async (
  task: NotificationTask,
  deps: NotificationDeps,
): Promise<void> => {
  const text = renderNotification({ event: task.event, payload: task.payload });
  try {
    await deps.telegram.sendMessage(task.telegramId, text, { parse_mode: 'HTML' });
    await deps.api.completeNotification(task.id, { outcome: 'sent' });
  } catch (err) {
    const terminal = isBotBlocked(err) || isUserNotInChat(err);
    const message = err instanceof Error ? err.message : String(err);
    deps.logger.warn(
      { userId: task.userId, event: task.event, terminal },
      'notification delivery failed',
    );
    await deps.api.completeNotification(task.id, {
      outcome: 'failed',
      error: message.slice(0, 1000),
      terminal,
    });
  }
};

export const runNotificationTick = async (deps: NotificationLoopDeps): Promise<void> => {
  const tasks = await deps.api.claimNotifications(deps.batchSize);
  await Promise.all(tasks.map((task) => deliverNotification(task, deps)));
};

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export const startNotificationLoop = (deps: NotificationLoopDeps): void => {
  if (running) {
    return;
  }
  running = true;
  deps.logger.info(
    { intervalMs: deps.intervalMs, batchSize: deps.batchSize },
    'notification delivery loop started',
  );
  const tick = async (): Promise<void> => {
    if (!running) {
      return;
    }
    try {
      await runNotificationTick(deps);
    } catch (err) {
      deps.logger.error({ err }, 'notification delivery tick failed');
    }
    if (running) {
      timer = setTimeout(() => void tick(), deps.intervalMs);
    }
  };
  void tick();
};

export const stopNotificationLoop = (): void => {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};
