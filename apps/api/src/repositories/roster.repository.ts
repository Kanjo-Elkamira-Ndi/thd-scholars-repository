import type { RosterEntry, RosterStatus } from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

interface RosterRow {
  id: string;
  user_id: string | null;
  registration_id: string;
  cohort_year: number;
  program_track: string;
  supervisor_name: string | null;
  status: string;
  access_review_pending: boolean;
  access_review_flagged_at: Date | null;
  updated_by: string | null;
  updated_at: Date;
  created_at: Date;
}

const STATUS_VALUES = [
  'active',
  'graduated',
  'withdrawn',
  'pending',
] as const satisfies readonly RosterStatus[];

const ROSTER_COLUMNS = `id, user_id, registration_id, cohort_year, program_track, supervisor_name,
  status, access_review_pending, access_review_flagged_at, updated_by, updated_at, created_at`;

const ROSTER_COLUMNS_QUALIFIED = `r.id, r.user_id, r.registration_id, r.cohort_year, r.program_track, r.supervisor_name,
  r.status, r.access_review_pending, r.access_review_flagged_at, r.updated_by, r.updated_at, r.created_at`;

export const mapRosterRow = (row: RosterRow): RosterEntry => ({
  id: row.id,
  userId: row.user_id,
  registrationId: row.registration_id,
  cohortYear: row.cohort_year,
  programTrack: row.program_track,
  supervisorName: row.supervisor_name,
  status: (STATUS_VALUES as readonly string[]).includes(row.status)
    ? (row.status as RosterStatus)
    : 'pending',
  accessReviewPending: row.access_review_pending,
  accessReviewFlaggedAt: row.access_review_flagged_at?.toISOString() ?? null,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at.toISOString(),
  createdAt: row.created_at.toISOString(),
});

export const getRosterByUserId = async (
  userId: string,
  db: Db = pool,
): Promise<RosterEntry | null> => {
  const { rows } = await db.query<RosterRow>(
    `SELECT ${ROSTER_COLUMNS}
     FROM roster
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  return rows.length ? mapRosterRow(rows[0]) : null;
};

export const findByRegistrationId = async (
  registrationId: string,
  db: Db = pool,
): Promise<RosterEntry | null> => {
  const { rows } = await db.query<RosterRow>(
    `SELECT ${ROSTER_COLUMNS} FROM roster WHERE registration_id = $1`,
    [registrationId],
  );
  return rows.length ? mapRosterRow(rows[0]) : null;
};

export const getRosterById = async (id: string, db: Db = pool): Promise<RosterEntry | null> => {
  const { rows } = await db.query<RosterRow>(
    `SELECT ${ROSTER_COLUMNS} FROM roster WHERE id = $1`,
    [id],
  );
  return rows.length ? mapRosterRow(rows[0]) : null;
};

export const setRosterUserId = async (
  rosterId: string,
  userId: string,
  db: Db = pool,
): Promise<void> => {
  await db.query('UPDATE roster SET user_id = $2, updated_at = now() WHERE id = $1', [
    rosterId,
    userId,
  ]);
};

export const createRosterEntry = async (
  input: {
    registrationId: string;
    cohortYear: number;
    programTrack: string;
    supervisorName: string | null;
  },
  db: Db = pool,
): Promise<RosterEntry> => {
  const { rows } = await db.query<RosterRow>(
    `INSERT INTO roster (registration_id, cohort_year, program_track, supervisor_name)
     VALUES ($1, $2, $3, $4) RETURNING ${ROSTER_COLUMNS}`,
    [input.registrationId, input.cohortYear, input.programTrack, input.supervisorName],
  );
  return mapRosterRow(rows[0]);
};

export const updateRosterEntry = async (
  id: string,
  patch: {
    status?: RosterStatus;
    cohortYear?: number;
    programTrack?: string;
    supervisorName?: string;
    accessReviewPending?: boolean;
    accessReviewFlaggedAt?: Date | null;
    updatedBy: string;
  },
  db: Db = pool,
): Promise<RosterEntry | null> => {
  const { rows } = await db.query<RosterRow>(
    `UPDATE roster SET
       status = COALESCE($2, status),
       cohort_year = COALESCE($3, cohort_year),
       program_track = COALESCE($4, program_track),
       supervisor_name = COALESCE($5, supervisor_name),
       access_review_pending = COALESCE($6, access_review_pending),
       access_review_flagged_at = CASE WHEN $6 IS NULL THEN access_review_flagged_at ELSE $7 END,
       updated_by = $8,
       updated_at = now()
     WHERE id = $1
     RETURNING ${ROSTER_COLUMNS}`,
    [
      id,
      patch.status ?? null,
      patch.cohortYear ?? null,
      patch.programTrack ?? null,
      patch.supervisorName ?? null,
      patch.accessReviewPending === undefined ? null : patch.accessReviewPending,
      patch.accessReviewFlaggedAt ?? null,
      patch.updatedBy,
    ],
  );
  return rows.length ? mapRosterRow(rows[0]) : null;
};

export interface ListRosterParams {
  status?: string;
  cohortYear?: number;
  search?: string;
  page: number;
  pageSize: number;
}

export const listRoster = async (
  params: ListRosterParams,
  db: Db = pool,
): Promise<{ items: RosterEntry[]; total: number }> => {
  const like = params.search ? `%${params.search.replace(/[\\%_]/g, '\\$&')}%` : null;
  const filters = `
    ($1::text IS NULL OR r.status = $1)
    AND ($2::int IS NULL OR r.cohort_year = $2)
    AND ($3::text IS NULL OR r.registration_id ILIKE $3 OR u.full_name ILIKE $3)`;
  const values = [params.status ?? null, params.cohortYear ?? null, like];

  const { rows } = await db.query<RosterRow>(
    `SELECT ${ROSTER_COLUMNS_QUALIFIED}
     FROM roster r LEFT JOIN users u ON u.id = r.user_id
     WHERE ${filters}
     ORDER BY r.created_at DESC
     LIMIT $4 OFFSET $5`,
    [...values, params.pageSize, (params.page - 1) * params.pageSize],
  );

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM roster r LEFT JOIN users u ON u.id = r.user_id WHERE ${filters}`,
    values,
  );

  return { items: rows.map(mapRosterRow), total: Number(countRows[0].total) };
};
