import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type {
  CatalogItemLookupMode,
  CatalogItemRef,
  CatalogReferenceReader,
} from '@/modules/catalogs/ports/catalog-reference.port';
import type { CatalogItemMetadata } from '@/modules/catalogs/ports/catalogs.repository.port';

import { PrismaService } from '../prisma.service';
import { prismaClientFor } from '../prisma-transaction';

/**
 * Adaptador de `CatalogReferenceReader` (00 §3.5). Una sola consulta por el
 * índice único `(catalog_id, code)` o por la clave primaria, filtrada por la
 * `key` del catálogo.
 */
@Injectable()
export class PrismaCatalogReferencesRepository implements CatalogReferenceReader {
  constructor(private readonly prisma: PrismaService) {}

  async findItem(
    catalogKey: string,
    lookup: { readonly by: CatalogItemLookupMode; readonly value: string },
    tx?: TransactionContext,
  ): Promise<CatalogItemRef | null> {
    const where: Prisma.CatalogItemWhereInput =
      lookup.by === 'id' ? { id: lookup.value, catalog: { key: catalogKey } } : { code: lookup.value, catalog: { key: catalogKey } };

    const row = await prismaClientFor(this.prisma, tx).catalogItem.findFirst({
      where,
      select: { id: true, code: true, label: true, isActive: true, metadata: true },
    });

    return row
      ? {
          id: row.id,
          catalogKey,
          code: row.code,
          label: row.label,
          isActive: row.isActive,
          metadata: toMetadata(row.metadata),
        }
      : null;
  }
}

function toMetadata(value: Prisma.JsonValue | null): CatalogItemMetadata | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as CatalogItemMetadata) : null;
}
