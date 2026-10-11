import {
  DEFAULT_DRIVE_THRESHOLD_BYTES,
  DEFAULT_MAX_CONTENT_UPLOAD_BYTES,
  DEFAULT_REGISTRATION_ID_REGEX,
  TELEGRAM_MAX_UPLOAD_BYTES,
  type SystemSettings,
} from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

const DEFAULT_COHORT_YEARS = [2025, 2026];

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

export async function getSetting<T>(key: string, db: Db = pool): Promise<T | undefined> {
  const result = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value;
}

export async function getRegistrationIdPattern(db: Db = pool): Promise<string> {
  const value = await getSetting<string>('registrationIdPattern', db);
  if (!value) {
    throw new Error('registrationIdPattern setting is not configured');
  }
  return value;
}

export async function getInviteLinkExpirySeconds(db: Db = pool): Promise<number> {
  const value = await getSetting<number>('inviteLinkExpirySeconds', db);
  return toPositiveInt(value) ?? 86400;
}

export async function getDriveThresholdBytes(db: Db = pool): Promise<number> {
  const value = await getSetting<number>('maxUploadSizeBytes', db);
  const parsed = toPositiveInt(value);
  if (parsed === null) return DEFAULT_DRIVE_THRESHOLD_BYTES;
  return Math.min(parsed, TELEGRAM_MAX_UPLOAD_BYTES);
}

export async function getMaxContentUploadBytes(db: Db = pool): Promise<number> {
  const value = await getSetting<number>('maxContentUploadBytes', db);
  return toPositiveInt(value) ?? DEFAULT_MAX_CONTENT_UPLOAD_BYTES;
}

export async function getSystemSettings(db: Db = pool): Promise<SystemSettings> {
  const [pattern, cohortYears, inviteLinkExpirySeconds, maxUploadSizeBytes, maxContentUploadBytes] =
    await Promise.all([
      getSetting<string>('registrationIdPattern', db),
      getSetting<number[]>('availableCohortYears', db),
      getInviteLinkExpirySeconds(db),
      getDriveThresholdBytes(db),
      getMaxContentUploadBytes(db),
    ]);

  const years =
    Array.isArray(cohortYears) && cohortYears.every((year) => typeof year === 'number')
      ? cohortYears
      : DEFAULT_COHORT_YEARS;

  return {
    registrationIdPattern: typeof pattern === 'string' && pattern.length > 0 ? pattern : DEFAULT_REGISTRATION_ID_REGEX,
    availableCohortYears: years,
    inviteLinkExpirySeconds,
    maxUploadSizeBytes,
    maxContentUploadBytes,
  };
}

export async function upsertSettings(
  entries: { key: string; value: unknown }[],
  updatedBy: string | null,
  db: Db = pool,
): Promise<void> {
  for (const entry of entries) {
    await db.query(
      `INSERT INTO settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [entry.key, JSON.stringify(entry.value), updatedBy],
    );
  }
}
