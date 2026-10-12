import { describe, expect, it } from 'vitest';
import { quarterKey, weekKey } from './keys';

describe('quarterKey', () => {
  it('maps months to quarters in the given timezone', () => {
    expect(quarterKey(new Date('2026-01-01T00:00:00Z'), 'UTC')).toBe('2026-Q1');
    expect(quarterKey(new Date('2026-03-31T23:59:59Z'), 'UTC')).toBe('2026-Q1');
    expect(quarterKey(new Date('2026-04-01T00:00:00Z'), 'UTC')).toBe('2026-Q2');
    expect(quarterKey(new Date('2026-12-15T12:00:00Z'), 'UTC')).toBe('2026-Q4');
  });

  it('uses the local calendar day in the configured timezone', () => {
    const instant = new Date('2026-01-01T02:00:00Z');
    expect(quarterKey(instant, 'UTC')).toBe('2026-Q1');
    expect(quarterKey(instant, 'America/New_York')).toBe('2025-Q4');
  });
});

describe('weekKey', () => {
  it('formats ISO weeks with a zero-padded week number', () => {
    expect(weekKey(new Date('2026-01-05T00:00:00Z'), 'UTC')).toBe('2026-W02');
    expect(weekKey(new Date('2026-12-31T00:00:00Z'), 'UTC')).toBe('2026-W53');
  });

  it('handles the ISO year boundary', () => {
    expect(weekKey(new Date('2027-01-01T00:00:00Z'), 'UTC')).toBe('2026-W53');
    expect(weekKey(new Date('2024-12-30T00:00:00Z'), 'UTC')).toBe('2025-W01');
  });

  it('uses the local calendar day in the configured timezone', () => {
    const instant = new Date('2025-12-29T02:00:00Z');
    expect(weekKey(instant, 'UTC')).toBe('2026-W01');
    expect(weekKey(instant, 'America/New_York')).toBe('2025-W52');
  });
});
