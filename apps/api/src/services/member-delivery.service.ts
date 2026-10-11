import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type ClaimMemberRemovalsResponse,
  type MemberRemovalConfirmInput,
  type MembershipReconcileTargetsResponse,
  type MembershipSnapshotEntry,
} from '@thd/shared';
import { env } from '../config/env';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as membershipRepo from '../repositories/channel-membership.repository';
import * as memberRemovalsRepo from '../repositories/member-removals.repository';
import { AppError } from '../utils/errors';
import { computeBackoffSeconds } from '../utils/backoff';

export const getReconcileTargets = async (): Promise<MembershipReconcileTargetsResponse> => {
  const targets = await membershipRepo.listReconcileTargets();
  return { targets };
};

export const recordMembershipSnapshot = async (
  members: MembershipSnapshotEntry[],
): Promise<{ updated: number }> => {
  const updated = await membershipRepo.upsertMembershipByTelegram(members);
  return { updated };
};

export const claimMemberRemovals = async (limit: number): Promise<ClaimMemberRemovalsResponse> => {
  const items = await memberRemovalsRepo.claimMemberRemovals({
    limit,
    leaseSeconds: env.MEMBER_REMOVAL_LEASE_SECONDS,
  });
  return { items };
};

export const completeMemberRemoval = async (
  input: { id: string } & MemberRemovalConfirmInput,
): Promise<{ status: string }> => {
  return withTransaction(async (client) => {
    const row = await memberRemovalsRepo.getMemberRemoval(input.id, client);
    if (!row) {
      throw new AppError('NOT_FOUND', 'Member removal not found', 404);
    }
    if (row.status === 'done' || row.status === 'failed' || row.status === 'cancelled') {
      return { status: row.status };
    }

    if (input.outcome === 'removed') {
      await memberRemovalsRepo.markMemberRemovalDone(input.id, client);
      await membershipRepo.upsertMembershipForUser(
        row.userId,
        { isMember: false, memberStatus: 'left' },
        client,
      );
      return { status: 'done' };
    }

    const error = input.error ?? 'unknown error';
    if (row.attempts < env.MEMBER_REMOVAL_MAX_ATTEMPTS) {
      const backoffSeconds = computeBackoffSeconds(
        row.attempts,
        env.MEMBER_REMOVAL_BACKOFF_BASE_SECONDS,
      );
      await memberRemovalsRepo.rescheduleMemberRemoval(
        input.id,
        { error, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000) },
        client,
      );
      return { status: 'pending' };
    }

    await memberRemovalsRepo.markMemberRemovalFailed(input.id, { error }, client);
    await auditRepo.insertAuditLog(
      {
        actorUserId: null,
        action: AUDIT_ACTIONS.MEMBER_REMOVAL_FAILED,
        targetType: AUDIT_TARGET_TYPES.MEMBER_REMOVALS,
        targetId: input.id,
        details: { attempts: row.attempts, error: input.error ?? null },
      },
      client,
    );
    return { status: 'failed' };
  });
};
