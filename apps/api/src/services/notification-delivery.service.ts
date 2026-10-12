import type { ClaimNotificationsResponse, NotificationConfirmInput } from '@thd/shared';
import { env } from '../config/env';
import { withTransaction } from '../db/transaction';
import * as notifRepo from '../repositories/notifications.repository';
import { computeBackoffSeconds } from '../utils/backoff';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const claimNotifications = async (limit: number): Promise<ClaimNotificationsResponse> => {
  const items = await notifRepo.claimNotifications({
    limit,
    leaseSeconds: env.NOTIFICATION_LEASE_SECONDS,
  });
  return { items };
};

export const completeNotification = async (
  input: { id: string } & NotificationConfirmInput,
): Promise<{ status: string }> => {
  return withTransaction(async (client) => {
    const row = await notifRepo.getNotification(input.id, client);
    if (!row) {
      throw new AppError('NOT_FOUND', 'Notification not found', 404);
    }
    if (row.status === 'sent' || row.status === 'failed') {
      return { status: row.status };
    }

    if (input.outcome === 'sent') {
      await notifRepo.markNotificationSent(input.id, client);
      return { status: 'sent' };
    }

    const error = input.error ?? 'unknown error';
    const terminal = input.terminal === true || row.attempts >= env.NOTIFICATION_MAX_ATTEMPTS;
    if (!terminal) {
      const backoffSeconds = computeBackoffSeconds(
        row.attempts,
        env.NOTIFICATION_BACKOFF_BASE_SECONDS,
      );
      await notifRepo.rescheduleNotification(
        input.id,
        { error, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000) },
        client,
      );
      return { status: 'pending' };
    }

    await notifRepo.markNotificationFailed(input.id, { error }, client);
    logger.warn(
      { notificationId: input.id, event: row.event, attempts: row.attempts },
      'Notification delivery failed permanently',
    );
    return { status: 'failed' };
  });
};
