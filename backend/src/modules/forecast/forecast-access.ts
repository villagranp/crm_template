import { noVisibility, type VisibilityScope } from '@/modules/access/visibility-scope';
import {
  canEditForecast,
  type ProjectAccessScopes,
  type ProjectPolicyActor,
  type ProjectPolicySubject,
  projectPolicySubject,
} from '@/modules/projects/project-access-policy';
import type { OwnerAssignableSet } from '@/modules/projects/ports/projects.repository.port';

import type { ForecastMode } from './forecast-window';

/**
 * Política del forecast (03 H.1, RN-03.70, RN-03.71, DM-25, DM-34). Pura y la **misma**
 * para `canEdit`/`editable` de las filas y para autorizar `PUT /forecast/lines`:
 *
 * - Ver: alcance de `forecast.ver` (cada operación usa el alcance de su permiso, AGENTS §9.4).
 * - Editar: `canEditForecast` de Proyectos = `forecast.editar` y (proyecto propio, o
 *   `forecast.administrar` con el proyecto dentro de **su** alcance). Además, el proyecto
 *   debe ser visible con `forecast.ver` (si no, `404`).
 * - Asesor de la línea distinto del asesor del proyecto: exige `forecast.administrar`.
 */

export const FORECAST_PERMISSIONS = {
  view: 'forecast.ver',
  edit: 'forecast.editar',
  administer: 'forecast.administrar',
} as const;

/** Alcances del actor para el forecast; `NONE` si no tiene el permiso. */
export interface ForecastScopes {
  readonly view: VisibilityScope;
  readonly administer: VisibilityScope;
}

/** Proyecto tal como lo evalúa la política. */
export interface ForecastPolicyProject {
  readonly ownerId: string;
  readonly countryId: string;
}

function policyScopes(actor: ProjectPolicyActor, scopes: ForecastScopes): ProjectAccessScopes {
  const none = noVisibility(actor.userId);
  return { view: scopes.view, administer: none, delete: none, opportunityAdminister: none, forecastAdminister: scopes.administer };
}

export function forecastPolicySubject(actor: ProjectPolicyActor, project: ForecastPolicyProject, scopes: ForecastScopes): ProjectPolicySubject {
  return projectPolicySubject(project, policyScopes(actor, scopes));
}

/** `canEdit` de una fila / permiso para guardar forecast del proyecto (proyecto visible incluido). */
export function canEditProjectForecast(actor: ProjectPolicyActor, project: ForecastPolicyProject & { readonly visible: boolean }, scopes: ForecastScopes): boolean {
  return project.visible && canEditForecast(actor, forecastPolicySubject(actor, project, scopes));
}

/** Permiso que falta para el `403 PERMISSION_DENIED` de un proyecto visible que no se puede editar. */
export function missingForecastEditPermission(actor: ProjectPolicyActor, project: ForecastPolicyProject): string {
  if (!actor.permissions.has(FORECAST_PERMISSIONS.edit)) return FORECAST_PERMISSIONS.edit;
  if (actor.userId !== null && actor.userId === project.ownerId) return FORECAST_PERMISSIONS.edit;
  return FORECAST_PERMISSIONS.administer;
}

/** ¿Celda editable? Fila editable, modo ventana y período M+1 … M+N (RN-03.66; D-03.5). */
export function isCellEditable(input: { readonly rowCanEdit: boolean; readonly mode: ForecastMode; readonly inWindow: boolean }): boolean {
  return input.rowCanEdit && input.mode === 'WINDOW' && input.inWindow;
}

/** ¿Puede fijar ese asesor en la línea? El del proyecto siempre; otro, solo con `forecast.administrar`. */
export function canSetLineOwner(actor: ProjectPolicyActor, ownerId: string, projectOwnerId: string): boolean {
  return ownerId === projectOwnerId || actor.permissions.has(FORECAST_PERMISSIONS.administer);
}

/**
 * Usuarios asignables como asesor de una línea con `forecast.administrar` (D-03.16): el
 * propio actor y los de su alcance (TEAM: miembros y responsables con subequipos; COUNTRY:
 * su país; ORGANIZATION: todos). Sin el permiso, solo el actor.
 */
export function assignableLineOwners(actor: ProjectPolicyActor, scopes: ForecastScopes): OwnerAssignableSet {
  const self = actor.userId ? [actor.userId] : [];
  if (!actor.permissions.has(FORECAST_PERMISSIONS.administer)) return { kind: 'FILTERED', userIds: self, countryIds: [] };
  const scope = scopes.administer;
  return scope.kind === 'ALL'
    ? { kind: 'ALL' }
    : { kind: 'FILTERED', userIds: [...new Set([...self, ...scope.ownerIds])], countryIds: [...scope.countryIds] };
}
