import { useLocation } from 'react-router';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { useMe } from '@/hooks/use-me';
import { routeByPath } from '@/router/routes';

export function AppHeader() {
  const location = useLocation();
  const { data } = useMe();
  const route = routeByPath(location.pathname);
  const title = route?.label ?? 'Scholars Repository';

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pb-3 backdrop-blur"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        <p className="truncate text-xs text-muted-foreground">Th.D. Scholars Repository</p>
      </div>
      {data ? <RoleBadge role={data.user.role} /> : null}
    </header>
  );
}
