import { createBrowserRouter } from 'react-router-dom';

import { ErrorBoundary } from '@/components/feedback/error-boundary';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/routes/pages/HomePage';
import { LoginPage } from '@/routes/pages/LoginPage';
import { NotFoundPage } from '@/routes/pages/NotFoundPage';

/**
 * Tabla de rutas.
 *
 * Las rutas de funcionalidad se añaden como hijas del shell y su acceso se
 * protege con `RequireAuth` (y, cuando aplique, comprobando el permiso de la
 * opción correspondiente). La ruta y el permiso deben coincidir con los de la
 * opción registrada en la base de datos; si no, el menú mostrará una entrada
 * que lleva a una pantalla que el backend va a rechazar.
 */
export const appRouter = createBrowserRouter([
  {
    path: '/acceso',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppShell />,
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
