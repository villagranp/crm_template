import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { FullPageLoader } from '@/components/feedback/full-page-loader';
import { useAuth } from '@/hooks/use-auth';
import { usePermission } from '@/hooks/use-permission';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { useAuthStore } from '@/stores/auth.store';

interface RequireAuthProps {
  children: ReactNode;
  /** Permiso `recurso.accion` que la ruta exige, si aplica. */
  permission?: string;
}

/**
 * Guardia de ruta.
 *
 * Es una comodidad de navegación, no un control de seguridad: el backend
 * vuelve a exigir autenticación y permiso en cada petición (ADR-006, ADR-008).
 * El permiso declarado aquí debe ser el mismo que el de la opción de menú
 * registrada en la base de datos.
 */
export function RequireAuth({ children, permission }: RequireAuthProps) {
  const { status } = useAuth();
  const location = useLocation();
  const hasRoutePermission = usePermission(permission ?? '');
  const signedOutByUser = useAuthStore((state) => state.signedOutByUser);

  if (status === 'initializing') {
    return <FullPageLoader label="Restaurando sesión…" />;
  }

  if (status !== 'authenticated') {
    // Tras un cierre voluntario no se recuerda la ruta: el siguiente usuario puede no tener acceso.
    return (
      <Navigate
        to={ROUTE_PATHS.login}
        replace
        state={signedOutByUser ? undefined : { from: location.pathname }}
      />
    );
  }

  if (permission && !hasRoutePermission) {
    return <Navigate to={ROUTE_PATHS.home} replace />;
  }

  return <>{children}</>;
}
