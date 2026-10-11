import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import { auditContextFrom } from '@/modules/audit/audit.service';

import type { ActorContext } from './access-rules';
import { adminOnlyError, holdsAdministradorRole, isActingAdministrador } from './admin-only';
import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type DataScope,
  type MenuOptionRecord,
  type UserAccessSnapshot,
} from './ports/access.repository.port';

/** Módulo del menú con sus opciones ya filtradas y anidadas. */
export interface MenuModuleView {
  key: string;
  label: string;
  icon: string | null;
  order: number;
  /** Módulo de sistema: el menú lo muestra en la sección "Sistema". */
  isSystem: boolean;
  options: MenuOptionView[];
}

export interface MenuOptionView {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  path: string | null;
  order: number;
  requiredPermission: string | null;
  children: MenuOptionView[];
}

export interface EffectiveAccess {
  userId: string;
  displayName: string;
  email: string;
  roles: string[];
  permissions: string[];
  teams: { id: string; name: string }[];
  dataScope: DataScope;
}

/** Origen de un permiso (PLAN-ADMIN D5): qué roles lo traen y qué excepción directa lo toca. */
export interface PermissionOrigin {
  code: string;
  /** Concedido tras aplicar las denegaciones. */
  effective: boolean;
  /** Códigos de los roles vigentes que lo conceden. */
  roles: string[];
  grant: { reason: string; expiresAt: Date | null } | null;
  deny: { reason: string; expiresAt: Date | null } | null;
}

export interface EffectiveAccessWithOrigins extends EffectiveAccess {
  origins: PermissionOrigin[];
}

const SCOPE_RANK: Record<DataScope, number> = { OWN: 0, TEAM: 1, COUNTRY: 2, ORGANIZATION: 3 };

/**
 * Resuelve qué puede hacer y qué puede ver un usuario.
 *
 * Reglas de resolución, en este orden:
 *   1. Se unen los permisos de todos sus roles vigentes.
 *   2. Se añaden las concesiones directas (`GRANT`).
 *   3. Se quitan las denegaciones directas (`DENY`). **DENY siempre gana**, aunque
 *      el permiso venga de un rol: es la única forma de que una excepción de
 *      seguridad sea fiable.
 *   4. El alcance de datos es el más amplio entre sus roles.
 *
 * El menú se calcula con la misma lógica y además se filtra por el permiso que
 * cada opción exige: una opción asignada cuyo permiso no se tiene no aparece,
 * porque llevaría a una pantalla que el backend rechazaría.
 */
@Injectable()
export class AccessService {
  constructor(@Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository) {}

  /**
   * Traduce la identidad del proveedor al usuario local.
   *
   * Primero busca por el vínculo `UserIdentity` (proveedor + sujeto) y, si no
   * existe, por correo. Lo segundo cubre el primer acceso de una cuenta creada
   * por un administrador antes de que el usuario entrara nunca.
   *
   * NO crea usuarios: el aprovisionamiento automático desde el token es una
   * decisión de cada proyecto (a quién se deja entrar, con qué rol inicial) y
   * necesita su propio ADR.
   */
  async findUserIdForPrincipal(principal: AuthenticatedPrincipal): Promise<string | null> {
    const provider = principal.issuedBy === 'entra' ? 'ENTRA_ID' : 'LOCAL';
    const linked = await this.repository.findUserBySubject(provider, principal.subjectId);

    if (linked) {
      return linked.status === 'ACTIVE' || linked.status === 'INVITED' ? linked.id : null;
    }

    if (!principal.email) {
      return null;
    }

    const byEmail = await this.repository.findUserByEmail(principal.email);
    if (!byEmail) {
      return null;
    }

    // Una cuenta suspendida o bloqueada autentica pero no recibe permisos.
    return byEmail.status === 'ACTIVE' || byEmail.status === 'INVITED' ? byEmail.id : null;
  }

  /** Quién ejecuta una mutación de administración: usuario local + contexto de auditoría. */
  async resolveActor(request: AppRequest): Promise<ActorContext> {
    const userId = request.principal ? await this.findUserIdForPrincipal(request.principal) : null;
    return { userId, audit: auditContextFrom(request) };
  }

