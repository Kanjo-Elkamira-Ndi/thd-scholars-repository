import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@thd/shared';
import { AppError } from '../utils/errors';

export const requireRole = (
  ...roles: Role[]
): ((req: Request, res: Response, next: NextFunction) => void) => {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('FORBIDDEN', 'Insufficient role', 403));
      return;
    }
    next();
  };
};
