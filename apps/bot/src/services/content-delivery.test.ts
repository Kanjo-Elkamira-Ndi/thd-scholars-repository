import type { ContentDeliveryTask } from '@thd/shared';
import { describe, expect, it, vi } from 'vitest';
import { BotApiError } from './api-client';
import {
  deliverContentTask,
  runContentTick,
  startContentLoop,
  stopContentLoop,
  type ContentDeliveryDeps,
} from './content-delivery';

const publishTask = (over: Partial<ContentDeliveryTask> = {}): ContentDeliveryTask => ({
  id: 'c-1',
  action: 'publish',
  title: 'The Doctrine of Grace',
  disciplineTag: 'SystematicTheology',
  formatTag: 'ebook',
  cohortTag: 2025,
  telegramMessageId: null,
  driveLink: 'https://drive.google.com/file/d/abc/view',
  hasStagedFile: false,
  stagedMimeType: null,
  stagedOriginalName: null,
  ...over,
});

const stagedTask = (mime: string, over: Partial<ContentDeliveryTask> = {}): ContentDeliveryTask =>
  publishTask({
    id: 'c-staged',
    driveLink: null,
    hasStagedFile: true,
    stagedMimeType: mime,
    stagedOriginalName: 'book.pdf',
    ...over,
  });

const makeDeps = () => {
  const telegram = {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 10 }),
    sendAudio: vi.fn().mockResolvedValue({ message_id: 11 }),
    sendVideo: vi.fn().mockResolvedValue({ message_id: 12 }),
    sendDocument: vi.fn().mockResolvedValue({ message_id: 13 }),
    deleteMessage: vi.fn().mockResolvedValue(true),
  };
  const api = {
    claimContentTasks: vi.fn().mockResolvedValue({ items: [] }),
    completeContentTask: vi.fn().mockResolvedValue({ deliveryStatus: 'posted' }),
    downloadContent: vi.fn().mockResolvedValue({
      body: new TextEncoder().encode('hello').buffer,
      mimeType: 'application/pdf',
      fileName: 'book.pdf',
    }),
  };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return {
    deps: { api, telegram, channelId: '@channel', logger } as unknown as ContentDeliveryDeps,
    api,
    telegram,
    logger,
  };
};

describe('deliverContentTask — publish via drive link', () => {
  it('posts the channel message and confirms with the message id', async () => {
    const { deps, api, telegram } = makeDeps();

    await deliverContentTask(publishTask(), deps);

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '@channel',
      expect.stringContaining('🔗 https://drive.google.com/file/d/abc/view'),
      { parse_mode: 'HTML' },
    );
    expect(api.completeContentTask).toHaveBeenCalledWith('c-1', {
      outcome: 'posted',
      telegramMessageId: 10,
    });
  });

  it('reports a failure when the send throws', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.sendMessage.mockRejectedValue(new Error('500 boom'));

    await deliverContentTask(publishTask(), deps);

    expect(api.completeContentTask).toHaveBeenCalledWith('c-1', {
      outcome: 'failed',
      error: '500 boom',
    });
  });
});

describe('deliverContentTask — publish staged file', () => {
  it.each([
    ['audio/mpeg', 'sendAudio'],
    ['audio/mp4', 'sendAudio'],
    ['audio/x-m4a', 'sendAudio'],
    ['video/mp4', 'sendVideo'],
    ['audio/wav', 'sendDocument'],
    ['application/pdf', 'sendDocument'],
    ['application/epub+zip', 'sendDocument'],
  ])('routes %s to %s', async (mime, method) => {
    const { deps, api, telegram } = makeDeps();
    api.downloadContent.mockResolvedValue({
      body: new TextEncoder().encode('hello').buffer,
      mimeType: mime,
      fileName: 'book.pdf',
    });

    await deliverContentTask(stagedTask(mime), deps);

    expect(api.downloadContent).toHaveBeenCalledWith('c-staged');
    const send = telegram[method as keyof typeof telegram] as ReturnType<typeof vi.fn>;
    expect(send).toHaveBeenCalledOnce();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(api.completeContentTask).toHaveBeenCalledWith('c-staged', {
      outcome: 'posted',
      telegramMessageId: expect.any(Number),
    });
  });

  it('fails terminally when the staged file is missing (404)', async () => {
    const { deps, api, telegram } = makeDeps();
    api.downloadContent.mockRejectedValue(new BotApiError(404, 'NOT_FOUND', 'gone'));

    await deliverContentTask(stagedTask('application/pdf'), deps);

    expect(telegram.sendDocument).not.toHaveBeenCalled();
    expect(api.completeContentTask).toHaveBeenCalledWith('c-staged', {
      outcome: 'failed',
      error: expect.any(String),
      terminal: true,
    });
  });
});

describe('deliverContentTask — delete', () => {
  it('deletes the channel message and confirms', async () => {
    const { deps, api, telegram } = makeDeps();

    await deliverContentTask(
      publishTask({ action: 'delete', telegramMessageId: 42, driveLink: null }),
      deps,
    );

    expect(telegram.deleteMessage).toHaveBeenCalledWith('@channel', 42);
    expect(api.completeContentTask).toHaveBeenCalledWith('c-1', { outcome: 'deleted' });
  });

  it('treats an already-missing message as a successful delete', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.deleteMessage.mockRejectedValue(
      new Error('400: Bad Request: message to delete not found'),
    );

    await deliverContentTask(
      publishTask({ action: 'delete', telegramMessageId: 42, driveLink: null }),
      deps,
    );

    expect(api.completeContentTask).toHaveBeenCalledWith('c-1', { outcome: 'deleted' });
  });

  it('reports a failure for an unrelated delete error', async () => {
    const { deps, api, telegram } = makeDeps();
    telegram.deleteMessage.mockRejectedValue(new Error('429 Too Many Requests'));

    await deliverContentTask(
      publishTask({ action: 'delete', telegramMessageId: 42, driveLink: null }),
      deps,
    );

    expect(api.completeContentTask).toHaveBeenCalledWith('c-1', {
      outcome: 'failed',
      error: '429 Too Many Requests',
    });
  });
});

describe('runContentTick', () => {
  it('claims a batch and delivers each task', async () => {
    const { deps, api } = makeDeps();
    api.claimContentTasks.mockResolvedValue({ items: [publishTask()] });

    await runContentTick({ ...deps, intervalMs: 1000, batchSize: 10 });

    expect(api.claimContentTasks).toHaveBeenCalledWith({ limit: 10 });
    expect(api.completeContentTask).toHaveBeenCalledWith('c-1', {
      outcome: 'posted',
      telegramMessageId: 10,
    });
  });
});

describe('content delivery loop lifecycle', () => {
  it('polls every interval until stopped', async () => {
    vi.useFakeTimers();
    try {
      const { deps, api } = makeDeps();
      api.claimContentTasks.mockResolvedValue({ items: [] });
      const loopDeps = { ...deps, intervalMs: 1000, batchSize: 5 };

      startContentLoop(loopDeps);
      await vi.advanceTimersByTimeAsync(0);
      expect(api.claimContentTasks).toHaveBeenCalledWith({ limit: 5 });

      await vi.advanceTimersByTimeAsync(2000);
      expect(api.claimContentTasks).toHaveBeenCalledTimes(3);

      stopContentLoop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.claimContentTasks).toHaveBeenCalledTimes(3);
    } finally {
      stopContentLoop();
      vi.useRealTimers();
    }
  });
});
