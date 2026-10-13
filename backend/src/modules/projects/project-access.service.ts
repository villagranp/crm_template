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
   * Dentro de la transacción de una escritura: toma la fila del proyecto con `FOR UPDATE`
   * y **vuelve a decidir** visibilidad (`404`) y edición (`403`) sobre el registro
   * bloqueado, no sobre la lectura previa (03 "Precisiones", Revisión E5, M4): si el asesor
   * cambió entre tanto, quien dejó de ser dueño y no administra recibe `403`. Usa los
   * alcances ya resueltos (`scopes`) y solo la conexión de `tx` (AGENTS §9.12).
   */
  async lockEditable(actor: ProjectActor, projectId: string, scopes: ProjectAccessScopes, tx: TransactionContext): Promise<VisibleProject> {
    if (!(await this.projects.lockProject(projectId, 'UPDATE', tx))) throw projectNotFound(projectId);
    const visible = await this.findVisible(actor, projectId, { scopes, tx });
    if (!canEditProject(actor, visible.subject)) {
      throw new PermissionDeniedError(missingEditPermission(actor, visible.subject));
    }
    return visible;
  }

  /**
   * ¿`userId` es asignable como asesor por el actor? (RN-03.6, D-03.16): en su conjunto
   * asignable, `ACTIVE` y con `proyectos.ver`. Lectura fuera de transacción.
   */
  async isAssignableOwner(actor: ProjectActor, userId: string, scopes: ProjectAccessScopes): Promise<boolean> {
    if (actor.userId !== null && actor.userId.toLowerCase() === userId.toLowerCase()) return true;
    return (await this.projects.findEligibleOwner(userId, this.assignableOwners(actor, scopes), PROJECT_PERMISSIONS.view)) !== null;
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
