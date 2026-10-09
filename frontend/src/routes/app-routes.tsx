import { createBrowserRouter } from 'react-router-dom';

import { ErrorBoundary } from '@/components/feedback/error-boundary';
import { AppShell } from '@/components/layout/AppShell';
import { PasswordChangeGate } from '@/components/layout/PasswordChangeGate';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { ChangePasswordPage } from '@/routes/pages/ChangePasswordPage';
import { HomePage } from '@/routes/pages/HomePage';
import { LoginPage } from '@/routes/pages/LoginPage';
import { NotFoundPage } from '@/routes/pages/NotFoundPage';
import { ROUTE_PATHS } from '@/routes/route-paths';

/**
 * Tabla de rutas.
 *
 * Las rutas de funcionalidad se añaden como hijas del shell y su acceso se
 * protege con `RequireAuth` (y, cuando aplique, comprobando el permiso de la
 * opción correspondiente). La ruta y el permiso deben coincidir con los de la
 * opción registrada en la base de datos; si no, el menú mostrará una entrada
 * que lleva a una pantalla que el backend va a rechazar.
 *
 * El shell va detrás de `PasswordChangeGate`: con un cambio de contraseña
 * pendiente (D13) toda ruta lleva a `/cambiar-contrasena`, que vive fuera del
 * shell porque el menú aún no está disponible para esa sesión.
 */
export const appRouter = createBrowserRouter([
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
      <PasswordChangeGate>
        <AppShell />
      </PasswordChangeGate>
    ),
    errorElement: (
      <ErrorBoundary>
        <NotFoundPage />
      </ErrorBoundary>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
