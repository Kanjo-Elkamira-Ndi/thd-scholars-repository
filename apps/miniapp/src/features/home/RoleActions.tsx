import type { Role } from '@thd/shared';
import { ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router';
import { Card } from '@/components/ui/card';
import { routeByPath } from '@/router/routes';

const ROLE_ACTIONS: Record<Role, string[]> = {
  scholar: ['/content', '/registration'],
  faculty: ['/content', '/registration'],
  registrar: ['/requests', '/roster', '/content'],
  admin: ['/admin', '/admin/users', '/admin/members', '/admin/audit', '/admin/settings'],
};

export function RoleActions({ role }: { role: Role }) {
  const items = ROLE_ACTIONS[role].map(routeByPath).filter((route) => route !== undefined);

  if (items.length === 0) return null;

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {items.map((route) => {
        const Icon = route.icon;
        return (
          <NavLink
            key={route.path}
            to={route.path}
            className="flex items-center gap-3 bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {Icon ? (
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : null}
            <span className="flex-1">{route.label}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </NavLink>
        );
      })}
    </Card>
  );
}
