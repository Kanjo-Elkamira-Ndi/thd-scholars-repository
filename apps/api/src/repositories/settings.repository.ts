import {
  DEFAULT_DRIVE_THRESHOLD_BYTES,
  DEFAULT_MAX_CONTENT_UPLOAD_BYTES,
  TELEGRAM_MAX_UPLOAD_BYTES,
} from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';

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
