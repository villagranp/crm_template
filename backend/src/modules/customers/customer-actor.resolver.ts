import { Injectable } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';
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
    const [direct, inherited] = await Promise.all([
      this.scopes.resolve(actor.userId, CUSTOMER_PERMISSIONS.view),
      this.scopes.resolve(actor.userId, PROJECT_VIEW_PERMISSION),
    ]);
    return { direct, inherited };
  }

  /**
   * Responsables que el actor puede asignar (D-02.2): sin `clientes.administrar`,
   * solo él mismo; con él, los usuarios de su alcance de `clientes.administrar`
   * (TEAM: miembros y responsables con subequipos; COUNTRY: su país; ORGANIZATION: todos).
   */
  async assignableSalesOwners(actor: CustomerActor): Promise<SalesOwnerAssignableSet> {
    if (!actor.permissions.has(CUSTOMER_PERMISSIONS.administer)) {
      return { kind: 'FILTERED', userIds: actor.userId ? [actor.userId] : [], countryIds: [] };
    }
    const scope = await this.scopes.resolve(actor.userId, CUSTOMER_PERMISSIONS.administer);
    return scope.kind === 'ALL'
      ? { kind: 'ALL' }
      : { kind: 'FILTERED', userIds: [...scope.ownerIds], countryIds: [...scope.countryIds] };
  }
}
