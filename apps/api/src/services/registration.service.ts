import { createRegistrationPayloadSchema, type RegistrationResult, type User } from '@thd/shared';
import { env } from '../config/env';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as joinRepo from '../repositories/join-requests.repository';
import * as rosterRepo from '../repositories/roster.repository';
import * as settingsRepo from '../repositories/settings.repository';
import * as usersRepo from '../repositories/users.repository';
import { AppError } from '../utils/errors';
import { notifyRepeatedRegistrationFailure } from './notifications.service';

export interface RegistrationInput {
  user: User;
  payload: unknown;
}

export const submitRegistration = async ({
  user,
  payload,
}: RegistrationInput): Promise<RegistrationResult> => {
  const pattern = await settingsRepo.getRegistrationIdPattern();
  const parsed = createRegistrationPayloadSchema(pattern).safeParse(payload);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const body = parsed.data;

  const result = await withTransaction(async (client) => {
    const matched = await rosterRepo.findByRegistrationId(body.registrationId, client);
    const approved = matched?.status === 'active';
    const reason = approved
      ? null
      : matched
        ? `Roster record is not active (status: ${matched.status})`
        : 'No matching roster entry found';
    const decision: RegistrationResult['decision'] = approved ? 'approved' : 'declined';

    const joinRequest = await joinRepo.insertJoinRequest(
      { userId: user.id, status: approved ? 'approved' : 'declined', decidedBy: null, reason },
      client,
    );

    if (approved && matched) {
      if (!matched.userId) await rosterRepo.setRosterUserId(matched.id, user.id, client);
      await usersRepo.updateUserProfile(
        user.id,
        {
          fullName: body.fullName,
          email: body.email,
          telegramUsername: body.telegramUsername.replace(/^@/, ''),
        },
        client,
      );
    }

    await auditRepo.insertAuditLog(
      {
        actorUserId: null,
        action: approved ? 'approve_join_request' : 'decline_join_request',
        targetType: 'join_requests',
        targetId: joinRequest.id,
        details: {
          registrationId: body.registrationId,
          matched: Boolean(matched),
          rosterStatus: matched?.status ?? null,
          reason,
        },
      },
      client,
    );

    return { decision, reason };
  });

  if (result.decision === 'declined') {
    const since = new Date(Date.now() - env.REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS * 1000);
    const failureCount = await joinRepo.countRecentDeclines(user.id, since);
    if (failureCount >= env.REPEATED_REGISTRATION_FAILURE_THRESHOLD) {
      await notifyRepeatedRegistrationFailure({
        userId: user.id,
        telegramId: user.telegramId,
        failureCount,
      });
    }
  }

  return result;
};
