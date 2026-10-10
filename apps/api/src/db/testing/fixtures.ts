import type { Role, User } from '@thd/shared';
import pool from '../pool';
import { upsertByTelegram } from '../../repositories/users.repository';

export const createUser = async (telegramId: number, role: Role): Promise<User> => {
  const user = await upsertByTelegram({
    telegramId,
    username: `dev_${role}`,
    fullName: `Dev ${role}`,
  });
  if (role !== 'scholar') {
    await pool.query('UPDATE users SET role = $2 WHERE id = $1', [user.id, role]);
    user.role = role;
  }
  return user;
};

export const insertRosterRow = async (input: {
  registrationId: string;
  cohortYear?: number;
  programTrack?: string;
  status?: string;
  userId?: string | null;
}): Promise<string> => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO roster (registration_id, cohort_year, program_track, status, user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      input.registrationId,
      input.cohortYear ?? 2025,
      input.programTrack ?? 'Theology',
      input.status ?? 'active',
      input.userId ?? null,
    ],
  );
  return rows[0].id;
};
