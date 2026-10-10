import type { Request, Response } from 'express';
import type { UserStatusResponse } from '@thd/shared';
import { getRosterByUserId } from '../repositories/roster.repository';
import { getUserByTelegramId } from '../repositories/users.repository';
import { AppError } from '../utils/errors';

const TELEGRAM_ID_PATTERN = /^\d+$/;

export const getUserStatus = async (req: Request, res: Response): Promise<void> => {
  const { telegramId } = req.params as { telegramId: string };
  if (!TELEGRAM_ID_PATTERN.test(telegramId)) {
    throw new AppError('VALIDATION_ERROR', 'telegramId must be numeric', 400);
  }

  const user = await getUserByTelegramId(Number(telegramId));
  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found', 404);
  }

  const roster = await getRosterByUserId(user.id);
  const body: UserStatusResponse = { user, roster };
  res.status(200).json(body);
};
