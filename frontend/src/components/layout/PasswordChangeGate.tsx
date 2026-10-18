import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { env } from '@/config/env';
import { useAuth } from '@/hooks/use-auth';
import { ROUTE_PATHS } from '@/routes/route-paths';

interface PasswordChangeGateProps {
  children: ReactNode;
}

/**
 * Mientras la sesión exija cambiar la contraseña (PLAN-AUTH-LOCAL D13), toda
 * ruta que envuelve lleva a la pantalla de cambio.
 *
 * Es navegación, no seguridad: el backend ya responde `403
 * PASSWORD_CHANGE_REQUIRED` a cualquier otra llamada. Sin esta guardia el
 * usuario vería un shell lleno de errores en lugar de una explicación.
 */
export function PasswordChangeGate({ children }: PasswordChangeGateProps) {
  const { isAuthenticated, passwordChangeRequired } = useAuth();

  // Con Entra ID no hay contraseña local que cambiar: la pantalla ni siquiera existe.
  if (env.VITE_AUTH_PROVIDER === 'local' && isAuthenticated && passwordChangeRequired) {
    return <Navigate to={ROUTE_PATHS.changePassword} replace />;
  }

  return <>{children}</>;
}
