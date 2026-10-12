import type { RosterAuditEntry, RosterAuditIssue, RosterStatus } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

export const FLAGGING_STATUSES = new Set<string>(['graduated', 'withdrawn']);

interface RosterAuditRow {
  id: string;
  user_id: string;
  registration_id: string;
  roster_status: string;
  cohort_year: number;
  is_member: boolean | null;
  member_status: string | null;
  checked_at: Date | null;
}

export const computeRosterAudit = async (db: Db = pool): Promise<RosterAuditEntry[]> => {
  const { rows } = await db.query<RosterAuditRow>(
    `SELECT r.id, r.user_id, r.registration_id, r.status AS roster_status, r.cohort_year,
            cm.is_member, cm.member_status, cm.checked_at
       FROM roster r
       LEFT JOIN channel_membership cm ON cm.user_id = r.user_id
      WHERE r.user_id IS NOT NULL
      ORDER BY r.registration_id`,
  );

  const entries: RosterAuditEntry[] = [];
  for (const row of rows) {
    const status = row.roster_status as RosterStatus;
    const membership =
      row.is_member !== null
        ? {
            isMember: row.is_member,
            memberStatus: row.member_status,
            checkedAt: (row.checked_at as Date).toISOString(),
          }
        : null;

    let issue: RosterAuditIssue | null = null;
    if (!membership) {
      issue = 'membership_unknown';
    } else if (FLAGGING_STATUSES.has(status) && membership.isMember) {
      issue = 'inactive_still_member';
    } else if (status === 'active' && !membership.isMember) {
      issue = 'active_not_member';
    }

    if (!issue) continue;

    entries.push({
      roster: {
        id: row.id,
        userId: row.user_id,
        registrationId: row.registration_id,
        status,
        cohortYear: row.cohort_year,
      },
      membership,
      issue,
    });
  }

  return entries;
};
