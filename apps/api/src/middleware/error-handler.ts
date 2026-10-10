import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isAppError, type AppErrorBody } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (isAppError(error)) {
    const body: AppErrorBody = { code: error.code, message: error.message };
    if (error.details !== undefined) {
      body.details = error.details;
    }
    res.status(error.status).json({ error: body });
    return;
  }

  if (error instanceof ZodError) {
    const body: AppErrorBody = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: error.flatten(),
    };
    res.status(400).json({ error: body });
    return;
  }

  const reqId = req.id;
  logger.error({ err: error, reqId }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
