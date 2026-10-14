import { type ActivityAction, activityStateViolation, type ActivityStatusGroup, ACTIVITY_ACTIONS } from './activity-lifecycle';
import type { CommercialAccess } from './ports/commercial-visibility';

/**
 * Política de acceso a actividades (04 H.2, RN-04.5, DM-34). Pura: decide qué puede
 * hacer un actor sobre una actividad que **ya sabe que ve** (la visibilidad, que da
 * `404`, la aplica el repositorio). La misma función calcula `allowedActions` y hace
 * cumplir cada operación: el frontend solo oculta.
 *
 * Cada operación exige que la actividad caiga en el alcance **del permiso que la
 * concede** (patrón de 02, "Precisiones de implementación"):
 * - editar y cancelar: `actividades.editar` y (propia, o ajena dentro del alcance de
 *   `actividades.administrar`);
 * - completar: `actividades.cerrar` y (propia, o ajena dentro del alcance de `administrar`);
 * - eliminar: `actividades.eliminar` y dentro de su alcance.
 * Todas con acceso `DIRECT`: la visible solo por un proyecto (herencia DM-13) es de
 * solo lectura. `administrar` sin `editar` no edita (como en 02 F.1).
 */

export const ACTIVITY_PERMISSIONS = {
  view: 'actividades.ver',
  create: 'actividades.crear',
  edit: 'actividades.editar',
  close: 'actividades.cerrar',
  delete: 'actividades.eliminar',
  administer: 'actividades.administrar',
} as const;

export interface ActivityPolicyActor {
  /** Usuario local; `null` = sin cuenta local (no es dueño de nada). */
  readonly userId: string | null;
  readonly permissions: ReadonlySet<string>;
}

export interface ActivityPolicySubject {
  readonly ownerId: string;
  readonly access: CommercialAccess;
  readonly group: ActivityStatusGroup;
  /** ¿Cae en el alcance de `actividades.administrar` del actor? (`false` sin el permiso). */
  readonly inAdministerScope: boolean;
  /** ¿Cae en el alcance de `actividades.eliminar` del actor? (`false` sin el permiso). */
  readonly inDeleteScope: boolean;
}

function isOwner(actor: ActivityPolicyActor, subject: ActivityPolicySubject): boolean {
  return actor.userId !== null && subject.ownerId === actor.userId;
}

/** `actividades.administrar` con la actividad dentro de SU alcance y acceso directo. */
export function administersActivity(actor: ActivityPolicyActor, subject: ActivityPolicySubject): boolean {
  return subject.access === 'DIRECT' && actor.permissions.has(ACTIVITY_PERMISSIONS.administer) && subject.inAdministerScope;
}

/** Permiso de la operación y (propia o administrada), con acceso directo. No mira el estado. */
function canWrite(actor: ActivityPolicyActor, subject: ActivityPolicySubject, permission: string): boolean {
  if (subject.access !== 'DIRECT' || !actor.permissions.has(permission)) return false;
  return isOwner(actor, subject) || administersActivity(actor, subject);
}

/** Permiso que concede cada operación. */
export const ACTION_PERMISSION: Readonly<Record<ActivityAction, string>> = {
  EDIT: ACTIVITY_PERMISSIONS.edit,
  COMPLETE: ACTIVITY_PERMISSIONS.close,
  CANCEL: ACTIVITY_PERMISSIONS.edit,
  DELETE: ACTIVITY_PERMISSIONS.delete,
};

/** ¿El actor puede ejecutar la operación por permisos y propiedad? (el estado se evalúa aparte). */
export function isActivityActionPermitted(actor: ActivityPolicyActor, subject: ActivityPolicySubject, action: ActivityAction): boolean {
  if (action === 'DELETE') {
    return subject.access === 'DIRECT' && actor.permissions.has(ACTIVITY_PERMISSIONS.delete) && subject.inDeleteScope;
  }
  return canWrite(actor, subject, ACTION_PERMISSION[action]);
}

/**
 * Permiso que falta, para el `403 PERMISSION_DENIED`: el de la operación si no lo
 * tiene (o si es su propia actividad); si no, `actividades.administrar` (ajena).
 */
export function missingActivityPermission(actor: ActivityPolicyActor, subject: ActivityPolicySubject, action: ActivityAction): string {
  const permission = ACTION_PERMISSION[action];
  if (action === 'DELETE' || !actor.permissions.has(permission) || isOwner(actor, subject)) return permission;
  return ACTIVITY_PERMISSIONS.administer;
}

/** `allowedActions` (F.2): permitidas por permisos y propiedad **y** por el estado. */
export function allowedActivityActions(actor: ActivityPolicyActor, subject: ActivityPolicySubject): ActivityAction[] {
  return ACTIVITY_ACTIONS.filter(
    (action) => isActivityActionPermitted(actor, subject, action) && activityStateViolation(subject.group, action) === null,
  );
}

/**
 * Responsable propuesto (RN-04.5): el propio actor siempre; otro usuario exige
 * `actividades.administrar` (además, el caso de uso comprueba que sea elegible).
 */
export function canAssignActivityOwner(actor: ActivityPolicyActor, ownerId: string): boolean {
  return (actor.userId !== null && actor.userId === ownerId) || actor.permissions.has(ACTIVITY_PERMISSIONS.administer);
}
