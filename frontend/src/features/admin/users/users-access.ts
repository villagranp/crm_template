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

/**
 * Recursos de permisos del CRM (00 §5.2). Copia de experiencia de usuario de
 * `CRM_PERMISSION_RESOURCES` (`backend/src/modules/access/crm-profile.ts`):
 * sólo sirve para avisar antes de enviar; quien decide es el backend con
 * `422 CRM_PROFILE_INCOMPLETE` (07 D-07.3).
 */
const CRM_PERMISSION_RESOURCES: ReadonlySet<string> = new Set([
  'clientes',
  'contactos',
  'proyectos',
  'oportunidades',
  'productos',
  'forecast',
  'visitas',
  'actividades',
  'reportes',
  'importaciones',
  'metas',
]);

/** El rol concede algún permiso del CRM y no es `administrador` (07 D-07.3). */
export function isCommercialRole(role: Pick<RoleOption, 'code' | 'permissionCodes'>): boolean {
  if (role.code === ADMINISTRATOR_ROLE_CODE) {
    return false;
  }
  return role.permissionCodes.some((code) => CRM_PERMISSION_RESOURCES.has(code.split('.')[0] ?? ''));
}

/** Nota bajo el alta y en el panel de roles cuando algún rol elegido es comercial. */
export const CRM_PROFILE_HINT =
  'Los roles comerciales exigen código de colaborador y país: sin ellos el servidor rechazará la asignación.';

/** Explicación junto al país cuando quien mira no es administrador (07 RN-07.5). */
export const COUNTRY_ADMIN_ONLY_NOTE =
  'Sólo un administrador puede asignar o cambiar el país: con alcance «Su país» cambia lo que el usuario ve (ADR-020).';

/** Explicación de los equipos cuando quien mira no es administrador (07 RN-07.10). */
export const TEAMS_ADMIN_ONLY_NOTE =
  'Sólo un administrador puede asignar equipos: con alcance «Su equipo» cambia lo que el usuario ve (ADR-020).';
