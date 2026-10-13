import type { CatalogMetadata } from './catalog-state';

/**
 * Campos específicos por tipo de actividad (RN-04.24, D-04.8). `crm.tipo_actividad`
 * declara en `metadata.fields` cuáles admite; los campos generales (asunto,
 * descripción, cliente, proyecto, oportunidad, responsable, vencimiento, estado,
 * prioridad) valen para todos los tipos. Funciones puras.
 */

export const ACTIVITY_SPECIFIC_FIELDS = [
  'scheduledAt',
  'durationMinutes',
  'participants',
  'summary',
  'resultId',
  'resultNotes',
  'nextAction',
  'nextActionDate',
] as const;
export type ActivitySpecificField = (typeof ACTIVITY_SPECIFIC_FIELDS)[number];

const SPECIFIC = new Set<string>(ACTIVITY_SPECIFIC_FIELDS);

export function isActivitySpecificField(field: string): field is ActivitySpecificField {
  return SPECIFIC.has(field);
}

/**
 * Campos específicos que admite el tipo. Un nombre desconocido en `metadata.fields`
 * se ignora (el registro de semántica solo valida su forma); sin `fields`, ninguno.
 */
export function typeSpecificFields(metadata: CatalogMetadata): readonly ActivitySpecificField[] {
  const fields = metadata?.['fields'];
  if (!Array.isArray(fields)) return [];
  return ACTIVITY_SPECIFIC_FIELDS.filter((field) => fields.includes(field));
}

/** ¿El valor cuenta como informado? `null`, `undefined`, texto vacío y lista vacía no cuentan. */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Campos específicos **informados** que el tipo no admite (RN-04.24 →
 * `422 FIELD_NOT_APPLICABLE`). Se evalúa sobre el estado final de la actividad, así
 * que también revalida los valores ya guardados al cambiar de tipo (RN-04.27).
 */
export function notApplicableFields(
  allowed: readonly ActivitySpecificField[],
  values: Readonly<Partial<Record<ActivitySpecificField, unknown>>>,
): ActivitySpecificField[] {
  return ACTIVITY_SPECIFIC_FIELDS.filter((field) => !allowed.includes(field) && hasValue(values[field]));
}
