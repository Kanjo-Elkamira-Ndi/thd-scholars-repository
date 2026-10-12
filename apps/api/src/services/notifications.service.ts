import { randomUUID } from 'node:crypto';
import type { NotificationEvent, Role } from '@thd/shared';
import { env } from '../config/env';
import type { Db } from '../db/transaction';
import * as notifRepo from '../repositories/notifications.repository';
import { logger } from '../utils/logger';

export interface RepeatedFailureNotice {
  userId: string;
  telegramId: number;
  failureCount: number;
}

export const enqueueNotification = async (
  input: {
    recipientUserId: string;
    event: NotificationEvent;
    payload?: Record<string, unknown>;
    dedupeKey: string;
  },
  db?: Db,
): Promise<void> => {
  await notifRepo.insertNotification(input, db);
};

export const notify = async (
  userId: string,
  event: NotificationEvent,
  payload: Record<string, unknown> = {},
  db?: Db,
): Promise<void> => {
  await notifRepo.insertNotification(
    { recipientUserId: userId, event, payload, dedupeKey: randomUUID() },
    db,
  );
};

export const notifyRoleChanged = async (
  userId: string,
  from: Role,
  to: Role,
  db?: Db,
): Promise<void> => {
  await notifRepo.insertNotification(
    { recipientUserId: userId, event: 'role_changed', payload: { from, to }, dedupeKey: randomUUID() },
    db,
  );
};

export const notifyRepeatedRegistrationFailure = async (
  notice: RepeatedFailureNotice,
): Promise<number> => {
  const bucket = Math.floor(Date.now() / 1000 / env.REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS);
  const dedupeKey = `repeated_failure:${notice.userId}:${bucket}`;
  const recipients = await notifRepo.findRecipientUserIds(['admin', 'registrar']);
  let queued = 0;
  for (const recipientUserId of recipients) {
    const row = await notifRepo.insertNotification({
      recipientUserId,
      event: 'repeated_registration_failure',
      payload: { failureCount: notice.failureCount },
      dedupeKey,
    });
    if (row) queued += 1;
  }
  logger.warn(
    { userId: notice.userId, failureCount: notice.failureCount, queued },
    'Repeated registration failure alert queued (FR27)',
  );
  return queued;
};
