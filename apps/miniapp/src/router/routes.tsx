import type { Role } from '@thd/shared';
import { ROLES } from '@thd/shared';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, ClipboardList, Inbox, Home, Settings, ShieldCheck, UserCog, Users } from 'lucide-react';
import { lazy, Suspense, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { ScreenSkeleton } from '@/components/shared/LoadingSkeletons';
import { HomeScreen } from '@/features/home/HomeScreen';
import { PlaceholderScreen } from '@/features/placeholder/PlaceholderScreen';
import { RegistrationScreen } from '@/features/registration/RegistrationScreen';

const RosterScreen = lazy(() => import('@/features/roster/RosterScreen'));
const ContentScreen = lazy(() => import('@/features/content/ContentScreen'));
const ContentComposerScreen = lazy(() => import('@/features/content/ContentComposerScreen'));

/** Wrap a lazily-loaded screen in a suspense boundary. */
function lazyElement(Component: ComponentType): ReactElement {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <Component />
    </Suspense>
  );
}

export interface AppRoute {
  path: string;
  label: string;
  navLabel?: string;
  icon?: LucideIcon;
  element: ReactNode;
  roles?: Role[];
  showInNav: boolean;
}

/**
 * The header, the tab bar and the router all derive from this list, so adding a
 * screen is a one-line change here. Access rules live next to the route.
 */
export const routes: AppRoute[] = [
  {
    path: '/',
    label: 'Home',
    icon: Home,
    element: <HomeScreen />,
    showInNav: true,
  },
  {
    path: '/content',
    label: 'Content',
    navLabel: 'Content',
    icon: BookOpen,
    element: lazyElement(ContentScreen),
    showInNav: true,
  },
  {
    path: '/roster',
    label: 'Roster',
    navLabel: 'Roster',
    icon: ClipboardList,
    roles: ['registrar', 'admin'],
    element: lazyElement(RosterScreen),
    showInNav: true,
  },
  {
    path: '/requests',
    label: 'Requests',
    icon: Inbox,
    roles: ['registrar', 'admin'],
    element: (
      <PlaceholderScreen title="Requests" description="Review and decide pending join requests." />
    ),
    showInNav: true,
  },
  {
    path: '/members',
    label: 'Members',
    icon: Users,
    roles: ['admin'],
    element: (
      <PlaceholderScreen
        title="Members"
        description="Manage roles, access reviews and removals across the community."
      />
    ),
    showInNav: true,
  },
  {
    path: '/registration',
    label: 'Registration',
    icon: UserCog,
    roles: [...ROLES],
    element: <RegistrationScreen />,
    showInNav: false,
  },
  {
    path: '/content/new',
    label: 'New content',
    icon: BookOpen,
    roles: ['faculty', 'admin'],
    element: lazyElement(ContentComposerScreen),
    showInNav: false,
  },
  {
    path: '/content/:id/edit',
    label: 'Edit content',
    icon: BookOpen,
    roles: ['faculty', 'admin'],
    element: lazyElement(ContentComposerScreen),
    showInNav: false,
  },
  {
    path: '/audit',
    label: 'Audit log',
    icon: ShieldCheck,
    element: (
      <PlaceholderScreen
        title="Audit log"
        description="Every privileged action, with actors and timestamps."
      />
    ),
    roles: ['admin'],
    showInNav: false,
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    element: (
      <PlaceholderScreen
        title="Settings"
        description="Configuration for the repository and its integrations."
      />
    ),
    roles: ['admin'],
    showInNav: false,
  },
];

/** Tab-bar items visible to the given role (all when role is undefined). */
export function navItemsForRole(role: Role | undefined): AppRoute[] {
  return routes.filter((route) => {
    if (!route.showInNav) return false;
    if (!route.roles || route.roles.length === 0) return true;
    return role !== undefined && route.roles.includes(role);
  });
}

export function routeByPath(path: string): AppRoute | undefined {
  return routes.find((route) => route.path === path);
}
