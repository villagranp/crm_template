import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { env } from '@/config/env';
import { ROUTE_PATHS } from '@/routes/route-paths';

interface RequireLocalAuthProps {
  children: ReactNode;
}

/**
 * Las pantallas de contraseña propia sólo existen con el proveedor local: con Entra ID la
 * contraseña la gestiona Microsoft y esta aplicación nunca la ve. Es navegación, no seguridad.
 */
export function RequireLocalAuth({ children }: RequireLocalAuthProps) {
  if (env.VITE_AUTH_PROVIDER !== 'local') {
    return <Navigate to={ROUTE_PATHS.home} replace />;
  }
  return <>{children}</>;
}
