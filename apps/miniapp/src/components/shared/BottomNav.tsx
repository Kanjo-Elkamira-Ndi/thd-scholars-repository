import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { navItemsForRole } from '@/router/routes';

export function BottomNav() {
  const role = useRole();
  const items = navItemsForRole(role);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-border bg-background/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 px-1 py-2 text-[0.7rem] font-medium leading-none transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
                <span className="truncate">{item.navLabel ?? item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
