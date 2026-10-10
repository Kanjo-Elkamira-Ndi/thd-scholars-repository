import { describe, expect, it } from 'vitest';
import { rosterQuerySchema } from './roster';

describe('rosterQuerySchema', () => {
  it('applies pagination defaults', () => {
    expect(rosterQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces string query params to numbers', () => {
    const parsed = rosterQuerySchema.parse({ cohortYear: '2025', page: '2' });
    expect(parsed.cohortYear).toBe(2025);
    expect(parsed.page).toBe(2);
  });

  it('rejects pageSize above 100', () => {
    expect(rosterQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(rosterQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false);
  });
});
