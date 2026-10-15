import type { Request, Response } from 'express';
import { auditLogQuerySchema, settingsUpdateSchema } from '@thd/shared';
import * as auditService from '../services/audit-logs.service';
import * as settingsService from '../services/settings.service';
import { AppError } from '../utils/errors';

export const getSettings = async (_req: Request, res: Response): Promise<void> => {
  const settings = await settingsService.getSystemSettings();
  res.status(200).json({ settings });
};

export const patchSettings = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const settings = await settingsService.updateSystemSettings(parsed.data, req.user.id);
  res.status(200).json({ settings });
};

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const query = auditLogQuerySchema.parse(req.query);
  const result = await auditService.listAuditLogs(query);
  res.status(200).json(result);
};
