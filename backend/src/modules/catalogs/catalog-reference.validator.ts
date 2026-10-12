import { Inject, Injectable } from '@nestjs/common';

import { BusinessRuleViolationError } from '@/common/errors/application-error';
import type { FieldIssue } from '@/common/errors/field-issue';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import {
  CATALOG_REFERENCE_READER,
  type CatalogItemLookupMode,
  type CatalogItemRef,
  type CatalogReferenceReader,
} from './ports/catalog-reference.port';

/** `422`: el valor no pertenece al catálogo esperado o está inactivo (00 §3.5). */
export const INVALID_CATALOG_VALUE = 'INVALID_CATALOG_VALUE';

export type CatalogReferenceFailure = 'NOT_FOUND' | 'INACTIVE';

export interface CatalogReferenceOptions {
  /** Campo del DTO, para `details[].field` (`statusId`, `companyTypeId`…). */
  readonly field: string;
  /** `id` por defecto; `code` para la importación (D-02.17). */
  readonly by?: CatalogItemLookupMode;
  /**
   * Exige `isActive = true`. Por defecto `true` (alta, 00 §3.5). En una edición se
   * pasa además `currentId`: un elemento ya desactivado se conserva si no cambia.
   */
  readonly requireActive?: boolean;
  /**
   * Valor que el registro tiene hoy (edición). Si el elemento resuelto es este
   * mismo, se admite aunque esté inactivo: desactivar un elemento no rompe los
   * registros que ya lo usan (00 §3.5, 02 RN-02.9). Sigue debiendo pertenecer al catálogo.
   */
  readonly currentId?: string | null;
  /** Transacción del llamador (00 §3.5: "dentro de la transacción"). */
  readonly tx?: TransactionContext;
}

export interface CatalogReferenceIssue extends FieldIssue {
  readonly catalogKey: string;
  readonly reason: CatalogReferenceFailure;
}

export type CatalogReferenceCheck =
  | { readonly ok: true; readonly item: CatalogItemRef }
  | { readonly ok: false; readonly issue: CatalogReferenceIssue };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<CatalogReferenceFailure, string> = {
  NOT_FOUND: 'The value does not belong to the expected catalog',
  INACTIVE: 'The catalog value is inactive',
};

/** Error HTTP 422 con una incidencia por campo; nunca repite el valor recibido. */
export function invalidCatalogValueError(issues: readonly CatalogReferenceIssue[]): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    INVALID_CATALOG_VALUE,
    issues.length === 1 ? (issues[0]?.message ?? MESSAGES.NOT_FOUND) : 'Some catalog values are not valid',
    issues.map((issue) => ({ field: issue.field, catalogKey: issue.catalogKey, reason: issue.reason })),
  );
}

/**
 * Guardia de aplicación "el elemento pertenece al catálogo X y está activo"
 * (00 §3.5). La base solo garantiza que el id existe en `catalog_items`, no **a
 * qué catálogo** pertenece. Todo caso de uso que escribe una columna `*_id`
 * hacia `catalog_items` la invoca antes de escribir.
 *
 * - `assertItem`: lanza `422 INVALID_CATALOG_VALUE` (`details[]` con `field`,
 *   `catalogKey` y `reason` `NOT_FOUND | INACTIVE`).
 * - `check`: misma regla sin lanzar, para validadores que devuelven **todas** las
 *   incidencias de una entrada (02 RN-02.12, importación).
 */
@Injectable()
export class CatalogReferenceValidator {
  constructor(@Inject(CATALOG_REFERENCE_READER) private readonly reader: CatalogReferenceReader) {}

  async assertItem(catalogKey: string, value: string, options: CatalogReferenceOptions): Promise<CatalogItemRef> {
    const result = await this.check(catalogKey, value, options);
    if (!result.ok) {
      throw invalidCatalogValueError([result.issue]);
    }
    return result.item;
  }

  async check(catalogKey: string, value: string, options: CatalogReferenceOptions): Promise<CatalogReferenceCheck> {
    const by = options.by ?? 'id';
    const trimmed = value.trim();
    // Un id que no es UUID no puede existir: se responde sin consultar (y sin que
    // la columna `uuid` de PostgreSQL lance un error de tipo).
    const lookupable = trimmed.length > 0 && (by === 'code' || UUID_PATTERN.test(trimmed));
    const item = lookupable ? await this.reader.findItem(catalogKey, { by, value: trimmed }, options.tx) : null;

    if (!item) {
      return { ok: false, issue: issueFor(catalogKey, options.field, 'NOT_FOUND') };
    }

    const requireActive = options.requireActive ?? true;
    const keepsCurrentValue = options.currentId !== undefined && options.currentId !== null && item.id === options.currentId;
    if (requireActive && !item.isActive && !keepsCurrentValue) {
      return { ok: false, issue: issueFor(catalogKey, options.field, 'INACTIVE') };
    }

    return { ok: true, item };
  }
}

function issueFor(catalogKey: string, field: string, reason: CatalogReferenceFailure): CatalogReferenceIssue {
  return { field, code: INVALID_CATALOG_VALUE, message: MESSAGES[reason], catalogKey, reason };
}