  /** ADR-020: el usuario local puede ejercer como administrador (ACTIVE + rol `administrador` vigente). */
  async isAdministrador(userId: string | null): Promise<boolean> {
    return userId ? isActingAdministrador(await this.repository.getUserAccessSnapshot(userId)) : false;
  }

  /**
   * ADR-020: único punto que exige ser administrador. Lanza `403 ADMIN_ONLY`.
   * `actorId` es el usuario local resuelto en la base (`resolveActor`), no el token.
   */
  async assertActorIsAdministrador(actorId: string | null): Promise<void> {
    if (!(await this.isAdministrador(actorId))) {
      throw adminOnlyError();
    }
  }

  /**
   * ADR-020: actuar sobre la cuenta de un administrador (editar, suspender,
   * reactivar, restablecer su contraseña) también es exclusivo del
   * administrador. Si el objetivo no existe no hace nada: el caso de uso
   * responde 404.
   */
  async assertActorMayActOn(actorId: string | null, targetUserId: string): Promise<void> {
    if (holdsAdministradorRole(await this.repository.getUserAccessSnapshot(targetUserId))) {
      await this.assertActorIsAdministrador(actorId);
    }
  }

  /** Permisos efectivos por identificador de usuario. */
  async getEffectivePermissions(userId: string): Promise<ReadonlySet<string>> {
    const snapshot = await this.repository.getUserAccessSnapshot(userId);
    return snapshot ? resolvePermissions(snapshot) : new Set<string>();
  }

  async getEffectiveAccess(userId: string): Promise<EffectiveAccess> {
    const snapshot = await this.repository.getUserAccessSnapshot(userId);

    if (!snapshot) {
      throw new NotFoundException('El usuario no existe');
    }

    return toEffectiveAccess(snapshot);
  }

  /** Acceso efectivo más el origen de cada permiso, para la pantalla de administración (D5). */
  async getEffectiveAccessWithOrigins(userId: string): Promise<EffectiveAccessWithOrigins> {
    const snapshot = await this.repository.getUserAccessSnapshot(userId);

    if (!snapshot) {
      throw new NotFoundException('El usuario no existe');
    }

    return { ...toEffectiveAccess(snapshot), origins: resolvePermissionOrigins(snapshot) };
  }

  /** Menú del usuario, listo para pintar: sólo lo que tiene concedido. */
  async getMenu(userId: string): Promise<MenuModuleView[]> {
    const snapshot = await this.repository.getUserAccessSnapshot(userId);

    if (!snapshot) {
      return [];
    }

    const permissions = resolvePermissions(snapshot);
    const allowedOptionIds = resolveMenuOptionIds(snapshot);
    const options = await this.repository.listMenuOptions();

    return buildMenu(options, allowedOptionIds, permissions);
  }
}

function toEffectiveAccess(snapshot: UserAccessSnapshot): EffectiveAccess {
  return {
    userId: snapshot.user.id,
    displayName: snapshot.user.displayName,
    email: snapshot.user.email,
    roles: snapshot.roles.map((role) => role.code),
    permissions: [...resolvePermissions(snapshot)].sort(),
    teams: snapshot.user.teams.map((team) => ({ id: team.id, name: team.name })),
    dataScope: widestScope(snapshot.roles.map((role) => role.dataScope)),
  };
}

/** Permisos efectivos a partir de una instantánea. Función pura: se prueba sin base de datos. */
export function resolvePermissions(snapshot: UserAccessSnapshot): ReadonlySet<string> {
  const granted = new Set<string>(snapshot.rolePermissionCodes);

  for (const assignment of snapshot.directPermissions) {
    if (assignment.effect === 'GRANT') {
      granted.add(assignment.code);
    }
  }

  // Las denegaciones se aplican al final: ganan siempre.
  for (const assignment of snapshot.directPermissions) {
    if (assignment.effect === 'DENY') {
      granted.delete(assignment.code);
    }
  }

  return granted;
}

/**
 * Origen de cada permiso que aparece en la instantánea, con o sin efecto.
 * Función pura: misma precedencia que `resolvePermissions` (DENY gana).
 */
