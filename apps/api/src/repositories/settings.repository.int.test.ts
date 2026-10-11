import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DRIVE_THRESHOLD_BYTES,
  DEFAULT_MAX_CONTENT_UPLOAD_BYTES,
  TELEGRAM_MAX_UPLOAD_BYTES,
} from '@thd/shared';
import pool from '../db/pool';
import { resetTestDatabase } from '../db/testing/test-database';
import { getDriveThresholdBytes, getMaxContentUploadBytes } from './settings.repository';

beforeEach(resetTestDatabase);

describe('content migration 0009', () => {
  it('adds the delivery and staging columns to content_posts', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'content_posts'`,
    );
    const columns = rows.map((row) => row.column_name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'pending_action',
        'delivery_status',
        'delivery_attempts',
        'telegram_message_id',
        'drive_link',
        'file_size_bytes',
      ]),
    );
  });

  it('reseeds the drive threshold and inserts the content upload cap', async () => {
    const { rows } = await pool.query<{ key: string; value: number }>(
      `SELECT key, value FROM settings WHERE key IN ('maxUploadSizeBytes', 'maxContentUploadBytes')`,
    );
    const byKey = Object.fromEntries(rows.map((row) => [row.key, Number(row.value)]));
    expect(byKey.maxUploadSizeBytes).toBe(DEFAULT_DRIVE_THRESHOLD_BYTES);
    expect(byKey.maxContentUploadBytes).toBe(DEFAULT_MAX_CONTENT_UPLOAD_BYTES);
  });
});

describe('getDriveThresholdBytes', () => {
  it('returns the configured threshold', async () => {
    expect(await getDriveThresholdBytes()).toBe(DEFAULT_DRIVE_THRESHOLD_BYTES);
  });

  it('clamps a threshold above the telegram cap', async () => {
    await pool.query(`UPDATE settings SET value = '60000000'::jsonb WHERE key = 'maxUploadSizeBytes'`);
    expect(await getDriveThresholdBytes()).toBe(TELEGRAM_MAX_UPLOAD_BYTES);
  });

  it('falls back to the default when the setting is missing', async () => {
    await pool.query(`DELETE FROM settings WHERE key = 'maxUploadSizeBytes'`);
    expect(await getDriveThresholdBytes()).toBe(DEFAULT_DRIVE_THRESHOLD_BYTES);
  });
});

describe('getMaxContentUploadBytes', () => {
  it('falls back to the default when missing', async () => {
    await pool.query(`DELETE FROM settings WHERE key = 'maxContentUploadBytes'`);
    expect(await getMaxContentUploadBytes()).toBe(DEFAULT_MAX_CONTENT_UPLOAD_BYTES);
  });
});
