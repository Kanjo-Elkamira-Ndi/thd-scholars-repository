import type { Request, Response } from 'express';
import {
  claimJoinRequestsSchema,
  completeJoinRequestSchema,
  recordJoinRequestSchema,
} from '@thd/shared';
import { env } from '../config/env';
import { withTransaction } from '../db/transaction';
import * as joinRepo from '../repositories/join-requests.repository';
import * as usersRepo from '../repositories/users.repository';
import {
  claimJoinRequests as claimJoinRequestsService,
  completeJoinRequest as completeJoinRequestService,
} from '../services/join-request-delivery.service';
import { AppError } from '../utils/errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const recordJoinRequest = async (req: Request, res: Response): Promise<void> => {
  const parsed = recordJoinRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const { telegramId, telegramUsername, firstName, lastName, chatId, joinRequestedAt } = parsed.data;

  const joinRequestId = await withTransaction(async (client) => {
    const fullName =
      [firstName, lastName].filter(Boolean).join(' ').trim() || `Telegram user ${telegramId}`;
    const user = await usersRepo.upsertByTelegram(
      { telegramId, username: telegramUsername ?? null, fullName },
      client,
    );
    const joinRequest = await joinRepo.recordJoinRequest(
      { userId: user.id, chatId, telegramUserId: telegramId, joinRequestedAt },
      client,
    );
    return joinRequest.id;
  });

  res.status(201).json({ joinRequestId });
};

export const claimJoinRequests = async (req: Request, res: Response): Promise<void> => {
  const parsed = claimJoinRequestsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const limit = parsed.data.limit ?? env.JOIN_REQUEST_DELIVERY_BATCH_SIZE;
  const result = await claimJoinRequestsService({ limit });
  res.status(200).json(result);
};

export const completeJoinRequest = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!UUID_PATTERN.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'id must be a uuid', 400);
  }
  const parsed = completeJoinRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const result = await completeJoinRequestService({ id, ...parsed.data });
  res.status(200).json(result);
};
