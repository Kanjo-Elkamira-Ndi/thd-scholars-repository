import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DRIVE_THRESHOLD_BYTES,
  DEFAULT_MAX_CONTENT_UPLOAD_BYTES,
  DEFAULT_REGISTRATION_ID_REGEX,
  TELEGRAM_MAX_UPLOAD_BYTES,
} from '@thd/shared';
import pool from '../db/pool';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import {
  getDriveThresholdBytes,
  getMaxContentUploadBytes,
  getSystemSettings,
  upsertSettings,
} from './settings.repository';

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

describe('getSystemSettings', () => {
  it('returns the seeded settings with distinct upload thresholds', async () => {
    const settings = await getSystemSettings();

    expect(settings.registrationIdPattern).toBe(DEFAULT_REGISTRATION_ID_REGEX);
    expect(settings.availableCohortYears).toEqual([2025, 2026]);
    expect(settings.inviteLinkExpirySeconds).toBe(86400);
    expect(settings.maxUploadSizeBytes).toBe(DEFAULT_DRIVE_THRESHOLD_BYTES);
    expect(settings.maxContentUploadBytes).toBe(DEFAULT_MAX_CONTENT_UPLOAD_BYTES);
    expect(settings.maxUploadSizeBytes).not.toBe(settings.maxContentUploadBytes);
  });
});

describe('upsertSettings', () => {
  it('writes values and records the actor', async () => {
    const admin = await createUser(9201, 'admin');

    await upsertSettings(
      [
        { key: 'availableCohortYears', value: [2025, 2027] },
        { key: 'inviteLinkExpirySeconds', value: 1200 },
      ],
      admin.id,
    );

    const settings = await getSystemSettings();
    expect(settings.availableCohortYears).toEqual([2025, 2027]);
    expect(settings.inviteLinkExpirySeconds).toBe(1200);

    const { rows } = await pool.query<{ updated_by: string }>(
      `SELECT updated_by FROM settings WHERE key = 'inviteLinkExpirySeconds'`,
    );
    expect(rows[0].updated_by).toBe(admin.id);
  });
});
