import { type CalendarDate, compareCalendarDates } from './project-dates';
import { PROJECT_ERROR_CODES, type ProjectIssue, projectIssue } from './project-errors';

/**
 * Reglas puras del proyecto (03 C.1): código, coherencia de fechas y obligatorios.
 */

/** Obligatorios de base del proyecto (RN-03.3); el parámetro solo añade. */
export const PROJECT_BASE_REQUIRED_FIELDS = ['name', 'customerId', 'countryId', 'ownerId'] as const;

/** Campos que se capturan en el alta y la edición de datos generales (03 F.1 `CreateProjectDto`). */
export const PROJECT_GENERAL_FIELDS = [
  'name',
  'customerId',
  'countryId',
  'city',
  'address',
  'description',
  'estimatedStartDate',
  'estimatedEndDate',
  'estimatedDecisionDate',
  'ownerId',
] as const;
export type ProjectGeneralField = (typeof PROJECT_GENERAL_FIELDS)[number];

/** Campos que se capturan en la clasificación (03 F.1 `UpdateClassificationDto`). */
export const PROJECT_CLASSIFICATION_FIELDS = ['projectTypeId', 'sectorId', 'measureUnitId', 'estimatedQuantity'] as const;
export type ProjectClassificationField = (typeof PROJECT_CLASSIFICATION_FIELDS)[number];

export interface ProjectRequiredFields {
  /** Todos los obligatorios (base + `crm.campos_obligatorios.project`), para `form-options`. */
  readonly all: readonly string[];
  /** Los que se exigen en alta, edición y duplicado. */
  readonly general: readonly ProjectGeneralField[];
  /** Los que se exigen al guardar la clasificación. */
  readonly classification: readonly ProjectClassificationField[];
}

/**
 * Reparte `crm.campos_obligatorios.project` (RN-03.3) entre las operaciones que
 * capturan cada campo ("Precisiones de implementación", E2a): `phaseId` y
 * `phaseProgress` siempre tienen valor (fase por defecto), así que nunca faltan.
 */
export function projectRequiredFields(parameterValue: Readonly<Record<string, readonly string[] | undefined>>): ProjectRequiredFields {
  const all = [...new Set<string>([...PROJECT_BASE_REQUIRED_FIELDS, ...(parameterValue['project'] ?? [])])];
  return {
    all,
    general: PROJECT_GENERAL_FIELDS.filter((field) => all.includes(field)),
    classification: PROJECT_CLASSIFICATION_FIELDS.filter((field) => all.includes(field)),
  };
}

/**
 * Obligatorios que faltan (RN-03.3). En el alta falta lo `null`/`undefined`; en una
 * edición solo lo que se **envía** vacío (`null`): lo no enviado no cambia (mismo
 * criterio que 02 RN-02.4).
 */
export function missingRequiredFieldIssues(
  required: readonly string[],
  values: Readonly<Record<string, unknown>>,
  mode: 'create' | 'edit',
): ProjectIssue[] {
  return required
    .filter((field) => {
      const value = values[field];
      const empty = value === null || (typeof value === 'string' && value.trim() === '');
      return mode === 'edit' ? empty : empty || value === undefined;
    })
    .map((field) => projectIssue(field, PROJECT_ERROR_CODES.requiredFieldMissing));
}

/** RN-03.4: fin estimado ≥ inicio estimado (la decisión no se restringe). */
export function dateRangeIssue(start: CalendarDate | null, end: CalendarDate | null): ProjectIssue | null {
  if (start === null || end === null || compareCalendarDates(end, start) >= 0) return null;
  return projectIssue('estimatedEndDate', PROJECT_ERROR_CODES.invalidDateRange, { startField: 'estimatedStartDate' });
}

/**
 * Código manual (DM-17): recortado y en mayúsculas, como los generados (`PRY-2026-00042`).
 * `null` si queda vacío.
 */
export function normalizeProjectCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/** Texto opcional recortado; vacío = `null`. `undefined` se conserva (sin cambio). */
export function trimOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
