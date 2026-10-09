import type { Request, Response } from 'express';

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ status: 'ok' });
};
