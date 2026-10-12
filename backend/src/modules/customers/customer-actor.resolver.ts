import { Injectable } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';
import { noVisibility, type VisibilityScope } from '@/modules/access/visibility-scope';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import type { AuditContext } from '@/modules/audit/audit.service';

import { CUSTOMER_PERMISSIONS, type CustomerPolicyActor } from './customer-access-policy';
import type { CustomerVisibility, SalesOwnerAssignableSet } from './ports/customers.repository.port';

/** Permiso cuyo alcance define la herencia de visibilidad por proyectos (DM-13). */
export const PROJECT_VIEW_PERMISSION = 'proyectos.ver';

/**
 * Quién opera sobre clientes: usuario local (resuelto en la base, nunca el
 * token), sus permisos efectivos y el contexto de auditoría.
 */
export interface CustomerActor extends CustomerPolicyActor {
  readonly audit: AuditContext;
}

/**
 * Alcances que deciden qué puede hacer el actor sobre un cliente (02 H.2,
 * "Precisiones de implementación"): ver (con herencia), y el alcance **propio**
 * de cada permiso que permite operar sobre clientes ajenos. Un permiso que el
 * actor no tiene da un alcance vacío (`NONE`).
 */
export interface CustomerAccessScopes {
  readonly visibility: CustomerVisibility;
  /** Alcance de `clientes.administrar`: editar ajenos, campos reservados, contactos de ajenos. */
  readonly administer: VisibilityScope;
  /** Alcance de `clientes.eliminar`: eliminar y restaurar. */
  readonly delete: VisibilityScope;
}

/**
 * Resuelve el actor de una petición y los alcances que necesita el módulo
 * (02 H.1, D-02.2). Sin caché: un cambio de rol, equipo o país rige en la
 * siguiente petición (ADR-020).
 *
 * Exportado para los módulos que usan `CustomerReferenceGuard` (Proyectos,
 * Actividad) y para la importación (Módulo 6).
 */
@Injectable()
export class CustomerActorResolver {
  constructor(
    private readonly access: AccessService,
    private readonly scopes: VisibilityScopeResolver,
  ) {}

  async fromRequest(request: AppRequest): Promise<CustomerActor> {
    const { userId, audit } = await this.access.resolveActor(request);
    const permissions = userId ? await this.access.getEffectivePermissions(userId) : new Set<string>();
    return { userId, permissions, audit };
  }

  /** Visibilidad de clientes: alcance de `clientes.ver` + herencia con el alcance de `proyectos.ver` (DM-13). */
  async visibility(actor: CustomerActor): Promise<CustomerVisibility> {
    const scopes = await this.scopes.resolveMany(actor.userId, [CUSTOMER_PERMISSIONS.view, PROJECT_VIEW_PERMISSION]);
    return {
      direct: scopes.get(CUSTOMER_PERMISSIONS.view) ?? noVisibility(actor.userId),
      inherited: scopes.get(PROJECT_VIEW_PERMISSION) ?? noVisibility(actor.userId),
    };
  }

  /**
   * Visibilidad más los alcances de `clientes.administrar` y `clientes.eliminar`,
   * resueltos de una vez (una lectura del perfil de acceso). Los permisos que el
   * actor no tiene ni se consultan.
   */
  async accessScopes(actor: CustomerActor): Promise<CustomerAccessScopes> {
    const operational = [CUSTOMER_PERMISSIONS.administer, CUSTOMER_PERMISSIONS.delete].filter((permission) =>
      actor.permissions.has(permission),
    );
    const scopes = await this.scopes.resolveMany(actor.userId, [CUSTOMER_PERMISSIONS.view, PROJECT_VIEW_PERMISSION, ...operational]);
    const scopeOf = (permission: string): VisibilityScope => scopes.get(permission) ?? noVisibility(actor.userId);
    return {
      visibility: { direct: scopeOf(CUSTOMER_PERMISSIONS.view), inherited: scopeOf(PROJECT_VIEW_PERMISSION) },
      administer: scopeOf(CUSTOMER_PERMISSIONS.administer),
      delete: scopeOf(CUSTOMER_PERMISSIONS.delete),
    };
  }

  /**
   * Responsables que el actor puede asignar (D-02.2): sin `clientes.administrar`,
   * solo él mismo; con él, los usuarios de su alcance de `clientes.administrar`
   * (TEAM: miembros y responsables con subequipos; COUNTRY: su país; ORGANIZATION: todos).
   */
  async assignableSalesOwners(actor: CustomerActor): Promise<SalesOwnerAssignableSet> {
    if (!actor.permissions.has(CUSTOMER_PERMISSIONS.administer)) {
      return assignableFromScope(actor, null);
    }
    return assignableFromScope(actor, await this.scopes.resolve(actor.userId, CUSTOMER_PERMISSIONS.administer));
  }
}

/**
 * Conjunto asignable a partir del alcance de `clientes.administrar` ya resuelto
 * (`null` o actor sin el permiso → solo el propio actor), D-02.2.
 */
export function assignableFromScope(actor: CustomerActor, administerScope: VisibilityScope | null): SalesOwnerAssignableSet {
  if (!administerScope || !actor.permissions.has(CUSTOMER_PERMISSIONS.administer)) {
    return { kind: 'FILTERED', userIds: actor.userId ? [actor.userId] : [], countryIds: [] };
  }
  return administerScope.kind === 'ALL'
    ? { kind: 'ALL' }
    : { kind: 'FILTERED', userIds: [...administerScope.ownerIds], countryIds: [...administerScope.countryIds] };
}
