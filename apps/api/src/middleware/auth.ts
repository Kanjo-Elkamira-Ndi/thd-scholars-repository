import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { verifyTelegramInitData } from '../auth/telegram-init-data';
import { env } from '../config/env';
import { upsertByTelegram } from '../repositories/users.repository';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const mockUserSchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string().min(1).optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
  })
  .strict();

function unauthorized(message: string): never {
  throw new AppError('UNAUTHORIZED', message, 401);
}

export const authUser = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    /* MOCK AUTH — dev/test only. env.ts refuses AUTH_MOCK_ENABLED=true in production. */
    if (env.AUTH_MOCK_ENABLED && env.NODE_ENV !== 'production') {
      const mockRaw = req.get('x-mock-user');
      if (mockRaw) {
        let parsed;
        try {
          parsed = mockUserSchema.safeParse(JSON.parse(mockRaw));
        } catch {
          parsed = { success: false as const };
        }
        if (!parsed.success) unauthorized('invalid mock user header');
        const { id, username, firstName, lastName } = parsed.data;
        const fullName =
          [firstName, lastName].filter(Boolean).join(' ').trim() || `Mock user ${id}`;
        logger.warn({ telegramId: id }, 'MOCK AUTH used');
        req.user = await upsertByTelegram({ telegramId: id, username: username ?? null, fullName });
        next();
        return;
      }
    }

    const authorization = req.get('authorization');
    if (!authorization || !authorization.toLowerCase().startsWith('tma ')) {
      unauthorized('missing or invalid authorization header');
    }
    const initData = authorization.slice('tma '.length).trim();
    if (!initData) unauthorized('missing initData');

    const verified = verifyTelegramInitData(
      initData,
      env.BOT_TOKEN,
      env.TELEGRAM_AUTH_MAX_AGE_SECONDS,
    );
    req.user = await upsertByTelegram(verified);
    next();
  } catch (error) {
    next(error);
  }
};
