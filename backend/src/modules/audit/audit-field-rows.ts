import type { AuditLogRecord } from './ports/audit-query.repository.port';

/**
 * Vista por campo de la bitácora (D-07.10, RN-07.42): una presentación de
 * `changes`, sin nada almacenado aparte.
 */

/** Formatos de la exportación: por evento (histórico, por defecto) o por campo. */
export const AUDIT_EXPORT_LAYOUTS = ['events', 'fields'] as const;
export type AuditExportLayout = (typeof AUDIT_EXPORT_LAYOUTS)[number];

/** Una fila por campo cambiado de un evento. */
export interface AuditFieldRow {
  occurredAt: Date;
  /** Correo del actor o, si no lo hay, su identificador. */
  user: string | null;
  resourceType: string | null;
  resourceId: string | null;
  event: string;
  /** `null` si el evento no tiene `changes` utilizable. */
  field: string | null;
  before: string | null;
  after: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `{ before, after }` es la forma de `audit-diff.ts`; cualquier otra es un registro antiguo. */
function isBeforeAfter(value: unknown): value is { before: unknown; after: unknown } {
  return isPlainObject(value) && 'before' in value && 'after' in value;
}

/** Texto tal cual; `null`/ausente vacío; números, booleanos, listas y objetos como JSON. */
export function formatAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Filas por campo de un evento.
 *
 * - `{ campo: { before, after } }` → una fila por campo, en el orden guardado.
 * - Un valor de campo con otra forma (registros antiguos) → `Valor anterior` vacío y
 *   el valor completo como JSON en `Valor nuevo` (RN-07.42).
 * - Sin `changes`, o `changes` que no es un objeto → una sola fila sin campo (y, si
 *   había algo, el JSON en `Valor nuevo`): el evento no desaparece de la exportación.
 * - Con `onlyField`, solo la fila de ese campo (el filtro `field` ya garantiza que existe).
 */
export function toAuditFieldRows(record: AuditLogRecord, onlyField?: string): AuditFieldRow[] {
  const base = {
    occurredAt: record.occurredAt,
    user: record.subjectEmail ?? record.subjectId,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    event: record.event,
  };
  const { changes } = record;

  if (!isPlainObject(changes) || Object.keys(changes).length === 0) {
    return [{ ...base, field: null, before: null, after: formatAuditValue(isPlainObject(changes) ? null : changes) }];
  }

  return Object.entries(changes)
    .filter(([field]) => onlyField === undefined || field === onlyField)
    .map(([field, value]) =>
      isBeforeAfter(value)
        ? { ...base, field, before: formatAuditValue(value.before), after: formatAuditValue(value.after) }
        : { ...base, field, before: null, after: formatAuditValue(value) },
    );
}
