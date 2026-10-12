import type { Role } from '@thd/shared';
import type { ReactNode } from 'react';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { ErrorState } from '@/components/shared/ErrorState';
import { ScreenSkeleton } from '@/components/shared/LoadingSkeletons';
import { UnauthorizedScreen } from '@/components/shared/UnauthorizedScreen';
import { useMe } from '@/hooks/use-me';
import { isUnauthorized } from '@/lib/api';

interface RequireRoleProps {
  roles: Role[];
  children: ReactNode;
}

/**
 * Gates a route on the caller's role. Identity comes from `/api/me`, so this
 * also owns the app's loading / unauthenticated / error states.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { data, isPending, isError, error, refetch } = useMe();

  if (isPending) return <ScreenSkeleton />;

  if (isError) {
    if (isUnauthorized(error)) return <UnauthorizedScreen />;
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (!roles.includes(data.user.role)) return <AccessDenied />;

  return <>{children}</>;
}
