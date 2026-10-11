import pool from '../db/pool';
import type { Db } from '../db/transaction';

export const getSetting = async <T>(key: string, db: Db = pool): Promise<T | null> => {
  const { rows } = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
};

export const getRegistrationIdPattern = async (db: Db = pool): Promise<string> => {
  const value = await getSetting<string>('registrationIdPattern', db);
  if (typeof value !== 'string' || !value) {
    throw new Error('settings.registrationIdPattern is missing');
  }
  return value;
};

export const getInviteLinkExpirySeconds = async (db: Db = pool): Promise<number> => {
  const value = await getSetting<number>('inviteLinkExpirySeconds', db);
  return typeof value === 'number' && value > 0 ? value : 86400;
};
