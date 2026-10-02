import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { FullPageLoader } from '@/components/feedback/full-page-loader';
import { useAuth } from '@/hooks/use-auth';
import { usePermission } from '@/hooks/use-permission';

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

  if (status === 'initializing') {
    return <FullPageLoader label="Restaurando sesión…" />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/acceso" replace state={{ from: location.pathname }} />;
  }

  if (permission && !hasRoutePermission) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
