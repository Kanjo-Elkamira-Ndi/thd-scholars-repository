import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChannelUrl, channelIdFromEnv } from './channel-link';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildChannelUrl', () => {
  it('strips the -100 private-channel prefix', () => {
    expect(buildChannelUrl('-1001234567890', 42)).toBe('https://t.me/c/1234567890/42');
  });

  it('accepts an unprefixed numeric channel id', () => {
    expect(buildChannelUrl('1234567890', 7)).toBe('https://t.me/c/1234567890/7');
  });

  it('returns null when the channel id is missing', () => {
    expect(buildChannelUrl(undefined, 5)).toBeNull();
    expect(buildChannelUrl(null, 5)).toBeNull();
    expect(buildChannelUrl('', 5)).toBeNull();
  });

  it('returns null when the message id is missing', () => {
    expect(buildChannelUrl('-100123', null)).toBeNull();
    expect(buildChannelUrl('-100123', undefined)).toBeNull();
  });

  it('returns null for a non-numeric (public) channel handle', () => {
    expect(buildChannelUrl('@some_channel', 9)).toBeNull();
  });
});

describe('channelIdFromEnv', () => {
  it('reads VITE_CHANNEL_ID', () => {
    vi.stubEnv('VITE_CHANNEL_ID', '-100123');
    expect(channelIdFromEnv()).toBe('-100123');
  });

  it('returns undefined when unset or blank', () => {
    expect(channelIdFromEnv()).toBeUndefined();
    vi.stubEnv('VITE_CHANNEL_ID', '   ');
    expect(channelIdFromEnv()).toBeUndefined();
  });
});
