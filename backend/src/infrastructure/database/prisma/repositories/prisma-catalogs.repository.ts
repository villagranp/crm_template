import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ResourceConflictError } from '@/common/errors/application-error';
import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type {
  CatalogDetailRecord,
  CatalogItemMetadata,
  CatalogItemRecord,
  CatalogRecord,
  CatalogsRepository,
  CreateCatalogInput,
  ListCatalogsFilter,
  LockedCatalogScope,
  UpdateCatalogInput,
} from '@/modules/catalogs/ports/catalogs.repository.port';

import { PrismaService } from '../prisma.service';

const UNIQUE_VIOLATION = 'P2002';
/**
 * Espera máxima por el bloqueo del catálogo y duración máxima de la unidad de
 * trabajo. La escritura de un elemento son unas pocas sentencias: si se agota,
 * algo va mal y es mejor fallar que retener el bloqueo.
 */
const LOCKED_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

/** Cliente sobre el que se lee: el normal o el de una transacción. */
type Db = Prisma.TransactionClient;

const CATALOG_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { items: true } },
} satisfies Prisma.CatalogSelect;

const ITEM_SELECT = {
  id: true,
  catalogId: true,
  code: true,
  label: true,
  metadata: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CatalogItemSelect;

type CatalogRow = Prisma.CatalogGetPayload<{ select: typeof CATALOG_SELECT }>;
type ItemRow = Prisma.CatalogItemGetPayload<{ select: typeof ITEM_SELECT }>;

function toMetadata(value: Prisma.JsonValue | null): CatalogItemMetadata | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as CatalogItemMetadata) : null;
}

/** `null` se guarda como NULL de base de datos, no como el JSON `null`. */
function toJsonInput(
  value: CatalogItemMetadata | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function toCatalogRecord(row: CatalogRow, activeItemCount: number): CatalogRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    itemCount: row._count.items,
    activeItemCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toItemRecord(row: ItemRow): CatalogItemRecord {
  return { ...row, metadata: toMetadata(row.metadata) };
}

function conflictOnUnique(error: unknown, field: string, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
    throw new ResourceConflictError(message, [{ field, issue: 'duplicated' }]);
  }
  throw error;
}

async function loadCatalogDetail(db: Db, where: Prisma.CatalogWhereUniqueInput): Promise<CatalogDetailRecord | null> {
  const row = await db.catalog.findUnique({
    where,
    select: { ...CATALOG_SELECT, items: { select: ITEM_SELECT, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
  });
  if (!row) {
    return null;
  }
  const items = row.items.map(toItemRecord);
  return { ...toCatalogRecord(row, items.filter((item) => item.isActive).length), items };
}

function lockedScope(tx: Db, catalog: CatalogDetailRecord): LockedCatalogScope {
  return {
    catalog,
    async createItem(input) {
      try {
        const row = await tx.catalogItem.create({
          data: { ...input, catalogId: catalog.id, metadata: toJsonInput(input.metadata) },
          select: ITEM_SELECT,
        });
        return toItemRecord(row);
      } catch (error) {
        return conflictOnUnique(error, 'code', 'An item with this code already exists in the catalog');
      }
    },
    async updateItem(itemId, input) {
      const row = await tx.catalogItem.update({
        where: { id: itemId, catalogId: catalog.id },
        data: { ...input, metadata: toJsonInput(input.metadata) },
        select: ITEM_SELECT,
      });
      return toItemRecord(row);
    },
  };
}

/**
 * Adaptador Prisma de catálogos (ADR-004). Sin reglas de negocio. No expone
 * borrado de elementos: los elementos solo se desactivan (D9).
 */
@Injectable()
export class PrismaCatalogsRepository implements CatalogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ListCatalogsFilter): Promise<Page<CatalogRecord>> {
    const where: Prisma.CatalogWhereInput = {
      ...(filter.isSystem !== undefined ? { isSystem: filter.isSystem } : {}),
      ...(filter.search
        ? {
            OR: [
              { key: { contains: filter.search, mode: 'insensitive' } },
              { name: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const sortBy = filter.sortBy ?? 'name';
    const sortOrder = filter.sortOrder ?? 'asc';

    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.catalog.findMany({
        where,
        select: CATALOG_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.catalog.count({ where }),
    ]);

    const activeCounts = await this.activeItemCounts(rows.map((row) => row.id));
    return createPage(
      rows.map((row) => toCatalogRecord(row, activeCounts.get(row.id) ?? 0)),
      totalItems,
      filter,
    );
  }

  findById(catalogId: string): Promise<CatalogDetailRecord | null> {
    return loadCatalogDetail(this.prisma, { id: catalogId });
  }

  findByKey(key: string): Promise<CatalogDetailRecord | null> {
    return loadCatalogDetail(this.prisma, { key });
  }

  async existsByKey(key: string): Promise<boolean> {
    return (await this.prisma.catalog.count({ where: { key } })) > 0;
  }

  async create(input: CreateCatalogInput): Promise<string> {
    try {
      const catalog = await this.prisma.catalog.create({ data: { ...input, isSystem: false }, select: { id: true } });
      return catalog.id;
    } catch (error) {
      return conflictOnUnique(error, 'key', 'A catalog with this key already exists');
    }
  }

  async update(catalogId: string, input: UpdateCatalogInput): Promise<void> {
    try {
      await this.prisma.catalog.update({ where: { id: catalogId }, data: input });
    } catch (error) {
      conflictOnUnique(error, 'key', 'A catalog with this key already exists');
    }
  }

  async delete(catalogId: string): Promise<void> {
    // La condición `items: none` en la misma sentencia evita que la cascada se
    // lleve un elemento creado entre la comprobación del servicio y el borrado.
    await this.prisma.catalog.deleteMany({ where: { id: catalogId, items: { none: {} } } });
  }

  async withLockedCatalog<T>(catalogId: string, work: (scope: LockedCatalogScope) => Promise<T>): Promise<T | null> {
    return this.prisma.$transaction(async (tx) => {
      // Bloqueo de fila: serializa las escrituras de elementos del mismo catálogo
      // hasta el COMMIT. Los lectores no se bloquean (MVCC).
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalogs WHERE id = ${catalogId}::uuid FOR UPDATE`;
      if (locked.length === 0) {
        return null;
      }
      const catalog = await loadCatalogDetail(tx, { id: catalogId });
      if (!catalog) {
        return null;
      }
      return work(lockedScope(tx, catalog));
    }, LOCKED_TRANSACTION_OPTIONS);
  }

  private async activeItemCounts(catalogIds: string[]): Promise<Map<string, number>> {
    if (catalogIds.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.catalogItem.groupBy({
      by: ['catalogId'],
      where: { catalogId: { in: catalogIds }, isActive: true },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.catalogId, group._count._all]));
  }
}
