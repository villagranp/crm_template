import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '@/common/errors/application-error';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { noVisibility, type VisibilityScope } from '@/modules/access/visibility-scope';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import { isClosedStage } from '@/modules/commercial-metrics/metric-definitions';
import { type OwnerAssignableSet, PROJECTS_REPOSITORY, type ProjectRecord, type ProjectsRepository } from '@/modules/projects/ports/projects.repository.port';
import { projectNotFound } from '@/modules/projects/project-errors';

import {
  canEditOpportunity,
  missingEditPermission,
  type OpportunityAccessScopes,
  type OpportunityPolicySubject,
  opportunityPolicySubject,
} from './opportunity-access-policy';
import { OPPORTUNITY_PERMISSIONS } from './opportunity-constants';
import { opportunityNotFound } from './opportunity-errors';
import { OPPORTUNITIES_REPOSITORY, type OpportunitiesRepository, type OpportunityRecord } from './ports/opportunities.repository.port';

/** Quién opera: usuario local, permisos efectivos y contexto de auditoría (mismo actor que Clientes y Proyectos). */
export type OpportunityActor = CustomerActor;

export interface VisibleOpportunity {
  readonly record: OpportunityRecord;
  readonly scopes: OpportunityAccessScopes;
  readonly subject: OpportunityPolicySubject;
}

/**
 * Punto único que decide si un actor ve una oportunidad o el proyecto en el que opera
 * (03 H.1, DM-13): fuera del alcance de `oportunidades.ver`, inexistente o eliminada →
 * el mismo `404`. Resuelve de una vez los alcances de cada permiso operativo
 * (`ver`, `administrar`, `eliminar`; AGENTS §9.4).
 */
@Injectable()
export class OpportunityAccessService {
  constructor(
    @Inject(OPPORTUNITIES_REPOSITORY) private readonly opportunities: OpportunitiesRepository,
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    private readonly scopeResolver: VisibilityScopeResolver,
  ) {}

  async scopes(actor: OpportunityActor): Promise<OpportunityAccessScopes> {
    const operational = [OPPORTUNITY_PERMISSIONS.administer, OPPORTUNITY_PERMISSIONS.delete].filter((permission) => actor.permissions.has(permission));
    const resolved = await this.scopeResolver.resolveMany(actor.userId, [OPPORTUNITY_PERMISSIONS.view, ...operational]);
    const scopeOf = (permission: string): VisibilityScope => resolved.get(permission) ?? noVisibility(actor.userId);
    return {
      view: scopeOf(OPPORTUNITY_PERMISSIONS.view),
      administer: scopeOf(OPPORTUNITY_PERMISSIONS.administer),
      delete: scopeOf(OPPORTUNITY_PERMISSIONS.delete),
    };
  }

  /** Oportunidad visible o `404 RESOURCE_NOT_FOUND`. */
  async findVisible(
    actor: OpportunityActor,
    opportunityId: string,
    options: { readonly scopes?: OpportunityAccessScopes; readonly tx?: TransactionContext } = {},
  ): Promise<VisibleOpportunity> {
    const scopes = options.scopes ?? (await this.scopes(actor));
    const record = await this.opportunities.findById(opportunityId, scopes.view, options.tx);
    if (!record) throw opportunityNotFound(opportunityId);
    return toVisibleOpportunity(record, scopes);
  }

  /** Visible y editable (H.1): `404` fuera del alcance, `403` sin la política de edición. */
  async findEditable(actor: OpportunityActor, opportunityId: string): Promise<VisibleOpportunity> {
    const visible = await this.findVisible(actor, opportunityId);
    if (!canEditOpportunity(actor, visible.subject)) {
      throw new PermissionDeniedError(missingEditPermission(actor, visible.subject));
    }
    return visible;
  }

  /**
   * Proyecto en el que se opera con oportunidades (lista del proyecto, alta, opciones de
   * formulario): visible con el alcance de `oportunidades.ver` (asesor o país del
   * proyecto). Fuera de él, eliminado o inexistente → `404` (no revela su existencia).
   */
  async findProject(actor: OpportunityActor, projectId: string, scopes?: OpportunityAccessScopes): Promise<ProjectRecord> {
    const resolved = scopes ?? (await this.scopes(actor));
    const project = await this.projects.findById(projectId, resolved.view);
    if (!project) throw projectNotFound(projectId);
    return project;
  }

  /**
   * Usuarios asignables como asesor de una oportunidad (RN-03.38): sin
   * `oportunidades.administrar`, solo el propio actor; con él, los de su alcance.
   */
  assignableOwners(actor: OpportunityActor, scopes: OpportunityAccessScopes): OwnerAssignableSet {
    const self: OwnerAssignableSet = { kind: 'FILTERED', userIds: actor.userId ? [actor.userId] : [], countryIds: [] };
    if (!actor.permissions.has(OPPORTUNITY_PERMISSIONS.administer)) return self;
    const scope = scopes.administer;
    return scope.kind === 'ALL'
      ? { kind: 'ALL' }
      : { kind: 'FILTERED', userIds: [...new Set([...(actor.userId ? [actor.userId] : []), ...scope.ownerIds])], countryIds: [...scope.countryIds] };
  }
}

export function toVisibleOpportunity(record: OpportunityRecord, scopes: OpportunityAccessScopes): VisibleOpportunity {
  return {
    record,
    scopes,
    subject: opportunityPolicySubject({ ownerId: record.owner.id, project: record.project, isClosed: isClosedStage(record.stage) }, scopes),
  };
}
