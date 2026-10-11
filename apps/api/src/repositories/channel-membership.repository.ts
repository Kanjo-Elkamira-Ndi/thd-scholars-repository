import type { ChannelMembership, MembershipReconcileTarget, MembershipSnapshotEntry } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

export interface ChannelMembershipRow {
  is_member: boolean;
  member_status: string | null;
  checked_at: Date;
}

export const mapChannelMembership = (row: {
  is_member: boolean;
  member_status: string | null;
  checked_at: Date;
}): ChannelMembership => ({
  isMember: row.is_member,
  memberStatus: row.member_status,
  checkedAt: row.checked_at.toISOString(),
});

export const upsertMembershipByTelegram = async (
  entries: MembershipSnapshotEntry[],
  db: Db = pool,
): Promise<number> => {
  if (entries.length === 0) {
    return 0;
  }
  const { rows } = await db.query<{ user_id: string }>(
    `INSERT INTO channel_membership (user_id, is_member, member_status, checked_at)
     SELECT u.id, e.is_member, e.member_status, now()
     FROM unnest($1::bigint[], $2::boolean[], $3::text[]) AS e(telegram_id, is_member, member_status)
     JOIN users u ON u.telegram_id = e.telegram_id
     ON CONFLICT (user_id) DO UPDATE
       SET is_member = EXCLUDED.is_member,
           member_status = EXCLUDED.member_status,
           checked_at = now()
     RETURNING user_id`,
    [entries.map((e) => e.telegramId), entries.map((e) => e.isMember), entries.map((e) => e.memberStatus)],
  );
  return rows.length;
};

export const upsertMembershipForUser = async (
  userId: string,
  input: { isMember: boolean; memberStatus: string | null },
  db: Db = pool,
): Promise<void> => {
  await db.query(
    `INSERT INTO channel_membership (user_id, is_member, member_status, checked_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET is_member = EXCLUDED.is_member,
           member_status = EXCLUDED.member_status,
           checked_at = now()`,
    [userId, input.isMember, input.memberStatus],
  );
};

export const getMembershipForUser = async (
  userId: string,
  db: Db = pool,
): Promise<ChannelMembership | null> => {
  const { rows } = await db.query<{ is_member: boolean; member_status: string | null; checked_at: Date }>(
    `SELECT is_member, member_status, checked_at FROM channel_membership WHERE user_id = $1`,
    [userId],
  );
  return rows.length ? mapChannelMembership(rows[0]) : null;
};

export const listReconcileTargets = async (db: Db = pool): Promise<MembershipReconcileTarget[]> => {
  const { rows } = await db.query<{ id: string; telegram_id: string }>(
    `SELECT id, telegram_id FROM users ORDER BY created_at`,
  );
  return rows.map((row) => ({ userId: row.id, telegramId: Number(row.telegram_id) }));
};
