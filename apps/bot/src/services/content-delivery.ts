import type { ContentDeliveryTask } from '@thd/shared';
import type { Logger } from 'pino';
import { renderContentCaption, renderContentPost } from '../templates';
import { isMessageGone } from '../utils/telegram-errors';
import { BotApiError, type BotApiClient } from './api-client';

export interface TelegramContent {
  sendMessage(
    chatId: string,
    text: string,
    options?: Record<string, unknown>,
  ): Promise<{ message_id: number }>;
  sendAudio(
    chatId: string,
    audio: unknown,
    options?: Record<string, unknown>,
  ): Promise<{ message_id: number }>;
  sendVideo(
    chatId: string,
    video: unknown,
    options?: Record<string, unknown>,
  ): Promise<{ message_id: number }>;
  sendDocument(
    chatId: string,
    document: unknown,
    options?: Record<string, unknown>,
  ): Promise<{ message_id: number }>;
  deleteMessage(chatId: string, messageId: number): Promise<unknown>;
}

export interface ContentDeliveryDeps {
  api: BotApiClient;
  telegram: TelegramContent;
  channelId: string;
  logger: Logger;
}

export interface ContentLoopDeps extends ContentDeliveryDeps {
  intervalMs: number;
  batchSize: number;
}

const AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp4', 'audio/x-m4a']);
const VIDEO_MIME = new Set(['video/mp4']);

type SendMethod = 'sendAudio' | 'sendVideo' | 'sendDocument';

const methodFor = (mimeType: string): SendMethod => {
  if (AUDIO_MIME.has(mimeType)) return 'sendAudio';
  if (VIDEO_MIME.has(mimeType)) return 'sendVideo';
  return 'sendDocument';
};

const postInput = (task: ContentDeliveryTask) => ({
  title: task.title,
  disciplineTag: task.disciplineTag,
  formatTag: task.formatTag,
  cohortTag: task.cohortTag,
  driveLink: task.driveLink ?? '',
});

const deliverDelete = async (
  task: ContentDeliveryTask,
  { api, telegram, channelId }: ContentDeliveryDeps,
): Promise<void> => {
  try {
    await telegram.deleteMessage(channelId, task.telegramMessageId as number);
  } catch (err) {
    if (!isMessageGone(err)) {
      throw err;
    }
  }
  await api.completeContentTask(task.id, { outcome: 'deleted' });
};

const deliverDrive = async (
  task: ContentDeliveryTask,
  { api, telegram, channelId }: ContentDeliveryDeps,
): Promise<void> => {
  const sent = await telegram.sendMessage(channelId, renderContentPost(postInput(task)), {
    parse_mode: 'HTML',
  });
  await api.completeContentTask(task.id, {
    outcome: 'posted',
    telegramMessageId: sent.message_id,
  });
};

const deliverStaged = async (
  task: ContentDeliveryTask,
  { api, telegram, channelId }: ContentDeliveryDeps,
): Promise<void> => {
  let download;
  try {
    download = await api.downloadContent(task.id);
  } catch (err) {
    if (err instanceof BotApiError && err.status === 404) {
      await api.completeContentTask(task.id, {
        outcome: 'failed',
        error: 'staged file missing',
        terminal: true,
      });
      return;
    }
    throw err;
  }

  const mimeType = download.mimeType ?? task.stagedMimeType ?? 'application/octet-stream';
  const filename = download.fileName ?? task.stagedOriginalName ?? 'file';
  const file = { source: Buffer.from(download.body), filename };
  const extra = { caption: renderContentCaption(postInput(task)), parse_mode: 'HTML' };
  const method = methodFor(mimeType);

  const sent = await telegram[method](channelId, file, extra);
  await api.completeContentTask(task.id, {
    outcome: 'posted',
    telegramMessageId: sent.message_id,
  });
};

export const deliverContentTask = async (
  task: ContentDeliveryTask,
  deps: ContentDeliveryDeps,
): Promise<void> => {
  try {
    if (task.action === 'delete') {
      await deliverDelete(task, deps);
    } else if (task.driveLink) {
      await deliverDrive(task, deps);
    } else {
      await deliverStaged(task, deps);
    }
  } catch (err) {
    deps.logger.error({ err, contentId: task.id }, 'content delivery action threw');
    await deps.api
      .completeContentTask(task.id, { outcome: 'failed', error: (err as Error).message })
      .catch((reportErr) => {
        deps.logger.error({ err: reportErr }, 'failed to report content delivery failure');
      });
  }
};

export const runContentTick = async (deps: ContentLoopDeps): Promise<void> => {
  const { items } = await deps.api.claimContentTasks({ limit: deps.batchSize });
  await Promise.all(items.map((task) => deliverContentTask(task, deps)));
};

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export const startContentLoop = (deps: ContentLoopDeps): void => {
  if (running) {
    return;
  }
  running = true;
  deps.logger.info(
    { intervalMs: deps.intervalMs, batchSize: deps.batchSize },
    'content delivery loop started',
  );
  const tick = async (): Promise<void> => {
    if (!running) {
      return;
    }
    try {
      await runContentTick(deps);
    } catch (err) {
      deps.logger.error({ err }, 'content delivery tick failed');
    }
    if (running) {
      timer = setTimeout(() => void tick(), deps.intervalMs);
    }
  };
  void tick();
};

export const stopContentLoop = (): void => {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};
