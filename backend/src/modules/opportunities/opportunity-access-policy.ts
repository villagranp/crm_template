import { isWithinScope, type VisibilityScope } from '@/modules/access/visibility-scope';
import { canCreateOpportunity as projectAllowsOpportunityCreation } from '@/modules/projects/project-access-policy';

import { OPPORTUNITY_PERMISSIONS } from './opportunity-constants';

/**
 * Política de acceso a oportunidades (03 H.1, H.2, DM-13, DM-34). Pura: decide qué
 * puede hacer un actor sobre una oportunidad que **ya sabe que ve** (la visibilidad,
 * que da `404`, la aplica el repositorio con el alcance de `oportunidades.ver`). La
 * misma política calcula las `capabilities` y hace cumplir cada mutación.
 *
 * Cada operación exige que la oportunidad caiga en el alcance **del permiso que la
 * concede** (AGENTS §9.4). Una oportunidad cae en un alcance si su asesor está en él
 * (`owner_id`) o si su proyecto está en él (asesor o país del proyecto): herencia de
 * 00 §4.2 (DM-13).
 *
 * - Editar datos / pasar a etapa abierta: `editar` y (propia, o `administrar` en su alcance).
 * - Cerrar (registrar o modificar el resultado): además `cerrar`.
 * - Reabrir (cerrada → abierta): `editar` + `administrar` en su alcance (RN-03.42).
 * - Eliminar: `eliminar` en su alcance, y solo abiertas (las cerradas → `409`, RN-03.45).
 * - Reasignar el asesor: `administrar` en su alcance (RN-03.38).
 */

export interface OpportunityPolicyActor {
  /** Usuario local; `null` = sin cuenta local (no es dueño de nada). */
  readonly userId: string | null;
  readonly permissions: ReadonlySet<string>;
}

/** Alcances del actor por permiso de oportunidades; `NONE` si no tiene el permiso. */
export interface OpportunityAccessScopes {
  readonly view: VisibilityScope;
  readonly administer: VisibilityScope;
  readonly delete: VisibilityScope;
}

/** Pertenencia de la oportunidad (y de su proyecto) a los alcances de cada permiso. */
export interface OpportunityPolicySubject {
  readonly ownerId: string;
  readonly isClosed: boolean;
  readonly inAdministerScope: boolean;
  readonly inDeleteScope: boolean;
}

export interface OpportunityCapabilities {
  readonly canEdit: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
  readonly canDelete: boolean;
}

export interface OpportunityScopeRef {
  readonly ownerId: string;
  readonly project: { readonly ownerId: string; readonly countryId: string };
}

/** 00 §4.2: dueño de la oportunidad (país del proyecto) o el proyecto (dueño o país). */
export function isOpportunityInScope(scope: VisibilityScope, opportunity: OpportunityScopeRef): boolean {
  return (
    isWithinScope(scope, { ownerId: opportunity.ownerId, countryId: opportunity.project.countryId }) ||
    isWithinScope(scope, { ownerId: opportunity.project.ownerId, countryId: opportunity.project.countryId })
  );
}

export function opportunityPolicySubject(
  opportunity: OpportunityScopeRef & { readonly isClosed: boolean },
  scopes: Pick<OpportunityAccessScopes, 'administer' | 'delete'>,
): OpportunityPolicySubject {
  return {
    ownerId: opportunity.ownerId,
    isClosed: opportunity.isClosed,
    inAdministerScope: isOpportunityInScope(scopes.administer, opportunity),
    inDeleteScope: isOpportunityInScope(scopes.delete, opportunity),
  };
}

function isOwner(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): boolean {
  return actor.userId !== null && subject.ownerId === actor.userId;
}

function administers(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): boolean {
  return actor.permissions.has(OPPORTUNITY_PERMISSIONS.administer) && subject.inAdministerScope;
}

export function canEditOpportunity(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): boolean {
  return actor.permissions.has(OPPORTUNITY_PERMISSIONS.edit) && (isOwner(actor, subject) || administers(actor, subject));
}

/** Pasar a etapa cerrada y modificar el resultado (RN-03.43, RN-03.52, H.1 "cerrar (+ editar)"). */
export function canCloseOpportunity(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): boolean {
  return canEditOpportunity(actor, subject) && actor.permissions.has(OPPORTUNITY_PERMISSIONS.close);
}

/** Reabrir (RN-03.42): editar y `administrar` dentro de su alcance. */
export function canReopenOpportunity(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): boolean {
  return canEditOpportunity(actor, subject) && administers(actor, subject);
}

/** Eliminar (RN-03.45, H.1): `eliminar` dentro de su alcance; solo una oportunidad abierta. */
export function canDeleteOpportunity(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): boolean {
  return actor.permissions.has(OPPORTUNITY_PERMISSIONS.delete) && subject.inDeleteScope;
}

/** Reasignar el asesor (RN-03.38): `administrar` dentro de su alcance. */
export function canAssignOpportunityOwner(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): boolean {
  return administers(actor, subject);
}

/** Permiso que falta para editar, para el `403 PERMISSION_DENIED`. */
export function missingEditPermission(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): string {
  if (!actor.permissions.has(OPPORTUNITY_PERMISSIONS.edit) || isOwner(actor, subject)) return OPPORTUNITY_PERMISSIONS.edit;
  return OPPORTUNITY_PERMISSIONS.administer;
}

export function opportunityCapabilities(actor: OpportunityPolicyActor, subject: OpportunityPolicySubject): OpportunityCapabilities {
  return {
    canEdit: canEditOpportunity(actor, subject),
    canClose: canCloseOpportunity(actor, subject),
    canReopen: subject.isClosed && canReopenOpportunity(actor, subject),
    canDelete: !subject.isClosed && canDeleteOpportunity(actor, subject),
  };
}

/**
 * Crear una oportunidad en un proyecto (RN-03.37, H.1): la **misma** regla que da
 * `capabilities.canCreateOpportunity` en la ficha del proyecto (`oportunidades.crear`
 * y proyecto propio, o `oportunidades.administrar` en su alcance).
 */
export function canCreateOpportunityIn(
  actor: OpportunityPolicyActor,
  project: { readonly ownerId: string; readonly countryId: string },
  administerScope: VisibilityScope,
): boolean {
  return projectAllowsOpportunityCreation(actor, {
    ownerId: project.ownerId,
    inAdministerScope: false,
    inDeleteScope: false,
    inForecastAdministerScope: false,
    inOpportunityAdministerScope: isWithinScope(administerScope, project),
  });
}

/** Asesor indicado en un alta o edición: sin `administrar`, solo el propio actor (RN-03.38). */
export function canAssignOwnerOnCreate(actor: OpportunityPolicyActor, ownerId: string): boolean {
  return actor.permissions.has(OPPORTUNITY_PERMISSIONS.administer) || (actor.userId !== null && actor.userId === ownerId);
}
