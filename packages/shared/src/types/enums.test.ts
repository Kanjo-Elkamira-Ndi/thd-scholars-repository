import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from './enums';

describe('ROLES', () => {
  it('lists every role exactly once', () => {
    expect(ROLES).toEqual(['scholar', 'faculty', 'registrar', 'admin']);
    expect(new Set(ROLES).size).toBe(ROLES.length);
  });

  it('is assignable to Role', () => {
    const roles: readonly Role[] = ROLES;
    expect(roles).toHaveLength(4);
  });
});
