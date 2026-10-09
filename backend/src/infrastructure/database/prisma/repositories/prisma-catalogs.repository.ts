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
  CreateCatalogItemInput,
  ListCatalogsFilter,
  UpdateCatalogInput,
  UpdateCatalogItemInput,
} from '@/modules/catalogs/ports/catalogs.repository.port';

import { PrismaService } from '../prisma.service';

const UNIQUE_VIOLATION = 'P2002';

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

  async findById(catalogId: string): Promise<CatalogDetailRecord | null> {
    const row = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { ...CATALOG_SELECT, items: { select: ITEM_SELECT, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
    });
    if (!row) {
      return null;
    }
    const items = row.items.map(toItemRecord);
    return { ...toCatalogRecord(row, items.filter((item) => item.isActive).length), items };
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

  async findItem(catalogId: string, itemId: string): Promise<CatalogItemRecord | null> {
    const row = await this.prisma.catalogItem.findFirst({ where: { id: itemId, catalogId }, select: ITEM_SELECT });
    return row ? toItemRecord(row) : null;
  }

  async existsItemCode(catalogId: string, code: string): Promise<boolean> {
    return (await this.prisma.catalogItem.count({ where: { catalogId, code } })) > 0;
  }

  async maxItemSortOrder(catalogId: string): Promise<number | null> {
    const result = await this.prisma.catalogItem.aggregate({ where: { catalogId }, _max: { sortOrder: true } });
    return result._max.sortOrder;
  }

  async createItem(input: CreateCatalogItemInput): Promise<CatalogItemRecord> {
    try {
      const row = await this.prisma.catalogItem.create({
        data: { ...input, metadata: toJsonInput(input.metadata) },
        select: ITEM_SELECT,
      });
      return toItemRecord(row);
    } catch (error) {
      return conflictOnUnique(error, 'code', 'An item with this code already exists in the catalog');
    }
  }

  async updateItem(itemId: string, input: UpdateCatalogItemInput): Promise<CatalogItemRecord> {
    const row = await this.prisma.catalogItem.update({
      where: { id: itemId },
      data: { ...input, metadata: toJsonInput(input.metadata) },
      select: ITEM_SELECT,
    });
    return toItemRecord(row);
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
