import { describe, expect, it } from 'vitest';
import { safeEqualBuffers, safeEqualHex } from './constant-time';

describe('constant-time compare', () => {
  it('matches equal buffers', () => {
    expect(safeEqualBuffers(Buffer.from('abc'), Buffer.from('abc'))).toBe(true);
  });
  it('rejects different buffers', () => {
    expect(safeEqualBuffers(Buffer.from('abc'), Buffer.from('abd'))).toBe(false);
  });
  it('returns false (not throw) on length mismatch', () => {
    expect(() => safeEqualBuffers(Buffer.from('abc'), Buffer.from('ab'))).not.toThrow();
    expect(safeEqualBuffers(Buffer.from('abc'), Buffer.from('ab'))).toBe(false);
  });
  it('matches equal hex digests', () => {
    expect(safeEqualHex('deadbeef', 'deadbeef')).toBe(true);
  });
  it('returns false (not throw) on differing hex length', () => {
    expect(() => safeEqualHex('deadbeef', 'cd')).not.toThrow();
    expect(safeEqualHex('deadbeef', 'cd')).toBe(false);
  });
  it('rejects different hex digests', () => {
    expect(safeEqualHex('deadbeef', 'deadbee0')).toBe(false);
  });
});
