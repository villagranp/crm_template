import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type {
  ProductCatalogReader,
  ProductFamilyRecord,
  ProductRecord,
  ProductSearch,
  UnitOfMeasureRecord,
} from '@/modules/products/ports/product-catalog.reader.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, normalizedTextSql } from '../sql-text';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNIT_SELECT = { id: true, code: true, name: true, symbol: true, dimension: true, isActive: true } satisfies Prisma.UnitOfMeasureSelect;

const PRODUCT_SELECT = {
  id: true,
  sku: true,
  description: true,
  isActive: true,
  family: { select: { id: true, code: true, name: true } },
  baseUnit: { select: { id: true, code: true, symbol: true, dimension: true } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

function toProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    sku: row.sku,
    description: row.description,
    family: row.family,
    baseUnit: row.baseUnit,
    isActive: row.isActive,
  };
}

/**
 * Adaptador Prisma del maestro de productos (03 F.4). La búsqueda compara texto
 * normalizado (sin acentos ni mayúsculas) con SQL parametrizado.
 */
@Injectable()
export class PrismaProductCatalogRepository implements ProductCatalogReader {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(search: ProductSearch): Promise<Page<ProductRecord>> {
    const conditions: Prisma.Sql[] = [];
    if (search.search) {
      const pattern = `%${escapeLikePattern(search.search)}%`;
      conditions.push(
        Prisma.sql`(${normalizedTextSql(Prisma.sql`pr.sku`)} LIKE ${pattern} OR ${normalizedTextSql(Prisma.sql`pr.description`)} LIKE ${pattern})`,
      );
    }
    if (search.familyId) conditions.push(Prisma.sql`pr.family_id = ${search.familyId}::uuid`);
    if (search.isActive !== null) conditions.push(Prisma.sql`pr.is_active = ${search.isActive}`);
    const where = andSql(conditions);
    const offset = (search.page - 1) * search.pageSize;

    const [ids, totals] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT pr.id FROM products pr
        WHERE ${where}
        ORDER BY pr.sku ASC, pr.id ASC
        LIMIT ${search.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM products pr WHERE ${where}`,
    ]);
    const rows = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids.map((row) => row.id) } }, select: PRODUCT_SELECT })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids.map((row) => byId.get(row.id)).filter((row): row is ProductRow => row !== undefined).map(toProduct);
    return createPage(items, totals[0]?.total ?? 0, search);
  }

  async listFamilies(): Promise<ProductFamilyRecord[]> {
    return this.prisma.productFamily.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, description: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listUnits(): Promise<UnitOfMeasureRecord[]> {
    return this.prisma.unitOfMeasure.findMany({ where: { isActive: true }, select: UNIT_SELECT, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  }

  async findProduct(productId: string, tx?: TransactionContext): Promise<ProductRecord | null> {
    if (!UUID_PATTERN.test(productId)) return null;
    const row = await prismaClientFor(this.prisma, tx).product.findUnique({ where: { id: productId }, select: PRODUCT_SELECT });
    return row ? toProduct(row) : null;
  }

  async findUnit(unitId: string, tx?: TransactionContext): Promise<UnitOfMeasureRecord | null> {
    if (!UUID_PATTERN.test(unitId)) return null;
    return prismaClientFor(this.prisma, tx).unitOfMeasure.findUnique({ where: { id: unitId }, select: UNIT_SELECT });
  }
}
