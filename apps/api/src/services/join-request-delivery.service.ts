import type {
  ClaimJoinRequestsResponse,
  CompleteJoinRequestInput,
  JoinRequestDeliveryStatus,
} from '@thd/shared';
import { env } from '../config/env';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as membershipRepo from '../repositories/channel-membership.repository';
import * as joinRepo from '../repositories/join-requests.repository';
import * as settingsRepo from '../repositories/settings.repository';
import { AppError } from '../utils/errors';
import { computeBackoffSeconds } from '../utils/backoff';

export const claimJoinRequests = async ({
  limit,
}: {
  limit: number;
}): Promise<ClaimJoinRequestsResponse> => {
  const items = await joinRepo.claimJoinRequests({
    limit,
    leaseSeconds: env.JOIN_REQUEST_DELIVERY_LEASE_SECONDS,
  });
  const inviteLinkExpirySeconds = await settingsRepo.getInviteLinkExpirySeconds();
  return { items, inviteLinkExpirySeconds };
};

export const completeJoinRequest = async (
  input: { id: string } & CompleteJoinRequestInput,
): Promise<{ deliveryStatus: JoinRequestDeliveryStatus }> => {
  return withTransaction(async (client) => {
    const row = await joinRepo.getJoinRequestById(input.id, client);
    if (!row) {
      throw new AppError('NOT_FOUND', 'Join request not found', 404);
    }
    if (row.deliveryStatus === 'delivered' || row.deliveryStatus === 'failed') {
      return { deliveryStatus: row.deliveryStatus };
    }

    if (input.outcome === 'delivered') {
      await joinRepo.markDelivered(input.id, client);
      if (input.inviteLink) {
        await joinRepo.insertInviteLink(
          { id: input.id, link: input.inviteLink.link, expiresAt: input.inviteLink.expiresAt },
          client,
        );
      }
      await membershipRepo.upsertMembershipForUser(
        row.userId,
        { isMember: true, memberStatus: 'invited' },
        client,
      );
      return { deliveryStatus: 'delivered' };
    }

    const error = input.error ?? 'unknown error';
    if (row.deliveryAttempts < env.JOIN_REQUEST_DELIVERY_MAX_ATTEMPTS) {
      const backoffSeconds = computeBackoffSeconds(
        row.deliveryAttempts,
        env.JOIN_REQUEST_DELIVERY_BACKOFF_BASE_SECONDS,
      );
      await joinRepo.reschedule(
        input.id,
        { error, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000) },
        client,
      );
      return { deliveryStatus: 'pending' };
    }

    await joinRepo.markFailed(input.id, { error }, client);
    await auditRepo.insertAuditLog(
      {
        actorUserId: null,
        action: 'join_request_delivery_failed',
        targetType: 'join_requests',
        targetId: input.id,
        details: { attempts: row.deliveryAttempts, error: input.error ?? null },
      },
      client,
    );
    return { deliveryStatus: 'failed' };
  });
};
