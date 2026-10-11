import type { Request, Response } from 'express';
import { roleChangeSchema } from '@thd/shared';
import * as adminUsersService from '../services/admin-users.service';
import { AppError } from '../utils/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await adminUsersService.listUsers();
  res.status(200).json({ users });
};

export const patchUserRole = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid user id', 400);
  }
  const parsed = roleChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const user = await adminUsersService.changeUserRole(id, parsed.data.role, req.user.id);
  res.status(200).json({ user });
};
