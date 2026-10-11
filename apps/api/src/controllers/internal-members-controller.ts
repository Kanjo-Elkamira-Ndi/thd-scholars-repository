import type { Request, Response } from 'express';
import { memberRemovalConfirmSchema, membershipSnapshotSchema } from '@thd/shared';
import { z } from 'zod';
import { env } from '../config/env';
import * as memberDelivery from '../services/member-delivery.service';
import { AppError } from '../utils/errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const claimSchema = z.object({
  limit: z.coerce.number().int().min(1).max(env.MEMBER_REMOVAL_MAX_BATCH).optional(),
});

export const getReconcileTargets = async (_req: Request, res: Response): Promise<void> => {
  const result = await memberDelivery.getReconcileTargets();
  res.status(200).json(result);
};

export const putMembershipSnapshot = async (req: Request, res: Response): Promise<void> => {
  const parsed = membershipSnapshotSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const result = await memberDelivery.recordMembershipSnapshot(parsed.data.members);
  res.status(200).json(result);
};

export const postClaimMemberRemovals = async (req: Request, res: Response): Promise<void> => {
  const parsed = claimSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const limit = parsed.data.limit ?? env.MEMBER_REMOVAL_MAX_BATCH;
  const result = await memberDelivery.claimMemberRemovals(limit);
  res.status(200).json(result);
};

export const postConfirmMemberRemoval = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!UUID_PATTERN.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'id must be a uuid', 400);
  }
  const parsed = memberRemovalConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const result = await memberDelivery.completeMemberRemoval({ id, ...parsed.data });
  res.status(200).json(result);
};
