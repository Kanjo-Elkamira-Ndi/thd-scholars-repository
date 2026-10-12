import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type MemberRemoval,
  type MemberSummary,
  type Role,
  type RosterAuditEntry,
  type RosterStatus,
} from '@thd/shared';
import pool from '../db/pool';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as inviteLinksRepo from '../repositories/invite-links.repository';
import * as memberRemovalsRepo from '../repositories/member-removals.repository';
import * as rosterRepo from '../repositories/roster.repository';
import * as usersRepo from '../repositories/users.repository';
import { AppError } from '../utils/errors';
import { notify } from './notifications.service';
import { computeRosterAudit } from './roster-audit.service';

interface MemberRow {
  id: string;
  telegram_id: string;
  full_name: string;
  role: string;
  registration_id: string | null;
  roster_status: string | null;
  cohort_year: number | null;
  is_member: boolean | null;
  member_status: string | null;
  checked_at: Date | null;
}

const FLAGGING_STATUSES = new Set<string>(['graduated', 'withdrawn']);

export const listMembers = async (): Promise<MemberSummary[]> => {
  const { rows } = await pool.query<MemberRow>(
    `SELECT u.id, u.telegram_id, u.full_name, u.role,
            r.registration_id, r.status AS roster_status, r.cohort_year,
            cm.is_member, cm.member_status, cm.checked_at
       FROM users u
       LEFT JOIN roster r ON r.user_id = u.id
       LEFT JOIN channel_membership cm ON cm.user_id = u.id
      ORDER BY u.full_name`,
  );

  return rows.map((row) => ({
    user: {
      id: row.id,
      telegramId: Number(row.telegram_id),
      fullName: row.full_name,
      role: row.role as Role,
    },
    roster:
      row.registration_id !== null
        ? {
            registrationId: row.registration_id,
            status: row.roster_status as RosterStatus,
            cohortYear: row.cohort_year as number,
          }
        : null,
    membership:
      row.is_member !== null
        ? {
            isMember: row.is_member,
            memberStatus: row.member_status,
            checkedAt: (row.checked_at as Date).toISOString(),
          }
        : null,
  }));
};

export const listRosterAudit = (): Promise<RosterAuditEntry[]> => computeRosterAudit();

export const requestMemberRemoval = async (
  targetUserId: string,
  actor: { id: string; role: Role },
  reason: string | null,
): Promise<{ removal: MemberRemoval; created: boolean }> => {
  return withTransaction(async (client) => {
    const target = await usersRepo.getUserById(targetUserId, client);
    if (!target) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }
    if (target.id === actor.id) {
      throw new AppError('VALIDATION_ERROR', 'You cannot remove yourself', 400);
    }
    if (target.role === 'admin') {
      throw new AppError('FORBIDDEN', 'Cannot remove an admin user', 403);
    }

    if (actor.role === 'registrar') {
      const roster = await rosterRepo.getRosterByUserId(target.id, client);
      const eligible =
        roster !== null &&
        FLAGGING_STATUSES.has(roster.status) &&
        roster.updatedBy === actor.id &&
        roster.accessReviewPending;
      if (!eligible) {
        throw new AppError(
          'FORBIDDEN',
          'Only the registrar who flagged this scholar with a pending access review may remove them',
          403,
        );
      }
    }

    const initiatedByRole = actor.role === 'admin' ? 'admin' : 'registrar';
    const { removal, created } = await memberRemovalsRepo.insertMemberRemoval(
      { userId: target.id, requestedBy: actor.id, initiatedByRole, reason },
      client,
    );

    if (created) {
      await inviteLinksRepo.revokeActiveInviteLinksForUser(target.id, client);
      if (actor.role === 'registrar') {
        await rosterRepo.clearAccessReviewPending(target.id, client);
      }
      await auditRepo.insertAuditLog(
        {
          actorUserId: actor.id,
          action: AUDIT_ACTIONS.MEMBER_REMOVAL_REQUESTED,
          targetType: AUDIT_TARGET_TYPES.USERS,
          targetId: target.id,
          details: { initiatedByRole, reason },
        },
        client,
      );
      await notify(target.id, 'member_removal_requested', { initiatedByRole }, client);
    }

    return { removal, created };
  });
};
