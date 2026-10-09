import { ADMINISTRATOR_ROLE_CODE } from '@/hooks/use-permission';

import type { RoleOption, UserDetail } from './users.api';

/**
 * Reglas de ADR-020 que la pantalla de usuarios necesita para no ofrecer
 * acciones que el backend rechazará con `403 ADMIN_ONLY`. Son sólo de
 * experiencia de usuario: el backend vuelve a aplicarlas y es la autoridad.
 */

/** Nota cuando quien mira no es administrador y el usuario mostrado sí lo es. */
export const ADMIN_TARGET_NOTE = 'Sólo un administrador puede modificar a otro administrador (ADR-020).';

/** `true` si el usuario tiene el rol `administrador` vigente (sin caducar). */
export function holdsAdministrador(user: Pick<UserDetail, 'roles'>, now: Date = new Date()): boolean {
  return user.roles.some(
    (role) =>
      role.code === ADMINISTRATOR_ROLE_CODE && (role.expiresAt === null || new Date(role.expiresAt).getTime() > now.getTime()),
  );
}

/**
 * Roles que un no administrador puede dar en el alta: los que no conceden
 * ningún permiso (hoy, `usuario`). Se decide por `permissionCodes`, que viene
 * en cada elemento de `GET /roles`.
 */
export function grantsNoPermissions(role: Pick<RoleOption, 'permissionCodes'>): boolean {
  return role.permissionCodes.length === 0;
}
