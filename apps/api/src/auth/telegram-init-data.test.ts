import { describe, expect, it } from 'vitest';
import {
  buildDataCheckString,
  computeInitDataHash,
  signInitData,
  verifyTelegramInitData,
} from './telegram-init-data';

const BOT_TOKEN = '123456789:TEST-BOT-TOKEN';
const MAX_AGE = 86400;
const now = () => Math.floor(Date.now() / 1000);

describe('verifyTelegramInitData', () => {
  it('accepts a valid signed initData', () => {
    const token = signInitData(
      { telegramId: 4444444444, username: 'dev_admin', firstName: 'Dev', lastName: 'Admin' },
      BOT_TOKEN,
    );
    expect(verifyTelegramInitData(token, BOT_TOKEN, MAX_AGE)).toEqual({
      telegramId: 4444444444,
      username: 'dev_admin',
      fullName: 'Dev Admin',
    });
  });

  it('rejects a tampered user field', () => {
    const token = signInitData({ telegramId: 4444444444, username: 'dev_admin' }, BOT_TOKEN);
    const tampered = token.replace('%22id%22%3A4444444444', '%22id%22%3A9999999999');
    expect(() => verifyTelegramInitData(tampered, BOT_TOKEN, MAX_AGE)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('rejects an expired auth_date', () => {
    const token = signInitData({ telegramId: 4444444444 }, BOT_TOKEN, now() - MAX_AGE - 60);
    expect(() => verifyTelegramInitData(token, BOT_TOKEN, MAX_AGE)).toThrow('initData expired');
  });

  it('rejects auth_date more than 60s in the future', () => {
    const token = signInitData({ telegramId: 4444444444 }, BOT_TOKEN, now() + 120);
    expect(() => verifyTelegramInitData(token, BOT_TOKEN, MAX_AGE)).toThrow(
      'initData from the future',
    );
  });

  it('rejects a wrong-length hash with 401, never a throw-through', () => {
    const token = signInitData({ telegramId: 4444444444 }, BOT_TOKEN);
    const bad = token.replace(/hash=[0-9a-f]*$/, 'hash=abc123');
    expect(() => verifyTelegramInitData(bad, BOT_TOKEN, MAX_AGE)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }),
    );
  });

  it('rejects missing hash', () => {
    const token = signInitData({ telegramId: 4444444444 }, BOT_TOKEN);
    const noHash = token.replace(/&hash=[0-9a-f]*$/, '');
    expect(() => verifyTelegramInitData(noHash, BOT_TOKEN, MAX_AGE)).toThrow(
      'initData missing hash',
    );
  });

  it('rejects missing user', () => {
    const params = new Map<string, string>([['auth_date', String(now())]]);
    params.set('hash', computeInitDataHash(params, BOT_TOKEN));
    const token = [...params.entries()]
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    expect(() => verifyTelegramInitData(token, BOT_TOKEN, MAX_AGE)).toThrow(
      'initData missing user',
    );
  });

  it('keeps signature in the data-check-string (excludes only hash)', () => {
    expect(buildDataCheckString(new Map<string, string>([['hash', 'x'], ['signature', 'y']]))).toBe(
      'signature=y',
    );
    const params = new Map<string, string>([
      ['user', JSON.stringify({ id: 5 })],
      ['auth_date', String(now())],
      ['signature', 'some-signature'],
    ]);
    params.set('hash', computeInitDataHash(params, BOT_TOKEN));
    const token = [...params.entries()]
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    expect(verifyTelegramInitData(token, BOT_TOKEN, MAX_AGE)).toEqual({
      telegramId: 5,
      username: null,
      fullName: 'Telegram user 5',
    });
  });
});
