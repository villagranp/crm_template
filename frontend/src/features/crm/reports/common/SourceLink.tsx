import { Link } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { usePermission } from '@/hooks/use-permission';

/**
 * Código de un registro como enlace a su ficha (05 E.1, AC-05.4): sólo con el permiso `.ver`
 * de esa entidad (la ruta de la ficha ya está registrada en el router); si no, texto. Es
 * experiencia de usuario: el módulo dueño vuelve a validar permiso y alcance al abrirla.
 */
export interface SourceLinkProps {
  /** Ruta de la ficha (`projectDetailPath(id)`, `customerDetailPath(id)`…). */
  to: string;
  /** Permiso `.ver` de la entidad de origen (`REPORT_SOURCE_PERMISSIONS`). */
  permission: string;
  children: ReactNode;
  /** Nombre accesible del enlace (p. ej. "Abrir el proyecto PRY-2026-00042"). */
  label?: string;
}

export function SourceLink({ to, permission, children, label }: SourceLinkProps) {
  const allowed = usePermission(permission);
  if (!allowed) {
    return <>{children}</>;
  }
  return (
    <Link component={RouterLink} to={to} aria-label={label} underline="hover" sx={{ fontWeight: 600 }}>
      {children}
    </Link>
  );
}
