import { ADMIN_ROLE_CODE } from './access-rules';
import { resolvePermissions } from './access.service';
import type { UserAccessSnapshot } from './ports/access.repository.port';

/**
 * Invariante de administración (PLAN-ADMIN D3), en funciones puras.
 *
 * Se evalúa sobre el acceso **efectivo** (roles vigentes + GRANT − DENY, con la
 * misma resolución que `resolvePermissions`), no sobre la mera asignación del
 * rol: un administrador con `DENY usuarios.editar` ya no puede administrar,
 * aunque conserve el rol.
 *
 * Quien aplica el invariante es `UsersService`, siempre dentro de
 * `AccessRepository.withAdminInvariantLock`: lee el acceso antes, escribe,
 * vuelve a leerlo y, si se viola, lanza y la transacción se deshace.
 */

/**
 * Permisos sin los cuales un administrador ya no puede devolver el acceso a
 * nadie (ni a sí mismo): editar usuarios (estado, roles, excepciones) y editar
 * roles (qué permisos trae cada uno). Si ningún administrador activo conserva
 * ambos, el sistema sólo se recupera tocando la base de datos.
 */
export const ADMIN_CRITICAL_PERMISSIONS: readonly string[] = ['usuarios.editar', 'roles.editar'];

/**
 * Permiso cuya pérdida por el propio actor es autobloqueo: sin él no puede
 * deshacer el cambio que acaba de hacer sobre sí mismo.
 */
export const SELF_ADMINISTRATION_PERMISSION = 'usuarios.editar';

/**
 * Administrador que sostiene el invariante: `ACTIVE`, con el rol
 * `administrador` vigente y con todos los permisos críticos efectivos.
 */
export function isAdminGuardian(snapshot: UserAccessSnapshot | null): boolean {
  if (!snapshot || snapshot.user.status !== 'ACTIVE') {
    return false;
  }
  if (!snapshot.roles.some((role) => role.code === ADMIN_ROLE_CODE)) {
    return false;
  }
  const permissions = resolvePermissions(snapshot);
  return ADMIN_CRITICAL_PERMISSIONS.every((code) => permissions.has(code));
}

/** El usuario puede seguir administrando usuarios: cuenta utilizable y permiso efectivo. */
export function canAdministerUsers(snapshot: UserAccessSnapshot | null): boolean {
  if (!snapshot || (snapshot.user.status !== 'ACTIVE' && snapshot.user.status !== 'INVITED')) {
    return false;
  }
  return resolvePermissions(snapshot).has(SELF_ADMINISTRATION_PERMISSION);
}

/** El actor, al cambiarse a sí mismo, pierde la capacidad de administrar usuarios. */
export function isSelfLockout(
  actorIsTarget: boolean,
  before: UserAccessSnapshot | null,
  after: UserAccessSnapshot | null,
): boolean {
  return actorIsTarget && canAdministerUsers(before) && !canAdministerUsers(after);
}

/**
 * El cambio retira a un administrador que sostenía el invariante. Sólo
 * entonces hay que comprobar que queda otro: un cambio sobre quien no lo
 * sostenía no puede reducir el número de los que sí.
 */
export function losesAdminGuardian(before: UserAccessSnapshot | null, after: UserAccessSnapshot | null): boolean {
  return isAdminGuardian(before) && !isAdminGuardian(after);
}
