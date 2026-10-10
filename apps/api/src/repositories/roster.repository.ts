import type { RosterEntry } from '@thd/shared';
import pool from '../db/pool';

interface RosterRow {
  id: string;
  user_id: string;
  registration_id: string;
  cohort_year: number;
  program_track: string;
  supervisor_name: string | null;
  status: string;
  updated_by: string | null;
  updated_at: Date;
  created_at: Date;
}

const STATUS_VALUES = ['active', 'graduated', 'withdrawn', 'pending'] as const satisfies readonly RosterEntry['status'][];

export const getRosterByUserId = async (userId: string): Promise<RosterEntry | null> => {
  const { rows } = await pool.query<RosterRow>(
    `SELECT id, user_id, registration_id, cohort_year, program_track, supervisor_name, status, updated_by, updated_at, created_at
     FROM roster
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    registrationId: row.registration_id,
    cohortYear: row.cohort_year,
    programTrack: row.program_track,
    supervisorName: row.supervisor_name,
    status: (STATUS_VALUES as readonly string[]).includes(row.status)
      ? (row.status as RosterEntry['status'])
      : 'pending',
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
};