export function resolvePermissionOrigins(snapshot: UserAccessSnapshot): PermissionOrigin[] {
  const effective = resolvePermissions(snapshot);
  const origins = new Map<string, PermissionOrigin>();
  const originFor = (code: string): PermissionOrigin => {
    let origin = origins.get(code);
    if (!origin) {
      origin = { code, effective: effective.has(code), roles: [], grant: null, deny: null };
      origins.set(code, origin);
    }
    return origin;
  };

  for (const role of snapshot.roles) {
    for (const code of role.permissionCodes) {
      originFor(code).roles.push(role.code);
    }
  }
  for (const assignment of snapshot.directPermissions) {
    const detail = { reason: assignment.reason, expiresAt: assignment.expiresAt };
    if (assignment.effect === 'GRANT') {
      originFor(assignment.code).grant = detail;
    } else {
      originFor(assignment.code).deny = detail;
    }
  }

  return [...origins.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Opciones de menú concedidas, con la misma precedencia que los permisos. */
export function resolveMenuOptionIds(snapshot: UserAccessSnapshot): ReadonlySet<string> {
  const allowed = new Set<string>(snapshot.roleMenuOptionIds);

  for (const assignment of snapshot.directMenuOptions) {
    if (assignment.effect === 'GRANT') {
      allowed.add(assignment.menuOptionId);
    }
  }

  for (const assignment of snapshot.directMenuOptions) {
    if (assignment.effect === 'DENY') {
      allowed.delete(assignment.menuOptionId);
    }
  }

  return allowed;
}

/**
 * Arma el árbol del menú.
 *
 * Un nodo agrupador que se queda sin hijos visibles se descarta: un grupo vacío
 * sólo informa al usuario de que existe algo que no puede usar.
 */
export function buildMenu(
  options: MenuOptionRecord[],
  allowedOptionIds: ReadonlySet<string>,
  permissions: ReadonlySet<string>,
): MenuModuleView[] {
  const isVisible = (option: MenuOptionRecord): boolean => {
    if (!option.isActive) {
      return false;
    }
    if (!option.isPublic && !allowedOptionIds.has(option.id)) {
      return false;
    }
    if (option.requiredPermissionCode && !permissions.has(option.requiredPermissionCode)) {
      return false;
    }
    return true;
  };

  const visible = options.filter(isVisible);
  const childrenByParent = new Map<string, MenuOptionRecord[]>();

  for (const option of visible) {
    if (!option.parentId) {
      continue;
    }
    const siblings = childrenByParent.get(option.parentId) ?? [];
    siblings.push(option);
    childrenByParent.set(option.parentId, siblings);
  }

  const toView = (option: MenuOptionRecord): MenuOptionView => ({
    id: option.id,
    key: option.key,
    label: option.label,
    icon: option.icon,
    path: option.path,
    order: option.sortOrder,
    requiredPermission: option.requiredPermissionCode,
    children: (childrenByParent.get(option.id) ?? []).sort(bySortOrder).map(toView),
  });

  const modules = new Map<string, MenuModuleView>();

  for (const option of visible) {
    if (option.parentId) {
      continue;
    }

    const view = toView(option);

    // Un grupo sin hijos visibles no se muestra.
    if (option.kind === 'GROUP' && view.children.length === 0) {
      continue;
    }

    const existing = modules.get(option.module.key);
    if (existing) {
      existing.options.push(view);
      continue;
    }

    modules.set(option.module.key, {
      key: option.module.key,
      label: option.module.name,
      icon: option.module.icon,
      order: option.module.sortOrder,
      isSystem: option.module.isSystem,
      options: [view],
    });
  }

  return [...modules.values()]
    .map((module) => ({ ...module, options: module.options.sort((a, b) => a.order - b.order) }))
    .sort((a, b) => a.order - b.order);
}

function bySortOrder(a: MenuOptionRecord, b: MenuOptionRecord): number {
  return a.sortOrder - b.sortOrder;
}

export function widestScope(scopes: DataScope[]): DataScope {
  return scopes.reduce<DataScope>((widest, scope) => (SCOPE_RANK[scope] > SCOPE_RANK[widest] ? scope : widest), 'OWN');
}
