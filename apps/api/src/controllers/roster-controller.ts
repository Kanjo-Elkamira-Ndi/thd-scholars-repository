import type { Request, Response } from 'express';
import { rosterQuerySchema } from '@thd/shared';
import * as rosterService from '../services/roster.service';
import { AppError } from '../utils/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getRoster = async (req: Request, res: Response): Promise<void> => {
  const query = rosterQuerySchema.parse(req.query);
  const { items, total } = await rosterService.listRoster(query);
  res.status(200).json({ items, total, page: query.page, pageSize: query.pageSize });
};

export const postRoster = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const rosterEntry = await rosterService.createRosterEntry({
    actorUserId: req.user.id,
    input: req.body,
  });
  res.status(201).json({ rosterEntry });
};

export const patchRoster = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid roster entry id', 400);
  }
  const rosterEntry = await rosterService.updateRosterEntry({
    actorUserId: req.user.id,
    id,
    patch: req.body,
  });
  res.status(200).json({ rosterEntry });
};
