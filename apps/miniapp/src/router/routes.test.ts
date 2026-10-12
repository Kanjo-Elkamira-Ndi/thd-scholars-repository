import { describe, expect, it } from 'vitest';
import { navItemsForRole, routeByPath, routes } from './routes';

describe('navItemsForRole', () => {
  it('shows only universal tabs for a scholar', () => {
    expect(navItemsForRole('scholar').map((route) => route.path)).toEqual(['/', '/library']);
  });

  it('adds registrar and admin tabs by role', () => {
    expect(navItemsForRole('registrar').map((route) => route.path)).toEqual([
      '/',
      '/library',
      '/roster',
      '/requests',
    ]);
    expect(navItemsForRole('admin').map((route) => route.path)).toEqual([
      '/',
      '/library',
      '/roster',
      '/requests',
      '/members',
    ]);
  });

  it('hides restricted tabs when the role is unknown', () => {
    expect(navItemsForRole(undefined).map((route) => route.path)).toEqual(['/', '/library']);
  });

  it('keeps the tab bar within five items for every role', () => {
    for (const role of ['scholar', 'faculty', 'registrar', 'admin'] as const) {
      expect(navItemsForRole(role).length).toBeLessThanOrEqual(5);
    }
  });

  it('never shows a non-nav route in the tab bar', () => {
    const navPaths = navItemsForRole('admin').map((route) => route.path);
    expect(navPaths).not.toContain('/audit');
    expect(navPaths).not.toContain('/settings');
    expect(navPaths).not.toContain('/registration');
  });
});

describe('routeByPath', () => {
  it('finds routes and their access rules', () => {
    expect(routeByPath('/')?.label).toBe('Home');
    expect(routeByPath('/audit')?.roles).toEqual(['admin']);
    expect(routeByPath('/library')?.roles).toBeUndefined();
    expect(routeByPath('/nope')).toBeUndefined();
  });

  it('declares a unique path for every route', () => {
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
