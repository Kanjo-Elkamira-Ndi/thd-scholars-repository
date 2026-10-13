import { ROLES } from '@thd/shared';
import { describe, expect, it } from 'vitest';
import { navItemsForRole, routeByPath, routes } from './routes';

describe('navItemsForRole', () => {
  it('shows the home and content tabs for a scholar', () => {
    expect(navItemsForRole('scholar').map((route) => route.path)).toEqual(['/', '/content']);
  });

  it('adds role-scoped tabs for registrar and admin', () => {
    expect(navItemsForRole('registrar').map((route) => route.path)).toEqual([
      '/',
      '/content',
      '/roster',
      '/requests',
    ]);
    expect(navItemsForRole('admin').map((route) => route.path)).toEqual([
      '/',
      '/content',
      '/roster',
      '/requests',
      '/members',
    ]);
  });

  it('hides restricted tabs when the role is unknown', () => {
    expect(navItemsForRole(undefined).map((route) => route.path)).toEqual(['/', '/content']);
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
    expect(navPaths).not.toContain('/content/new');
    expect(navPaths).not.toContain('/content/:id/edit');
  });
});

describe('routeByPath', () => {
  it('finds routes and their access rules', () => {
    expect(routeByPath('/')?.label).toBe('Home');
    expect(routeByPath('/audit')?.roles).toEqual(['admin']);
    expect(routeByPath('/content')?.roles).toBeUndefined();
    expect(routeByPath('/nope')).toBeUndefined();
  });

  it('declares a unique path for every route', () => {
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('registration route', () => {
  it('is open to every role and hidden from the tab bar', () => {
    const route = routeByPath('/registration');
    expect(route?.showInNav).toBe(false);
    expect(route?.roles).toEqual(expect.arrayContaining([...ROLES]));
  });
});

describe('content composer routes', () => {
  it('are restricted to faculty and admin and hidden from the tab bar', () => {
    for (const path of ['/content/new', '/content/:id/edit']) {
      const route = routeByPath(path);
      expect(route?.roles).toEqual(['faculty', 'admin']);
      expect(route?.showInNav).toBe(false);
    }
  });
});
