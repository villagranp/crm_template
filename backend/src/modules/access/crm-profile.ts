import { BusinessRuleViolationError } from '@/common/errors/application-error';

import { ADMIN_ROLE_CODE } from './access-rules';

/**
 * Perfil comercial completo (07 D-07.3, refina DM-30). Funciones puras: quien
 * las aplica es `UsersService`.
 *
 * Un **rol comercial** es un rol vigente que concede algún permiso de los
 * recursos del CRM (00 §5.2), excepto `administrador` (que los concede todos
 * por administrar, no por vender). Todo usuario con un rol comercial necesita
 * código de colaborador y país: sin país, el alcance `COUNTRY` no sabe qué
 * mostrarle, y sin código, la carga masiva (Módulo 6) no lo identifica.
 *
 * Se comprueba al asignar roles (`PUT /users/{id}/roles`), en el alta con roles
 * y al editar (no se pueden vaciar). No se exige a los usuarios existentes que
 * no tocan su perfil: un dato que falta no bloquea editar el teléfono.
 */

/** Código del error 422 (07 F.8). */
export const CRM_PROFILE_INCOMPLETE = 'CRM_PROFILE_INCOMPLETE';

/**
 * Recursos de permisos del CRM (00 §5.2). Un permiso `recurso.accion` cuyo
 * recurso está aquí hace comercial al rol que lo concede. Una prueba comprueba
 * que coincide con el catálogo sembrado (`prisma/seed/crm-access.ts`).
 */
export const CRM_PERMISSION_RESOURCES: ReadonlySet<string> = new Set([
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

/** Campos del perfil comercial, con el nombre que usa el contrato de la API. */
export type CrmProfileField = 'employeeCode' | 'countryId';

/** Rol con los permisos que concede (sólo roles vigentes: activos, no borrados y sin caducar). */
export interface RoleGrant {
  code: string;
  permissionCodes: readonly string[];
}

export interface CrmProfile {
  employeeCode: string | null;
  countryId: string | null;
}

/** El rol concede algún permiso del CRM y no es `administrador`. */
export function isCommercialRole(role: RoleGrant): boolean {
  if (role.code === ADMIN_ROLE_CODE) {
    return false;
  }
  return role.permissionCodes.some((code) => CRM_PERMISSION_RESOURCES.has(resourceOf(code)));
}

/** Algún rol de la lista es comercial. */
export function requiresCrmProfile(roles: readonly RoleGrant[]): boolean {
  return roles.some(isCommercialRole);
}

/** Campos que le faltan al perfil, en orden estable. */
export function missingCrmProfileFields(profile: CrmProfile): CrmProfileField[] {
  const missing: CrmProfileField[] = [];
  if (!profile.employeeCode) {
    missing.push('employeeCode');
  }
  if (!profile.countryId) {
    missing.push('countryId');
  }
  return missing;
}

/**
 * `422 CRM_PROFILE_INCOMPLETE` si algún rol es comercial y al perfil le falta
 * código o país; `details[]` lleva un `{ field, issue: "required" }` por campo.
 */
export function assertCrmProfileComplete(roles: readonly RoleGrant[], profile: CrmProfile): void {
  if (!requiresCrmProfile(roles)) {
    return;
  }
  const missing = missingCrmProfileFields(profile);
  if (missing.length > 0) {
    throw new BusinessRuleViolationError(
      CRM_PROFILE_INCOMPLETE,
      'A user with a commercial role needs an employee code and a country',
      missing.map((field) => ({ field, issue: 'required' })),
    );
  }
}

function resourceOf(permissionCode: string): string {
  const separator = permissionCode.indexOf('.');
  return separator === -1 ? permissionCode : permissionCode.slice(0, separator);
}
