import type { Request, Response } from 'express';
import { notificationClaimSchema, notificationConfirmSchema } from '@thd/shared';
import { env } from '../config/env';
import * as notificationDelivery from '../services/notification-delivery.service';
import { AppError } from '../utils/errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const postClaimNotifications = async (req: Request, res: Response): Promise<void> => {
  const parsed = notificationClaimSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const limit = parsed.data.limit ?? env.NOTIFICATION_BATCH_SIZE;
  const result = await notificationDelivery.claimNotifications(limit);
  res.status(200).json(result);
};

export const postConfirmNotification = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!UUID_PATTERN.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'id must be a uuid', 400);
  }
  const parsed = notificationConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const result = await notificationDelivery.completeNotification({ id, ...parsed.data });
  res.status(200).json(result);
};
