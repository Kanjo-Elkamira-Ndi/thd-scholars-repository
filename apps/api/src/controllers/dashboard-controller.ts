import type { Request, Response } from 'express';
import { getDashboard as getDashboardPayload } from '../services/dashboard.service';
import { AppError } from '../utils/errors';

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const payload = await getDashboardPayload({ id: req.user.id, role: req.user.role });
  res.status(200).json({ dashboard: payload });
};
