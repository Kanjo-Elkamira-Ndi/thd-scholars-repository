import type { Request, Response } from 'express';
import { getRosterByUserId } from '../repositories/roster.repository';

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const roster = await getRosterByUserId(user.id);
  res.status(200).json({ user, roster });
};
