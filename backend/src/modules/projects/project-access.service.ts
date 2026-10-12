import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '@/common/errors/application-error';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { noVisibility, type VisibilityScope } from '@/modules/access/visibility-scope';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';

import {
  canEditProject,
  missingEditPermission,
  type ProjectAccessScopes,
  type ProjectPolicySubject,
  projectPolicySubject,
} from './project-access-policy';
import { PROJECT_PERMISSIONS, RELATED_PERMISSIONS } from './project-constants';
import { projectNotFound } from './project-errors';
import { type OwnerAssignableSet, PROJECTS_REPOSITORY, type ProjectRecord, type ProjectsRepository } from './ports/projects.repository.port';

/** Quién opera: usuario local, permisos efectivos y contexto de auditoría (mismo actor que Clientes). */
export type ProjectActor = CustomerActor;

/** Proyecto que el actor ve, con los alcances y el sujeto de la política (los mismos para hacer cumplir y para `capabilities`). */
export interface VisibleProject {
  readonly record: ProjectRecord;
  readonly scopes: ProjectAccessScopes;
  readonly subject: ProjectPolicySubject;
}

/**
 * Punto único que decide si un actor ve un proyecto (03 H.1, AC-03.12): fuera del
 * alcance de `proyectos.ver`, inexistente o eliminado → el mismo `404`. Resuelve de
 * una vez los alcances de cada permiso operativo (AGENTS §9.4): ver, administrar,
 * eliminar y los de oportunidades y forecast que deciden `capabilities`.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    private readonly scopeResolver: VisibilityScopeResolver,
  ) {}

  /** Alcances del actor (una lectura del perfil de acceso). Los permisos que no tiene ni se consultan. */
  async scopes(actor: ProjectActor): Promise<ProjectAccessScopes> {
    const operational = [
      PROJECT_PERMISSIONS.administer,
      PROJECT_PERMISSIONS.delete,
      RELATED_PERMISSIONS.opportunityAdminister,
      RELATED_PERMISSIONS.forecastAdminister,
    ].filter((permission) => actor.permissions.has(permission));
    const resolved = await this.scopeResolver.resolveMany(actor.userId, [PROJECT_PERMISSIONS.view, ...operational]);
    const scopeOf = (permission: string): VisibilityScope => resolved.get(permission) ?? noVisibility(actor.userId);
    return {
      view: scopeOf(PROJECT_PERMISSIONS.view),
      administer: scopeOf(PROJECT_PERMISSIONS.administer),
      delete: scopeOf(PROJECT_PERMISSIONS.delete),
      opportunityAdminister: scopeOf(RELATED_PERMISSIONS.opportunityAdminister),
      forecastAdminister: scopeOf(RELATED_PERMISSIONS.forecastAdminister),
    };
  }

  /** Proyecto visible o `404 RESOURCE_NOT_FOUND`. */
  async findVisible(
    actor: ProjectActor,
    projectId: string,
    options: { readonly scopes?: ProjectAccessScopes; readonly tx?: TransactionContext } = {},
  ): Promise<VisibleProject> {
    const scopes = options.scopes ?? (await this.scopes(actor));
    const record = await this.projects.findById(projectId, scopes.view, options.tx);
    if (!record) throw projectNotFound(projectId);
    return toVisibleProject(record, scopes);
  }

  /** Visible y editable por el actor (RN-03.62, H.1): `404` fuera del alcance, `403` sin la política de edición. */
  async findEditable(actor: ProjectActor, projectId: string): Promise<VisibleProject> {
    const visible = await this.findVisible(actor, projectId);
    if (!canEditProject(actor, visible.subject)) {
      throw new PermissionDeniedError(missingEditPermission(actor, visible.subject));
    }
    return visible;
  }

  /**
   * Usuarios asignables como asesor (RN-03.6, D-03.16): sin `proyectos.administrar`,
   * solo el propio actor; con él, los de su alcance (TEAM: miembros y responsables con
   * subequipos; COUNTRY: su país; ORGANIZATION: todos).
   */
  assignableOwners(actor: ProjectActor, scopes: ProjectAccessScopes): OwnerAssignableSet {
    const self: OwnerAssignableSet = { kind: 'FILTERED', userIds: actor.userId ? [actor.userId] : [], countryIds: [] };
    if (!actor.permissions.has(PROJECT_PERMISSIONS.administer)) return self;
    const scope = scopes.administer;
    return scope.kind === 'ALL'
      ? { kind: 'ALL' }
      : { kind: 'FILTERED', userIds: [...new Set([...(actor.userId ? [actor.userId] : []), ...scope.ownerIds])], countryIds: [...scope.countryIds] };
  }
}

export function toVisibleProject(record: ProjectRecord, scopes: ProjectAccessScopes): VisibleProject {
  return { record, scopes, subject: projectPolicySubject({ ownerId: record.owner.id, countryId: record.country.id }, scopes) };
}
