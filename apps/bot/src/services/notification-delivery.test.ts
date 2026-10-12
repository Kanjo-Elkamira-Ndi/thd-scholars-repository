import type { NotificationTask } from '@thd/shared';
import type { Telegraf } from 'telegraf';
import { describe, expect, it, vi } from 'vitest';
import type { BotApiClient } from './api-client';
import { deliverNotification, runNotificationTick, type NotificationDeps } from './notification-delivery';

const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

const task = (overrides: Partial<NotificationTask> = {}): NotificationTask => ({
  id: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  telegramId: 700,
  event: 'role_changed',
  payload: { from: 'scholar', to: 'faculty' },
  attempts: 1,
  recipientRole: 'scholar',
  ...overrides,
});

const buildDeps = (overrides: {
  sendMessage?: ReturnType<typeof vi.fn>;
  claimNotifications?: ReturnType<typeof vi.fn>;
}): NotificationDeps => {
  const api = {
    claimNotifications: overrides.claimNotifications ?? vi.fn().mockResolvedValue([]),
    completeNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  } as unknown as BotApiClient;
  return {
    api,
    telegram: {
      sendMessage: overrides.sendMessage ?? vi.fn().mockResolvedValue({ message_id: 1 }),
    } as unknown as Telegraf['telegram'],
    logger,
  };
};

describe('deliverNotification', () => {
  it('sends the rendered HTML message and confirms success', async () => {
    const deps = buildDeps({});
    await deliverNotification(task(), deps);
    expect(deps.telegram.sendMessage).toHaveBeenCalledWith(
      700,
      expect.stringContaining('<b>Faculty</b>'),
      { parse_mode: 'HTML' },
    );
    expect(deps.api.completeNotification).toHaveBeenCalledWith(task().id, { outcome: 'sent' });
  });

  it('marks blocked recipients as terminal failures without leaking PII', async () => {
    logger.warn.mockClear();
    const deps = buildDeps({
      sendMessage: vi
        .fn()
        .mockRejectedValue({ description: 'Forbidden: bot was blocked by the user' }),
    });
    await deliverNotification(task(), deps);
    expect(deps.api.completeNotification).toHaveBeenCalledWith(
      task().id,
      expect.objectContaining({ outcome: 'failed', terminal: true }),
    );
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toMatch(/full_name|fullName|registration/i);
  });

  it('marks transient failures as retryable', async () => {
    const deps = buildDeps({ sendMessage: vi.fn().mockRejectedValue(new Error('timeout')) });
    await deliverNotification(task(), deps);
    expect(deps.api.completeNotification).toHaveBeenCalledWith(
      task().id,
      expect.objectContaining({ outcome: 'failed', terminal: false }),
    );
  });
});

describe('runNotificationTick', () => {
  it('claims a batch and delivers each task', async () => {
    const deps = buildDeps({ claimNotifications: vi.fn().mockResolvedValue([task()]) });
    await runNotificationTick({ ...deps, intervalMs: 1000, batchSize: 10 });
    expect(deps.api.claimNotifications).toHaveBeenCalledWith(10);
    expect(deps.telegram.sendMessage).toHaveBeenCalledTimes(1);
  });
});
