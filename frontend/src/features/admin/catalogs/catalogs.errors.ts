import { ADMIN_ERROR_CODES, describeApiError } from '@/features/admin/common';
import { ApiError } from '@/services/api';

import { metadataFieldLabel } from './catalog-metadata';

/**
 * Mensajes de error propios del área (ganan sobre los comunes de `describeApiError`).
 * Viven fuera de los componentes para que React Fast Refresh funcione.
 */
export const CATALOG_FORM_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un catálogo con esa clave.',
  SYSTEM_RESOURCE_READ_ONLY: 'Es un catálogo del sistema: su clave no se puede cambiar.',
};

export const CATALOG_ITEM_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un elemento con ese código en este catálogo.',
  RESOURCE_NOT_FOUND: 'El elemento o el catálogo ya no existen. Actualiza y vuelve a intentarlo.',
};

export const CATALOG_DELETE_ERRORS: Readonly<Record<string, string>> = {
  CATALOG_NOT_EMPTY: 'El catálogo tiene elementos (activos o inactivos); sólo se puede eliminar si está vacío.',
  SYSTEM_RESOURCE_READ_ONLY: 'Es un catálogo del sistema y no se puede eliminar.',
};

/** Mensajes de `CATALOG_INVARIANT` por `details[].reason` (07 RN-07.24–RN-07.26). */
const INVARIANT_MESSAGES: Readonly<Record<string, string>> = {
  closed_set: 'Es un conjunto cerrado: no se crean ni se desactivan valores; sólo cambian la etiqueta y el orden.',
  invariant: 'El cambio dejaría el catálogo incoherente.',
  referenced_by_parameter: 'Un parámetro del CRM usa este valor. Cambia primero el parámetro y vuelve a intentarlo.',
};

const LABEL_TAKEN = 'Ya existe un valor con esa etiqueta en este catálogo.';
const LABEL_TAKEN_INACTIVE = 'Ya existe un valor inactivo con esa etiqueta: reactívalo en lugar de crear otro.';
const METADATA_INVALID = 'Los datos del valor no cumplen el formato de este catálogo.';

export interface CatalogItemErrorView {
  message: string;
  /** Detalle legible: campos de `metadata`, invariantes o parámetros implicados. */
  details: string[];
}

type Detail = Record<string, unknown>;

function detailsOf(error: unknown): Detail[] {
  if (!(error instanceof ApiError)) {
    return [];
  }
  return error.details.filter((detail): detail is Detail => typeof detail === 'object' && detail !== null);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** `metadata.isClosed` → "Etapa cerrada". */
function metadataField(field: string | null): string | null {
  if (!field) {
    return null;
  }
  const key = field.replace(/^metadata\.?/, '');
  return key ? metadataFieldLabel(key.split('.')[0] ?? key) : null;
}

/**
 * Error de alta o edición de un elemento con el detalle que da el backend
 * (07 E.3): el campo de `metadata` que no cumple, el motivo del invariante,
 * los parámetros que usan el código y la etiqueta duplicada (inactiva o no).
 */
export function describeCatalogItemError(error: unknown): CatalogItemErrorView {
  const view = describeApiError(error, CATALOG_ITEM_ERRORS);
  const details = detailsOf(error);

  if (view.code === ADMIN_ERROR_CODES.invalidCatalogMetadata) {
    return {
      message: METADATA_INVALID,
      details: details.map((detail) => {
        const field = metadataField(text(detail['field']));
        const issue = text(detail['issue']) ?? 'no es válido';
        return field ? `${field}: ${issue}` : issue;
      }),
    };
  }

  if (view.code === ADMIN_ERROR_CODES.catalogInvariant) {
    const reason = text(details[0]?.['reason']) ?? 'invariant';
    const message = INVARIANT_MESSAGES[reason] ?? view.message;
    if (reason === 'referenced_by_parameter') {
      const keys = details.flatMap((detail) =>
        Array.isArray(detail['keys']) ? detail['keys'].filter((key): key is string => typeof key === 'string') : [],
      );
      return { message, details: keys.length > 0 ? [`Parámetros: ${keys.join(', ')}`] : [] };
    }
    return {
      message,
      details: reason === 'invariant' ? details.flatMap((detail) => text(detail['issue']) ?? []) : [],
    };
  }

  if (view.code === 'RESOURCE_CONFLICT') {
    const label = details.find((detail) => detail['field'] === 'label');
    if (label) {
      return { message: label['existingIsActive'] === false ? LABEL_TAKEN_INACTIVE : LABEL_TAKEN, details: [] };
    }
  }

  return { message: view.message, details: [] };
}
