import type { Role } from '@thd/shared';
import { useMe } from './use-me';

export function useRole(): Role | undefined {
  return useMe().data?.user.role;
}

/** True when the current user holds any of the given roles. */
export function useHasRole(...roles: Role[]): boolean {
  const role = useRole();
  return role !== undefined && roles.includes(role);
}
