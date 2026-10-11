import pool from '../db/pool';
import type { Db } from '../db/transaction';

export const listActiveInviteLinksForUser = async (
  userId: string,
  db: Db = pool,
): Promise<{ id: string; link: string }[]> => {
  const { rows } = await db.query<{ id: string; link: string }>(
    `SELECT id, link FROM invite_links
      WHERE created_for_user_id = $1
        AND used = false
        AND revoked_at IS NULL
        AND expires_at > now()
      ORDER BY created_at`,
    [userId],
  );
  return rows;
};

export const revokeActiveInviteLinksForUser = async (
  userId: string,
  db: Db = pool,
): Promise<{ id: string; link: string }[]> => {
  const { rows } = await db.query<{ id: string; link: string }>(
    `UPDATE invite_links
        SET revoked_at = now()
      WHERE created_for_user_id = $1
        AND used = false
        AND revoked_at IS NULL
        AND expires_at > now()
      RETURNING id, link`,
    [userId],
  );
  return rows;
};
