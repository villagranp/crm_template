import { Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { ErrorBoundary } from '@/components/feedback/error-boundary';
import { FullPageLoader } from '@/components/feedback/full-page-loader';
import { AppShell } from '@/components/layout/AppShell';
import { PasswordChangeGate } from '@/components/layout/PasswordChangeGate';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { ADMIN_ROUTES } from '@/features/admin/admin-routes';
import { CRM_ROUTES } from '@/features/crm/crm-routes';
import { ChangePasswordPage } from '@/routes/pages/ChangePasswordPage';
import { HomePage } from '@/routes/pages/HomePage';
import { LoginPage } from '@/routes/pages/LoginPage';
import { NotFoundPage } from '@/routes/pages/NotFoundPage';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { collectNavigablePaths } from '@/routes/route-tree';

/**
 * Rutas que viven dentro del shell (menú lateral, topbar).
 *
 * Toda ruta de funcionalidad se añade aquí, protegida con `RequirePermission`
 * y el MISMO permiso que el `requiredPermission` de su opción de menú en la
 * base de datos; si no coinciden, el menú mostrará una entrada que lleva a una
 * pantalla que el backend va a rechazar. Además, la ruta se añade a
 * `backend/src/modules/access/app-routes.registry.json` (PLAN-ADMIN D6):
 * `route-registry.spec.ts` compara ambos y falla si divergen.
 */
export const shellRoutes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  ...[...ADMIN_ROUTES, ...CRM_ROUTES].map(({ path, permission, Page }) => ({
    path,
    element: (
      <RequirePermission permission={permission}>
        <Suspense fallback={<FullPageLoader />}>
          <Page />
        </Suspense>
      </RequirePermission>
    ),
  })),
  { path: '*', element: <NotFoundPage /> },
];

/** Rutas navegables del shell; deben ser exactamente las del registro del backend. */
export function getShellNavigablePaths(): string[] {
  return collectNavigablePaths(shellRoutes, ROUTE_PATHS.home);
}

/**
 * Tabla de rutas.
 *
 * Todo el shell exige sesión (`RequireAuth`): sin ella, cualquier ruta lleva a
 * `/acceso` y, al entrar, se vuelve a la que se pidió. Después va
 * `PasswordChangeGate`: con un cambio de contraseña pendiente (D13) toda ruta
 * lleva a `/cambiar-contrasena`, que vive fuera del shell porque el menú aún no
 * está disponible para esa sesión.
 */
export const appRoutes: RouteObject[] = [
  {
    path: ROUTE_PATHS.login,
    element: <LoginPage />,
  },
  {
    path: ROUTE_PATHS.changePassword,
    element: (
      <RequireAuth>
        <ChangePasswordPage />
      </RequireAuth>
    ),
  },
  {
    path: ROUTE_PATHS.home,
    element: (
      <RequireAuth>
        <PasswordChangeGate>
          <AppShell />
        </PasswordChangeGate>
      </RequireAuth>
    ),
    errorElement: (
      <ErrorBoundary>
        <NotFoundPage />
      </ErrorBoundary>
    ),
    children: shellRoutes,
  },
];

export const appRouter = createBrowserRouter(appRoutes);
