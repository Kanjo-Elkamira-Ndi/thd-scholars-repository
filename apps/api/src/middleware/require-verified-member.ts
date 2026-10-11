import type { NextFunction, Request, Response } from 'express';
import { getActiveRosterByUserId } from '../repositories/roster.repository';
import { AppError } from '../utils/errors';

export async function requireVerifiedMember(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
    return;
  }

  if (req.user.role !== 'scholar') {
    next();
    return;
  }

  try {
    const entry = await getActiveRosterByUserId(req.user.id);
    if (entry) {
      next();
      return;
    }
    next(new AppError('NOT_VERIFIED', 'Scholar access requires an active roster entry', 403));
  } catch (error) {
    next(error);
  }
}
