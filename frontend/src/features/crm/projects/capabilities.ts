import type { ProjectCapabilities } from './projects.api';

/**
 * Qué muestra la interfaz a partir de las `capabilities` del proyecto
 * (RN-03.19). El backend las calcula con la misma política que autoriza cada
 * operación (propio frente a ajeno, `editar` frente a `administrar`, DM-34) y
 * vuelve a decidir en cada mutación: ocultar aquí es experiencia de usuario, no
 * seguridad. Nunca se recalculan permisos en el frontend.
 */

/** Sin capacidades: estado seguro mientras no hay ficha. */
export const NO_CAPABILITIES: ProjectCapabilities = {
  canEdit: false,
  canAdminister: false,
  canDelete: false,
  canDuplicate: false,
  canCreateOpportunity: false,
  canEditForecast: false,
};

/** Campos de datos generales (`PATCH /projects/{id}`). */
export type ProjectGeneralField =
  | 'name'
  | 'customerId'
  | 'countryId'
  | 'city'
  | 'address'
  | 'description'
  | 'estimatedStartDate'
  | 'estimatedEndDate'
  | 'estimatedDecisionDate'
  | 'ownerId'
  | 'code';

/** Reasignar asesor y cambiar el código exigen `proyectos.administrar` (RN-03.6, DM-17). */
const ADMINISTER_ONLY: ReadonlySet<ProjectGeneralField> = new Set(['ownerId', 'code']);

export const READ_ONLY_HELP = 'No puedes editar este proyecto.';
export const ADMINISTER_ONLY_HELP = 'Solo quien puede administrar proyectos cambia este campo.';

/** `true` si el usuario puede cambiar el campo en la edición. */
export function canEditField(capabilities: ProjectCapabilities, field: ProjectGeneralField): boolean {
  if (!capabilities.canEdit) {
    return false;
  }
  return ADMINISTER_ONLY.has(field) ? capabilities.canAdminister : true;
}

/** Explicación de un campo deshabilitado, o `undefined` si es editable. */
export function disabledFieldHelp(capabilities: ProjectCapabilities, field: ProjectGeneralField): string | undefined {
  if (canEditField(capabilities, field)) {
    return undefined;
  }
  return capabilities.canEdit ? ADMINISTER_ONLY_HELP : READ_ONLY_HELP;
}

/**
 * Lo que se gestiona con `proyectos.editar` sobre el proyecto (clasificación,
 * fase, productos asociados, adjuntos; 03 §H.1) sigue a `canEdit`.
 */
export function canManageProjectContent(capabilities: ProjectCapabilities): boolean {
  return capabilities.canEdit;
}

/** Acciones de la cabecera de la ficha (03 §E.4). */
export function headerActions(capabilities: ProjectCapabilities): { edit: boolean; duplicate: boolean; remove: boolean } {
  return { edit: capabilities.canEdit, duplicate: capabilities.canDuplicate, remove: capabilities.canDelete };
}
