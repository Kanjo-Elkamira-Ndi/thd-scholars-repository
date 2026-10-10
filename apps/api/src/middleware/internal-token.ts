import type { NextFunction, Request, Response } from 'express';
import { safeEqualBuffers } from '../auth/constant-time';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

export const internalServiceToken = (req: Request, _res: Response, next: NextFunction): void => {
  const provided = req.get('x-internal-token') ?? '';
  const expected = env.API_INTERNAL_TOKEN;
  if (!safeEqualBuffers(Buffer.from(provided), Buffer.from(expected))) {
    next(new AppError('UNAUTHORIZED', 'Invalid internal token', 401));
    return;
  }
  req.service = 'bot';
  next();
};
