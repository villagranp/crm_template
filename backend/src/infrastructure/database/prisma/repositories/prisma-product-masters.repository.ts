import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type {
  ConversionRuleDetailRecord,
  CreateFamilyInput,
  CreateProductInput,
  CreateRuleInput,
  CreateUnitInput,
  FamilySortField,
  MasterSearch,
  MasterWriteResult,
  ProductDetailRecord,
  ProductFamilyDetailRecord,
  ProductMastersRepository,
  RuleSearch,
  RuleSortField,
  UnitOfMeasureDetailRecord,
  UnitSortField,
  UpdateFamilyInput,
  UpdateProductInput,
  UpdateRuleInput,
  UpdateUnitInput,
} from '@/modules/products/ports/product-masters.repository.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, normalizedTextSql } from '../sql-text';

const UNIQUE_VIOLATION = 'P2002';
const FACTOR_DECIMALS = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FAMILY_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductFamilySelect;

const UNIT_SELECT = {
  id: true,
  code: true,
  name: true,
  symbol: true,
  dimension: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UnitOfMeasureSelect;

const PRODUCT_SELECT = {
  id: true,
  sku: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  family: { select: { id: true, code: true, name: true } },
  baseUnit: { select: { id: true, code: true, symbol: true, dimension: true } },
} satisfies Prisma.ProductSelect;

const UNIT_REF_SELECT = { id: true, code: true, symbol: true, dimension: true } satisfies Prisma.UnitOfMeasureSelect;

const RULE_SELECT = {
  id: true,
  factor: true,
  scope: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  fromUnit: { select: UNIT_REF_SELECT },
  toUnit: { select: UNIT_REF_SELECT },
  product: { select: { id: true, sku: true, description: true } },
  productFamily: { select: { id: true, code: true, name: true } },
  projectType: { select: { id: true, code: true, label: true } },
} satisfies Prisma.UnitConversionRuleSelect;

type RuleRow = Prisma.UnitConversionRuleGetPayload<{ select: typeof RULE_SELECT }>;

/** Columnas de orden de cada lista blanca (nunca texto del usuario en el SQL). */
const FAMILY_SORT_SQL: Record<FamilySortField, string> = {
  code: 'f.code',
  name: 'f.name',
  sortOrder: 'f.sort_order',
  createdAt: 'f.created_at',
  updatedAt: 'f.updated_at',
};
const UNIT_SORT_SQL: Record<UnitSortField, string> = { code: 'u.code', name: 'u.name', sortOrder: 'u.sort_order', dimension: 'u.dimension' };
const RULE_SORT_SQL: Record<RuleSortField, string> = {
  createdAt: 'r.created_at',
  updatedAt: 'r.updated_at',
  scope: 'r.scope',
  factor: 'r.factor',
};

function orderSql(column: string | undefined, direction: 'asc' | 'desc' | undefined, natural: string, idColumn: string): Prisma.Sql {
  const primary = column ? `${column} ${direction === 'desc' ? 'DESC' : 'ASC'}, ` : '';
  return Prisma.raw(`${primary}${natural}, ${idColumn} ASC`);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

function toRule(row: RuleRow): ConversionRuleDetailRecord {
  return {
    id: row.id,
    fromUnit: row.fromUnit,
    toUnit: row.toUnit,
    factor: row.factor.toFixed(FACTOR_DECIMALS),
    scope: row.scope,
    product: row.product,
    productFamily: row.productFamily,
    projectType: row.projectType,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Filas en el orden de `ids` (la consulta de ids decide orden y página). */
function inOrder<T extends { id: string }>(ids: readonly { id: string }[], rows: readonly T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((row) => byId.get(row.id)).filter((row): row is T => row !== undefined);
}

/**
 * Adaptador Prisma del mantenimiento de maestros comerciales (07 F.7; 00 §2.3). Las
 * listas eligen ids con SQL parametrizado (búsqueda sin acentos ni mayúsculas, como
 * `GET /products`) y luego cargan las filas; los únicos de la base (`code`, `sku`,
 * `uq_unit_conversion_rules_from_to_scope`) se traducen a `DUPLICATE`.
 */
@Injectable()
export class PrismaProductMastersRepository implements ProductMastersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Familias
  // ---------------------------------------------------------------------------

  async searchFamilies(search: MasterSearch<FamilySortField>): Promise<Page<ProductFamilyDetailRecord>> {
    const conditions: Prisma.Sql[] = [];
    if (search.search) {
      const pattern = `%${escapeLikePattern(search.search)}%`;
      conditions.push(Prisma.sql`(${normalizedTextSql(Prisma.sql`f.code`)} LIKE ${pattern} OR ${normalizedTextSql(Prisma.sql`f.name`)} LIKE ${pattern})`);
    }
    if (search.isActive !== null) conditions.push(Prisma.sql`f.is_active = ${search.isActive}`);
    const where = andSql(conditions);
    const order = orderSql(search.sortBy ? FAMILY_SORT_SQL[search.sortBy] : undefined, search.sortOrder, 'f.sort_order ASC, f.name ASC', 'f.id');
    const [ids, totals] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT f.id FROM product_families f WHERE ${where} ORDER BY ${order}
        LIMIT ${search.pageSize} OFFSET ${(search.page - 1) * search.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM product_families f WHERE ${where}`,
    ]);
    const rows = ids.length ? await this.prisma.productFamily.findMany({ where: { id: { in: ids.map((row) => row.id) } }, select: FAMILY_SELECT }) : [];
    return createPage(inOrder(ids, rows), totals[0]?.total ?? 0, search);
  }

  async findFamily(id: string, tx?: TransactionContext): Promise<ProductFamilyDetailRecord | null> {
    if (!UUID_PATTERN.test(id)) return null;
    return prismaClientFor(this.prisma, tx).productFamily.findUnique({ where: { id }, select: FAMILY_SELECT });
  }

  async createFamily(input: CreateFamilyInput, actorId: string | null): Promise<MasterWriteResult<ProductFamilyDetailRecord>> {
    try {
      const record = await this.prisma.productFamily.create({
        data: { ...input, createdById: actorId, updatedById: actorId },
        select: FAMILY_SELECT,
      });
      return { ok: true, record };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE' };
      throw error;
    }
  }

  async updateFamily(id: string, input: UpdateFamilyInput, actorId: string | null): Promise<ProductFamilyDetailRecord | null> {
    const result = await this.prisma.productFamily.updateMany({ where: { id }, data: { ...input, updatedById: actorId } });
    return result.count === 0 ? null : this.findFamily(id);
  }

  // ---------------------------------------------------------------------------
  // Unidades
  // ---------------------------------------------------------------------------

  async searchUnits(search: MasterSearch<UnitSortField>): Promise<Page<UnitOfMeasureDetailRecord>> {
    const conditions: Prisma.Sql[] = [];
    if (search.search) {
      const pattern = `%${escapeLikePattern(search.search)}%`;
      conditions.push(
        Prisma.sql`(${normalizedTextSql(Prisma.sql`u.code`)} LIKE ${pattern} OR ${normalizedTextSql(Prisma.sql`u.name`)} LIKE ${pattern} OR ${normalizedTextSql(Prisma.sql`u.symbol`)} LIKE ${pattern})`,
      );
    }
    if (search.isActive !== null) conditions.push(Prisma.sql`u.is_active = ${search.isActive}`);
    const where = andSql(conditions);
    const order = orderSql(search.sortBy ? UNIT_SORT_SQL[search.sortBy] : undefined, search.sortOrder, 'u.sort_order ASC, u.code ASC', 'u.id');
    const [ids, totals] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM units_of_measure u WHERE ${where} ORDER BY ${order}
        LIMIT ${search.pageSize} OFFSET ${(search.page - 1) * search.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM units_of_measure u WHERE ${where}`,
    ]);
    const rows = ids.length ? await this.prisma.unitOfMeasure.findMany({ where: { id: { in: ids.map((row) => row.id) } }, select: UNIT_SELECT }) : [];
    return createPage(inOrder(ids, rows), totals[0]?.total ?? 0, search);
  }

  async findUnit(id: string, tx?: TransactionContext): Promise<UnitOfMeasureDetailRecord | null> {
    if (!UUID_PATTERN.test(id)) return null;
    return prismaClientFor(this.prisma, tx).unitOfMeasure.findUnique({ where: { id }, select: UNIT_SELECT });
  }

  async createUnit(input: CreateUnitInput): Promise<MasterWriteResult<UnitOfMeasureDetailRecord>> {
    try {
      return { ok: true, record: await this.prisma.unitOfMeasure.create({ data: input, select: UNIT_SELECT }) };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE' };
      throw error;
    }
  }

  async updateUnit(id: string, input: UpdateUnitInput): Promise<UnitOfMeasureDetailRecord | null> {
    const result = await this.prisma.unitOfMeasure.updateMany({ where: { id }, data: input });
    return result.count === 0 ? null : this.findUnit(id);
  }

  async isUnitReferenced(id: string): Promise<boolean> {
    if (!UUID_PATTERN.test(id)) return false;
    const rows = await this.prisma.$queryRaw<{ referenced: boolean }[]>`
      SELECT (
           EXISTS (SELECT 1 FROM products WHERE base_unit_id = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM unit_conversion_rules WHERE from_unit_id = ${id}::uuid OR to_unit_id = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM projects WHERE measure_unit_id = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM project_products WHERE unit_id = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM forecast_lines WHERE unit_id = ${id}::uuid)
      ) AS referenced`;
    return rows[0]?.referenced === true;
  }

  // ---------------------------------------------------------------------------
  // Productos
  // ---------------------------------------------------------------------------

  async findProduct(id: string): Promise<ProductDetailRecord | null> {
    if (!UUID_PATTERN.test(id)) return null;
    return this.prisma.product.findUnique({ where: { id }, select: PRODUCT_SELECT });
  }

  async createProduct(input: CreateProductInput, actorId: string | null): Promise<MasterWriteResult<ProductDetailRecord>> {
    try {
      const record = await this.prisma.product.create({ data: { ...input, createdById: actorId, updatedById: actorId }, select: PRODUCT_SELECT });
      return { ok: true, record };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE' };
      throw error;
    }
  }

  async updateProduct(id: string, input: UpdateProductInput, actorId: string | null): Promise<MasterWriteResult<ProductDetailRecord> | null> {
    try {
      const result = await this.prisma.product.updateMany({ where: { id }, data: { ...input, updatedById: actorId } });
      if (result.count === 0) return null;
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE' };
      throw error;
    }
    const record = await this.findProduct(id);
    return record ? { ok: true, record } : null;
  }

  // ---------------------------------------------------------------------------
  // Reglas de conversión
  // ---------------------------------------------------------------------------

  async searchRules(search: RuleSearch): Promise<Page<ConversionRuleDetailRecord>> {
    const conditions: Prisma.Sql[] = [];
    if (search.search) {
      const pattern = `%${escapeLikePattern(search.search)}%`;
      conditions.push(
        Prisma.sql`(${normalizedTextSql(Prisma.sql`COALESCE(r.description, '')`)} LIKE ${pattern} OR ${normalizedTextSql(Prisma.sql`fu.code`)} LIKE ${pattern} OR ${normalizedTextSql(Prisma.sql`fu.name`)} LIKE ${pattern})`,
      );
    }
    if (search.isActive !== null) conditions.push(Prisma.sql`r.is_active = ${search.isActive}`);
    if (search.scope) conditions.push(Prisma.sql`r.scope = ${search.scope}::conversion_scope`);
    if (search.fromUnitId) conditions.push(Prisma.sql`r.from_unit_id = ${search.fromUnitId}::uuid`);
    const where = andSql(conditions);
    const order = orderSql(search.sortBy ? RULE_SORT_SQL[search.sortBy] : undefined, search.sortOrder, 'fu.code ASC, r.scope ASC, r.created_at ASC', 'r.id');
    const [ids, totals] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT r.id FROM unit_conversion_rules r JOIN units_of_measure fu ON fu.id = r.from_unit_id
        WHERE ${where} ORDER BY ${order}
        LIMIT ${search.pageSize} OFFSET ${(search.page - 1) * search.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM unit_conversion_rules r JOIN units_of_measure fu ON fu.id = r.from_unit_id WHERE ${where}`,
    ]);
    const rows = ids.length ? await this.prisma.unitConversionRule.findMany({ where: { id: { in: ids.map((row) => row.id) } }, select: RULE_SELECT }) : [];
    return createPage(inOrder(ids, rows).map(toRule), totals[0]?.total ?? 0, search);
  }

  async findRule(id: string): Promise<ConversionRuleDetailRecord | null> {
    if (!UUID_PATTERN.test(id)) return null;
    const row = await this.prisma.unitConversionRule.findUnique({ where: { id }, select: RULE_SELECT });
    return row ? toRule(row) : null;
  }

  async createRule(input: CreateRuleInput, actorId: string | null): Promise<MasterWriteResult<ConversionRuleDetailRecord>> {
    try {
      const row = await this.prisma.unitConversionRule.create({
        data: { ...input, createdById: actorId, updatedById: actorId },
        select: RULE_SELECT,
      });
      return { ok: true, record: toRule(row) };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE' };
      throw error;
    }
  }

  async updateRule(id: string, input: UpdateRuleInput, actorId: string | null): Promise<ConversionRuleDetailRecord | null> {
    const result = await this.prisma.unitConversionRule.updateMany({ where: { id }, data: { ...input, updatedById: actorId } });
    return result.count === 0 ? null : this.findRule(id);
  }
}
