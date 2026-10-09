import type { ReactNode } from 'react';

import { RequireAuth } from '@/components/layout/RequireAuth';
import { usePermission } from '@/hooks/use-permission';
import { AccessDeniedPage } from '@/routes/pages/AccessDeniedPage';

interface RequirePermissionProps {
  /** Permiso `recurso.accion`; debe ser el `requiredPermission` de la opción de menú de la ruta. */
  permission: string;
  children: ReactNode;
}

function PermissionCheck({ permission, children }: RequirePermissionProps) {
  const allowed = usePermission(permission);
  return allowed ? <>{children}</> : <AccessDeniedPage />;
}

/**
 * Guardia de ruta por permiso.
 *
 * Sin sesión delega en `RequireAuth` (cargador mientras se restaura, o
 * redirección al acceso). Con sesión y sin el permiso pinta "Sin acceso" en
 * lugar de redirigir, para no crear bucles ni ocultar por qué no se ve nada.
 * Como los hijos no se montan, una página cargada con `React.lazy` ni siquiera
 * se descarga si el usuario no tiene el permiso.
 *
 * Es experiencia de usuario, NO seguridad: el backend es la autoridad y
 * vuelve a exigir el permiso en cada petición (ADR-006, ADR-008, ADR-018).
 */
export function RequirePermission({ permission, children }: RequirePermissionProps) {
  return (
    <RequireAuth>
      <PermissionCheck permission={permission}>{children}</PermissionCheck>
    </RequireAuth>
  );
}
