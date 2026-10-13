import type { ActivityPolicyActor } from './activity-access-policy';
import type { CommercialAccess } from './ports/commercial-visibility';
import { type VisitOperation, VISIT_OPERATIONS, type VisitStatusGroup, visitStateViolation } from './visit-lifecycle';

/**
 * Política de acceso a visitas (04 H.2, RN-04.5, RN-04.18, DM-20, DM-34). Pura:
 * decide qué puede hacer un actor sobre una visita que **ya sabe que ve** (la
 * visibilidad, que da `404`, la aplica el repositorio). La misma función calcula
 * `allowedActions` y hace cumplir cada operación.
 *
 * - Editar la planificación, registrar o corregir la realización, reprogramar y
 *   cancelar: `visitas.editar` y (propia, o ajena dentro del alcance de
 *   `visitas.administrar`).
 * - Confirmar: `visitas.cerrar` y **solo la propia** (DM-20): ni `visitas.administrar`
 *   ni el comodín del administrador confirman la visita de otro
 *   (`403 VISIT_CONFIRMATION_OWNER_ONLY`, `ck_visits_confirmed_by_owner`).
 *
 * Todas con acceso `DIRECT`: una visita visible solo por su proyecto (herencia
 * DM-13) es de solo lectura. `administrar` sin `editar` no edita.
 */

export const VISIT_PERMISSIONS = {
  view: 'visitas.ver',
  create: 'visitas.crear',
  edit: 'visitas.editar',
  close: 'visitas.cerrar',
  administer: 'visitas.administrar',
} as const;

export interface VisitPolicySubject {
  readonly ownerId: string;
  readonly access: CommercialAccess;
  readonly group: VisitStatusGroup;
  /** ¿Cae en el alcance de `visitas.administrar` del actor? (`false` sin el permiso). */
  readonly inAdministerScope: boolean;
}

/** Por qué se deniega una operación por permisos o propiedad (el estado se evalúa aparte). */
export type VisitDenial =
  | { readonly kind: 'PERMISSION'; readonly permission: string }
  /** Confirmar la visita de otro (RN-04.18, DM-20). */
  | { readonly kind: 'OWNER_ONLY' };

function isOwner(actor: ActivityPolicyActor, subject: VisitPolicySubject): boolean {
  return actor.userId !== null && subject.ownerId === actor.userId;
}

/** `visitas.administrar` con la visita dentro de SU alcance y acceso directo. */
export function administersVisit(actor: ActivityPolicyActor, subject: VisitPolicySubject): boolean {
  return subject.access === 'DIRECT' && actor.permissions.has(VISIT_PERMISSIONS.administer) && subject.inAdministerScope;
}

/** Permiso que concede cada operación. */
export const VISIT_OPERATION_PERMISSION: Readonly<Record<VisitOperation, string>> = {
  EDIT: VISIT_PERMISSIONS.edit,
  COMPLETE: VISIT_PERMISSIONS.edit,
  CORRECT_COMPLETION: VISIT_PERMISSIONS.edit,
  CONFIRM: VISIT_PERMISSIONS.close,
  RESCHEDULE: VISIT_PERMISSIONS.edit,
  CANCEL: VISIT_PERMISSIONS.edit,
};

/**
 * `null` si el actor puede ejecutar la operación por permisos y propiedad. Orden de
 * RN-04.18 para confirmar: sin `visitas.cerrar` → `PERMISSION`; no dueño → `OWNER_ONLY`.
 */
export function visitOperationDenial(actor: ActivityPolicyActor, subject: VisitPolicySubject, operation: VisitOperation): VisitDenial | null {
  const permission = VISIT_OPERATION_PERMISSION[operation];
  if (!actor.permissions.has(permission)) return { kind: 'PERMISSION', permission };
  if (operation === 'CONFIRM') {
    return isOwner(actor, subject) && subject.access === 'DIRECT' ? null : { kind: 'OWNER_ONLY' };
  }
  if (subject.access !== 'DIRECT') return { kind: 'PERMISSION', permission };
  if (isOwner(actor, subject) || administersVisit(actor, subject)) return null;
  return { kind: 'PERMISSION', permission: VISIT_PERMISSIONS.administer };
}

/** `allowedActions` (F.1): permitidas por permisos y propiedad **y** por el estado. */
export function allowedVisitActions(actor: ActivityPolicyActor, subject: VisitPolicySubject): VisitOperation[] {
  return VISIT_OPERATIONS.filter(
    (operation) => visitOperationDenial(actor, subject, operation) === null && visitStateViolation(subject.group, operation) === null,
  );
}

/**
 * Responsable propuesto (RN-04.5): el propio actor siempre; otro usuario exige
 * `visitas.administrar` (además, el caso de uso comprueba que sea elegible).
 */
export function canAssignVisitOwner(actor: ActivityPolicyActor, ownerId: string): boolean {
  return (actor.userId !== null && actor.userId === ownerId) || actor.permissions.has(VISIT_PERMISSIONS.administer);
}
