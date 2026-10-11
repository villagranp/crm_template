import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import type { CatalogItemMetadata } from './catalogs.repository.port';

export const CATALOG_REFERENCE_READER = Symbol('CATALOG_REFERENCE_READER');

/** Cómo identifica el llamador al elemento: `id` (pantallas) o `code` (importación, D-02.17). */
export type CatalogItemLookupMode = 'id' | 'code';

/** Elemento de catálogo resuelto, con su catálogo. Lo devuelve `CatalogReferenceValidator`. */
export interface CatalogItemRef {
  readonly id: string;
  readonly catalogKey: string;
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly metadata: CatalogItemMetadata | null;
}

/**
 * Lectura mínima para la guardia "el elemento pertenece al catálogo X" (00 §3.5):
 * una consulta `catalog_items JOIN catalogs WHERE <id|code> = $1 AND key = $2`.
 * Acepta la transacción del llamador para validar dentro de ella.
 */
export interface CatalogReferenceReader {
  /** `null` si no existe un elemento con ese id/código **en ese** catálogo. */
  findItem(
    catalogKey: string,
    lookup: { readonly by: CatalogItemLookupMode; readonly value: string },
    tx?: TransactionContext,
  ): Promise<CatalogItemRef | null>;
}
