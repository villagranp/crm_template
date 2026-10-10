import { useCallback } from 'react';

import { hasPermission } from '@/services/auth';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Checks a `resource.action` permission (ADR-008).
 *
 * UI permission checks only hide affordances. Authorization is always enforced
 * again by the backend guard; never treat this as a security control.
 */
export function usePermission(permission: string): boolean {
  return useAuthStore((state) => hasPermission(state.user, permission));
}

/**
 * Devuelve un comprobador `can('recurso.accion')` para decidir varias acciones
 * a la vez (p. ej. las acciones de cada fila de una tabla) sin un hook por
 * permiso.
 *
 * Igual que `usePermission`, sólo oculta controles: el backend vuelve a exigir
 * el permiso en cada petición y es quien decide.
 */
export function useCan(): (permission: string) => boolean {
  const user = useAuthStore((state) => state.user);
  return useCallback((permission: string) => hasPermission(user, permission), [user]);
}

/**
 * Código del rol sembrado `administrador` (ADR-018, ADR-020). Es el único rol
 * que puede cambiar qué acceso tiene alguien.
 */
export const ADMINISTRATOR_ROLE_CODE = 'administrador';

/**
 * `true` si el usuario de la sesión tiene el rol `administrador` (por código).
 *
 * ADR-020: sólo un administrador asigna roles, concede excepciones directas,
 * crea o duplica roles, cambia lo que concede un rol o actúa sobre otro
 * administrador. La interfaz usa esto para no ofrecer acciones que fallarían;
 * no es un control de seguridad: el backend vuelve a comprobarlo en cada
 * petición (`403 ADMIN_ONLY`) y es quien decide.
 */
export function useIsAdministrador(): boolean {
  return useAuthStore((state) => Boolean(state.user?.roles.includes(ADMINISTRATOR_ROLE_CODE)));
}
