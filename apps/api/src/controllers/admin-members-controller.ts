import type { Request, Response } from 'express';
import { removeMemberSchema } from '@thd/shared';
import * as membersService from '../services/members.service';
import { AppError } from '../utils/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getMembers = async (_req: Request, res: Response): Promise<void> => {
  const members = await membersService.listMembers();
  res.status(200).json({ members });
};

export const getRosterAudit = async (_req: Request, res: Response): Promise<void> => {
  const issues = await membersService.listRosterAudit();
  res.status(200).json({ issues });
};

export const postMemberRemoval = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const { userId } = req.params as { userId: string };
  if (!UUID_RE.test(userId)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid user id', 400);
  }
  const parsed = removeMemberSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const { removal, created } = await membersService.requestMemberRemoval(
    userId,
    { id: req.user.id, role: req.user.role },
    parsed.data.reason ?? null,
  );
  res.status(202).json({ removal, created });
};
