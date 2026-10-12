import type { Role } from '@thd/shared';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  ClipboardList,
  Home,
  Inbox,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { HomeScreen } from '@/features/home/HomeScreen';
import { PlaceholderScreen } from '@/features/placeholder/PlaceholderScreen';

export interface AppRoute {
  path: string;
  /** Full page title (used by the header). */
  label: string;
  /** Compact label for the bottom tab bar. */
  navLabel?: string;
  icon?: LucideIcon;
  element: ReactNode;
  /** Roles allowed to view this route. Omit for "everyone". */
  roles?: Role[];
  /** Whether this route appears in the bottom tab bar. */
  showInNav: boolean;
}

/**
 * Single source of truth for navigation *and* access control.
 * The header, the tab bar and the router all derive from this list, so adding a
 * screen is a one-line change here.
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
    path: '/library',
    label: 'Library',
    icon: BookOpen,
    element: (
      <PlaceholderScreen
        title="Library"
        description="Browse and search sermon audio, seminars and research papers posted to the repository."
      />
    ),
    showInNav: true,
  },
  {
    path: '/roster',
    label: 'Roster',
    navLabel: 'Roster',
    icon: ClipboardList,
    roles: ['registrar', 'admin'],
    element: (
      <PlaceholderScreen
        title="Roster"
        description="Review scholar records, cohort progress and access-review flags."
      />
    ),
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
    element: (
      <PlaceholderScreen
        title="Registration"
        description="Your registration details and current roster standing."
      />
    ),
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
