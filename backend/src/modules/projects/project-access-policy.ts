import { isWithinScope, type VisibilityScope } from '@/modules/access/visibility-scope';

import { PROJECT_PERMISSIONS, RELATED_PERMISSIONS } from './project-constants';

/**
 * Política de acceso a proyectos (03 H.1, H.2, RN-03.6, RN-03.19, DM-34). Pura:
 * decide qué puede hacer un actor sobre un proyecto que **ya sabe que ve** (la
 * visibilidad, que da `404`, la aplica el repositorio con el alcance de
 * `proyectos.ver`). La misma política calcula las `capabilities` que devuelve la API
 * y hace cumplir cada mutación.
 *
 * Cada operación exige que el proyecto caiga en el alcance **del permiso que la
 * concede** (AGENTS §9.4): con roles combinados, un rol de lectura con alcance amplio
 * no amplía lo que otro rol deja modificar.
 *
 * - Editar (datos, clasificación, fase, productos, adjuntos): `proyectos.editar` y
 *   (propio, o ajeno dentro del alcance de `proyectos.administrar`). `administrar` sin
 *   `editar` no edita (el endpoint exige `editar`).
 * - Campos reservados (asesor, código): editar + `administrar` dentro de su alcance.
 * - Eliminar: `proyectos.eliminar` dentro de su alcance y (propio, o `administrar`).
 * - Duplicar: `proyectos.crear` (el origen visible ya lo garantiza la búsqueda).
 * - Crear oportunidad: `oportunidades.crear` y (propio, o `oportunidades.administrar` en su alcance).
 * - Editar forecast: `forecast.editar` y (propio, o `forecast.administrar` en su alcance).
 */

export interface ProjectPolicyActor {
  /** Usuario local; `null` = sin cuenta local (no es dueño de nada). */
  readonly userId: string | null;
  readonly permissions: ReadonlySet<string>;
}

/** Alcances del actor por permiso operativo; `NONE` si no tiene el permiso. */
export interface ProjectAccessScopes {
  readonly view: VisibilityScope;
  readonly administer: VisibilityScope;
  readonly delete: VisibilityScope;
  readonly opportunityAdminister: VisibilityScope;
  readonly forecastAdminister: VisibilityScope;
}

export interface ProjectPolicySubject {
  readonly ownerId: string;
  readonly inAdministerScope: boolean;
  readonly inDeleteScope: boolean;
  readonly inOpportunityAdministerScope: boolean;
  readonly inForecastAdministerScope: boolean;
}

export interface ProjectCapabilities {
  readonly canEdit: boolean;
  readonly canAdminister: boolean;
  readonly canDelete: boolean;
  readonly canDuplicate: boolean;
  readonly canCreateOpportunity: boolean;
  readonly canEditForecast: boolean;
}

/** Sujeto de la política: pertenencia del proyecto (dueño y país) al alcance de cada permiso. */
export function projectPolicySubject(
  project: { readonly ownerId: string; readonly countryId: string },
  scopes: ProjectAccessScopes,
): ProjectPolicySubject {
  const ref = { ownerId: project.ownerId, countryId: project.countryId };
  return {
    ownerId: project.ownerId,
    inAdministerScope: isWithinScope(scopes.administer, ref),
    inDeleteScope: isWithinScope(scopes.delete, ref),
    inOpportunityAdministerScope: isWithinScope(scopes.opportunityAdminister, ref),
    inForecastAdministerScope: isWithinScope(scopes.forecastAdminister, ref),
  };
}

function isOwner(actor: ProjectPolicyActor, project: ProjectPolicySubject): boolean {
  return actor.userId !== null && project.ownerId === actor.userId;
}

function administers(actor: ProjectPolicyActor, project: ProjectPolicySubject): boolean {
  return actor.permissions.has(PROJECT_PERMISSIONS.administer) && project.inAdministerScope;
}

export function canEditProject(actor: ProjectPolicyActor, project: ProjectPolicySubject): boolean {
  return actor.permissions.has(PROJECT_PERMISSIONS.edit) && (isOwner(actor, project) || administers(actor, project));
}

/** Editar además los campos reservados (asesor, código; DM-17, RN-03.6). */
export function canAdministerProject(actor: ProjectPolicyActor, project: ProjectPolicySubject): boolean {
  return canEditProject(actor, project) && administers(actor, project);
}

/** Permiso que falta para editar, para el `403 PERMISSION_DENIED`. */
export function missingEditPermission(actor: ProjectPolicyActor, project: ProjectPolicySubject): string {
  if (!actor.permissions.has(PROJECT_PERMISSIONS.edit) || isOwner(actor, project)) return PROJECT_PERMISSIONS.edit;
  return PROJECT_PERMISSIONS.administer;
}

export function canDeleteProject(actor: ProjectPolicyActor, project: ProjectPolicySubject): boolean {
  return (
    actor.permissions.has(PROJECT_PERMISSIONS.delete) && project.inDeleteScope && (isOwner(actor, project) || administers(actor, project))
  );
}

export function canDuplicateProject(actor: ProjectPolicyActor): boolean {
  return actor.permissions.has(PROJECT_PERMISSIONS.create);
}

export function canCreateOpportunity(actor: ProjectPolicyActor, project: ProjectPolicySubject): boolean {
  if (!actor.permissions.has(RELATED_PERMISSIONS.opportunityCreate)) return false;
  return isOwner(actor, project) || (actor.permissions.has(RELATED_PERMISSIONS.opportunityAdminister) && project.inOpportunityAdministerScope);
}

export function canEditForecast(actor: ProjectPolicyActor, project: ProjectPolicySubject): boolean {
  if (!actor.permissions.has(RELATED_PERMISSIONS.forecastEdit)) return false;
  return isOwner(actor, project) || (actor.permissions.has(RELATED_PERMISSIONS.forecastAdminister) && project.inForecastAdministerScope);
}

export function projectCapabilities(actor: ProjectPolicyActor, project: ProjectPolicySubject): ProjectCapabilities {
  return {
    canEdit: canEditProject(actor, project),
    canAdminister: canAdministerProject(actor, project),
    canDelete: canDeleteProject(actor, project),
    canDuplicate: canDuplicateProject(actor),
    canCreateOpportunity: canCreateOpportunity(actor, project),
    canEditForecast: canEditForecast(actor, project),
  };
}

/**
 * Asesor indicado en un alta o duplicado (RN-03.6): sin `proyectos.administrar`, solo
 * el propio actor. La elegibilidad (ACTIVE, rol del CRM, alcance) se comprueba aparte.
 */
export function canAssignOwner(actor: ProjectPolicyActor, ownerId: string): boolean {
  return actor.permissions.has(PROJECT_PERMISSIONS.administer) || (actor.userId !== null && actor.userId === ownerId);
}
