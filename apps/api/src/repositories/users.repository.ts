import type { Role, User } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

const ROLE_VALUES = ['scholar', 'faculty', 'registrar', 'admin'] as const satisfies readonly Role[];

export interface UserRow {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  full_name: string;
  email: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export const mapUserRow = (row: UserRow): User => ({
  id: row.id,
  telegramId: Number(row.telegram_id),
  telegramUsername: row.telegram_username,
  fullName: row.full_name,
  email: row.email,
  role: (ROLE_VALUES as readonly string[]).includes(row.role) ? (row.role as Role) : 'scholar',
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const USER_COLUMNS = `id, telegram_id, telegram_username, full_name, email, role, created_at, updated_at`;

export const upsertByTelegram = async (input: {
  telegramId: number;
  username: string | null;
  fullName: string;
}): Promise<User> => {
  const { rows } = await pool.query<UserRow>(
    `WITH upsert AS (
       INSERT INTO users (telegram_id, telegram_username, full_name)
       VALUES ($1::bigint, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
         SET telegram_username = EXCLUDED.telegram_username,
             updated_at = now()
         WHERE EXCLUDED.telegram_username IS DISTINCT FROM users.telegram_username
       RETURNING ${USER_COLUMNS}
     )
     SELECT ${USER_COLUMNS} FROM upsert
     UNION ALL
     SELECT ${USER_COLUMNS} FROM users WHERE telegram_id = $1::bigint
     LIMIT 1`,
    [input.telegramId, input.username, input.fullName],
  );
  return mapUserRow(rows[0]);
};

export const updateUserProfile = async (
  userId: string,
  profile: { fullName: string; email: string; telegramUsername: string | null },
  db: Db = pool,
): Promise<User> => {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
     SET full_name = $2, email = $3, telegram_username = COALESCE($4, telegram_username), updated_at = now()
     WHERE id = $1
     RETURNING id, telegram_id, telegram_username, full_name, email, role, created_at, updated_at`,
    [userId, profile.fullName, profile.email, profile.telegramUsername],
  );
  return mapUserRow(rows[0]);
};

export const getUserByTelegramId = async (
  telegramId: number,
  db: Db = pool,
): Promise<User | null> => {
  const { rows } = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE telegram_id = $1::bigint`,
    [telegramId],
  );
  return rows.length ? mapUserRow(rows[0]) : null;
};
