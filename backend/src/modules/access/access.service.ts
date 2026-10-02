import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

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

const SCOPE_RANK: Record<DataScope, number> = { OWN: 0, TEAM: 1, TERRITORY: 2, ORGANIZATION: 3 };

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
