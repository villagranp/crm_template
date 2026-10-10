/** Presentación de los datos de la bitácora. Sin estado: se prueba aparte de la pantalla. */

const DATE_TIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
const EMPTY = '—';

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

export interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? EMPTY : value.map(formatValue).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function isChange(value: unknown): value is { before: unknown; after: unknown } {
  return typeof value === 'object' && value !== null && 'before' in value && 'after' in value;
}

/**
 * Filas de la diferencia `{ campo: { before, after } }`. Devuelve `null` si
 * `changes` no tiene esa forma (registros antiguos o de otro origen): la
 * pantalla lo muestra entonces como JSON tal cual.
 */
export function toChangeRows(changes: unknown): ChangeRow[] | null {
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    return null;
  }
  const entries = Object.entries(changes);
  if (!entries.every(([, change]) => isChange(change))) {
    return null;
  }
  return entries.map(([field, change]) => {
    const { before, after } = change as { before: unknown; after: unknown };
    return { field, before: formatValue(before), after: formatValue(after) };
  });
}

/** Metadatos planos como pares clave/valor; `null` si no hay. */
export function toMetadataRows(metadata: unknown): { key: string; value: string }[] | null {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const entries = Object.entries(metadata);
  return entries.length === 0 ? null : entries.map(([key, value]) => ({ key, value: formatValue(value) }));
}

export function describeActor(entry: { subjectEmail: string | null; subjectId: string | null }): string {
  return entry.subjectEmail ?? entry.subjectId ?? 'Sistema';
}
