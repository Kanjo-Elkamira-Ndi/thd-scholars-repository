import { createHashRouter, Navigate } from 'react-router';
import { App } from '@/App';
import { RequireRole } from '@/components/layout/RequireRole';
import { routes, type AppRoute } from './routes';

function elementFor(route: AppRoute) {
  if (route.roles && route.roles.length > 0) {
    return <RequireRole roles={route.roles}>{route.element}</RequireRole>;
  }
  return route.element;
}

/**
 * Hash routing keeps deep links working inside Telegram's WebView, where the
 * server never sees the client-side path.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      ...routes.map((route) =>
        route.path === '/'
          ? { index: true as const, element: elementFor(route) }
          : { path: route.path.replace(/^\//, ''), element: elementFor(route) },
      ),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
