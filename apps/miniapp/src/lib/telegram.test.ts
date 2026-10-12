import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTelegramName, getInitData, getMockUser, isTelegramEnvironment } from './telegram';

function setWebApp(value: unknown): void {
  (window as unknown as { Telegram?: unknown }).Telegram = value;
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe('telegram environment', () => {
  it('detects Telegram and reads initData', () => {
    setWebApp({ WebApp: { initData: 'query_id=abc' } });
    expect(isTelegramEnvironment()).toBe(true);
    expect(getInitData()).toBe('query_id=abc');
  });

  it('reports empty initData outside Telegram', () => {
    expect(isTelegramEnvironment()).toBe(false);
    expect(getInitData()).toBe('');
  });
});

describe('getMockUser', () => {
  it('parses a valid VITE_MOCK_USER', () => {
    vi.stubEnv('VITE_MOCK_USER', JSON.stringify({ id: 7, firstName: 'Ada', username: 'ada' }));
    expect(getMockUser()).toEqual({
      id: 7,
      firstName: 'Ada',
      lastName: undefined,
      username: 'ada',
    });
  });

  it('returns null for missing or malformed values', () => {
    expect(getMockUser()).toBeNull();
    vi.stubEnv('VITE_MOCK_USER', '{not json');
    expect(getMockUser()).toBeNull();
    vi.stubEnv('VITE_MOCK_USER', JSON.stringify({ username: 'no-id' }));
    expect(getMockUser()).toBeNull();
  });
});

describe('formatTelegramName', () => {
  it('prefers full name, then username, then id', () => {
    expect(formatTelegramName({ id: 1, firstName: 'Ada', lastName: 'Lovelace' })).toBe(
      'Ada Lovelace',
    );
    expect(formatTelegramName({ id: 2, username: 'grace' })).toBe('grace');
    expect(formatTelegramName(undefined)).toBe('');
  });
});
