import type { PoolClient } from 'pg';
import { createRosterCreateSchema, rosterUpdateSchema, type RosterUpdateInput } from '@thd/shared';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as rosterRepo from '../repositories/roster.repository';
import * as settingsRepo from '../repositories/settings.repository';
import { AppError } from '../utils/errors';

const FLAGGING_STATUSES = new Set(['graduated', 'withdrawn']);

export const listRoster = (query: {
  status?: string;
  cohortYear?: number;
  search?: string;
  page: number;
  pageSize: number;
}) => rosterRepo.listRoster(query);

export const createRosterEntry = async (args: { actorUserId: string; input: unknown }) => {
  const pattern = await settingsRepo.getRegistrationIdPattern();
  const parsed = createRosterCreateSchema(pattern).safeParse(args.input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }

  try {
    return await withTransaction(async (client) => {
      const entry = await rosterRepo.createRosterEntry(
        { ...parsed.data, supervisorName: parsed.data.supervisorName ?? null },
        client,
      );
      await auditRepo.insertAuditLog(
        {
          actorUserId: args.actorUserId,
          action: 'create_roster_entry',
          targetType: 'roster',
          targetId: entry.id,
          details: { registrationId: entry.registrationId, cohortYear: entry.cohortYear },
        },
        client,
      );
      return entry;
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AppError('CONFLICT', 'A roster entry with that registration ID already exists', 409);
    }
    throw error;
  }
};

export const updateRosterEntry = async (args: {
  actorUserId: string;
  id: string;
  patch: unknown;
}) => {
  const parsed = rosterUpdateSchema.safeParse(args.patch);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const patch: RosterUpdateInput = parsed.data;

  return withTransaction(async (client: PoolClient) => {
    const existing = await rosterRepo.getRosterById(args.id, client);
    if (!existing) throw new AppError('NOT_FOUND', 'Roster entry not found', 404);

    const statusChanged = patch.status !== undefined && patch.status !== existing.status;
    const flagged = patch.status ? FLAGGING_STATUSES.has(patch.status) : false;
    const cleared = patch.status === 'active';

    const updated = await rosterRepo.updateRosterEntry(
      args.id,
      {
        status: patch.status,
        cohortYear: patch.cohortYear,
        programTrack: patch.programTrack,
        supervisorName: patch.supervisorName,
        accessReviewPending: patch.status ? flagged : undefined,
        accessReviewFlaggedAt: patch.status
          ? flagged
            ? new Date()
            : cleared
              ? null
              : undefined
          : undefined,
        updatedBy: args.actorUserId,
      },
      client,
    );

    await auditRepo.insertAuditLog(
      {
        actorUserId: args.actorUserId,
        action: statusChanged ? 'update_roster_status' : 'update_roster_entry',
        targetType: 'roster',
        targetId: args.id,
        details: statusChanged
          ? {
              from: existing.status,
              to: patch.status,
              accessReviewPending: updated?.accessReviewPending ?? false,
            }
          : { fields: Object.keys(patch) },
      },
      client,
    );

    return updated;
  });
};
