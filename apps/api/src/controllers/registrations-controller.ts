import type { Request, Response } from 'express';
import { submitRegistration } from '../services/registration.service';
import { AppError } from '../utils/errors';

export const postRegistration = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const result = await submitRegistration({ user: req.user, payload: req.body });
  res.status(201).json(result);
};
