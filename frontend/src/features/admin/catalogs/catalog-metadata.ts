import type { CatalogItemMetadata, CatalogMetadataField } from './catalogs.api';

/**
 * Formulario de `metadata` generado desde `metadataSchema` (07 E.3, F.4). Sin
 * estado: se prueba aparte del componente. La validación aquí es de
 * experiencia de usuario; quien decide es el backend con
 * `422 INVALID_CATALOG_METADATA` (RN-07.23) y `409 CATALOG_INVARIANT`.
 */

/** Valor de un control del formulario: casilla, texto/número, selección o selección múltiple. */
export type MetadataDraftValue = boolean | string | string[];
export type MetadataDraft = Record<string, MetadataDraftValue>;

/** Etiquetas de las claves de semántica conocidas (00 §3.3). Las demás se muestran por su clave. */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  isActive: 'Cuenta como activo',
  rank: 'Rango',
  order: 'Orden en el flujo',
  isFinal: 'Fase final',
  defaultProgress: 'Avance por defecto (%)',
  isClosed: 'Etapa cerrada',
  outcome: 'Resultado de la etapa',
  inFunnel: 'Cuenta en el embudo',
  requiresReason: 'Exige motivo',
  requiresAwardedPercent: 'Exige porcentaje adjudicado',
  stageOutcome: 'Etapa de resultado',
  appliesTo: 'Aplica a',
  isInteraction: 'Es una interacción',
  fields: 'Campos del formulario',
  isOpen: 'Abierta',
  isCompleted: 'Completada',
  isCancelled: 'Cancelada',
  isPending: 'Pendiente',
  isDone: 'Realizada',
  isConfirmed: 'Confirmada',
  isRescheduled: 'Reprogramada',
  weight: 'Peso',
};

const VALUE_LABEL: Readonly<Record<string, string>> = {
  WON: 'Ganada',
  LOST: 'Perdida',
  PARTIAL: 'Parcial',
};

export function metadataFieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

export function metadataValueLabel(value: string): string {
  return VALUE_LABEL[value] ?? value;
}

/** Estado inicial de los controles a partir del `metadata` guardado. */
export function toMetadataDraft(
  schema: readonly CatalogMetadataField[],
  metadata: CatalogItemMetadata | null,
): MetadataDraft {
  const draft: MetadataDraft = {};
  for (const field of schema) {
    const value = metadata?.[field.key];
    switch (field.type) {
      case 'boolean':
        draft[field.key] = value === true;
        break;
      case 'enum[]':
      case 'string[]':
        draft[field.key] = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
        break;
      default:
        draft[field.key] = value === null || value === undefined ? '' : String(value);
    }
  }
  return draft;
}

export interface MetadataBuildResult {
  /** `null` si el esquema no declara claves (catálogo sin semántica en `metadata`). */
  metadata: CatalogItemMetadata | null;
  /** Mensaje por clave; vacío = se puede enviar. */
  errors: Record<string, string>;
}

const REQUIRED = 'Obligatorio.';

function numberError(field: CatalogMetadataField, value: number): string | null {
  if (!Number.isFinite(value)) {
    return 'Escribe un número.';
  }
  if (field.integer && !Number.isInteger(value)) {
    return 'Escribe un número entero.';
  }
  if (field.min !== undefined && value < field.min) {
    return `Debe ser al menos ${field.min}.`;
  }
  if (field.max !== undefined && value > field.max) {
    return `Debe ser como mucho ${field.max}.`;
  }
  return null;
}

/**
 * Convierte los controles en el `metadata` que se envía. Los booleanos
 * obligatorios viajan siempre (`false` si no se marcan); los opcionales, sólo
 * si se marcan. Un número, texto o selección vacío se omite (o es `null` si
 * la clave lo admite). Las claves que el esquema no declara se descartan: el
 * backend las rechazaría.
 */
export function buildMetadata(schema: readonly CatalogMetadataField[], draft: MetadataDraft): MetadataBuildResult {
  const errors: Record<string, string> = {};
  if (schema.length === 0) {
    return { metadata: null, errors };
  }
  const metadata: CatalogItemMetadata = {};

  for (const field of schema) {
    const value = draft[field.key];
    switch (field.type) {
      case 'boolean': {
        if (value === true || field.required) {
          metadata[field.key] = value === true;
        }
        break;
      }
      case 'enum[]':
      case 'string[]': {
        const list = Array.isArray(value) ? value : [];
        if (field.type === 'enum[]' && field.required && list.length === 0) {
          errors[field.key] = 'Elige al menos uno.';
        } else if (list.length > 0 || field.required) {
          metadata[field.key] = list;
        }
        break;
      }
      default: {
        const text = typeof value === 'string' ? value.trim() : '';
        if (text === '') {
          if (field.required) {
            errors[field.key] = REQUIRED;
          } else if (field.nullable) {
            metadata[field.key] = null;
          }
          break;
        }
        if (field.type === 'number') {
          const number = Number(text);
          const error = numberError(field, number);
          if (error) {
            errors[field.key] = error;
          } else {
            metadata[field.key] = number;
          }
        } else {
          metadata[field.key] = text;
        }
      }
    }
  }
  return { metadata, errors };
}
