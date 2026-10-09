import { AccessDeniedError } from '@/common/errors/application-error';

import { ACCESS_ERROR_CODES, ADMIN_ROLE_CODE } from './access-rules';
import type { UserAccessSnapshot } from './ports/access.repository.port';

/**
 * ADR-020: la asignación de accesos es exclusiva del administrador.
 *
 * Funciones puras; quien las aplica es `AccessService` (que lee los roles de
 * la cuenta local en la base de datos, nunca los del token: ADR-018 §5).
 */

/** Rol que habilita a cambiar qué acceso tiene alguien (ADR-020). */
export const ADMINISTRATOR_ROLE_CODE = ADMIN_ROLE_CODE;

/**
 * El actor puede ejercer como administrador: cuenta `ACTIVE` con el rol
 * `administrador` vigente. La instantánea ya trae sólo asignaciones sin
 * caducar de roles activos y no borrados.
 */
export function isActingAdministrador(snapshot: UserAccessSnapshot | null): boolean {
  return snapshot?.user.status === 'ACTIVE' && holdsAdministradorRole(snapshot);
}

/**
 * El usuario tiene el rol `administrador` vigente, en cualquier estado: un
 * administrador suspendido sigue siendo administrador a efectos de quién puede
 * reactivarlo o tocar su cuenta.
 */
export function holdsAdministradorRole(snapshot: UserAccessSnapshot | null): boolean {
  return snapshot?.roles.some((role) => role.code === ADMINISTRATOR_ROLE_CODE) ?? false;
}

/**
 * Alta por un no administrador (ADR-020): sólo roles que no conceden ningún
 * permiso. `rolesGrantingPermissions` son, de los pedidos, los que conceden
 * alguno.
 */
export function assertAssignableByNonAdministrador(rolesGrantingPermissions: readonly string[]): void {
  if (rolesGrantingPermissions.length > 0) {
    throw adminOnlyError('Only an administrator can assign roles that grant permissions');
  }
}

/** Texto común de Swagger para la respuesta 403 de las operaciones de ADR-020. */
export const ADMIN_ONLY_FORBIDDEN_DOC =
  'PERMISSION_DENIED: falta el permiso del endpoint · ADMIN_ONLY: la operación cambia accesos y es exclusiva de un usuario con el rol `administrador` vigente (ADR-020)';

export function adminOnlyError(message = 'Only an administrator can change access'): AccessDeniedError {
  return new AccessDeniedError(ACCESS_ERROR_CODES.adminOnly, message);
}
