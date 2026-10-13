import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import type {
  CreateProjectProductInput,
  DuplicableProjectProduct,
  ProjectProductListRequest,
  ProjectProductRecord,
  ProjectProductsRepository,
  ProjectProductTotalsRow,
  ProjectProductWrite,
} from '@/modules/projects/ports/project-products.repository.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUANTITY_DECIMALS = 4;
const FACTOR_DECIMALS = 8;

const PROJECT_PRODUCT_SELECT = {
  id: true,
  projectId: true,
  quantity: true,
  conversionFactor: true,
  tonnage: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
  product: { select: { id: true, sku: true, description: true, isActive: true, family: { select: { id: true, code: true, name: true } } } },
  opportunity: { select: { id: true, code: true } },
  unit: { select: { id: true, code: true, symbol: true, dimension: true, isActive: true } },
  conversionRule: { select: { id: true, scope: true } },
  status: { select: { id: true, code: true, label: true, isActive: true, metadata: true } },
} satisfies Prisma.ProjectProductSelect;

type ProjectProductRow = Prisma.ProjectProductGetPayload<{ select: typeof PROJECT_PRODUCT_SELECT }>;

/** `metadata.isActive` de `crm.estado_producto_asociado` (suma en totales, RN-03.60). */
function countsInTotals(metadata: Prisma.JsonValue | null): boolean {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) && metadata['isActive'] === true;
}

function toRecord(row: ProjectProductRow, names: ReadonlyMap<string, string>): ProjectProductRecord {
  const updatedByName = row.updatedById ? names.get(row.updatedById) : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    product: row.product,
    opportunity: row.opportunity,
    quantity: row.quantity.toFixed(QUANTITY_DECIMALS),
    unit: row.unit,
    conversion:
      row.conversionRule && row.conversionFactor
        ? { ruleId: row.conversionRule.id, scope: row.conversionRule.scope, factor: row.conversionFactor.toFixed(FACTOR_DECIMALS) }
        : null,
    tonnage: row.tonnage === null ? null : row.tonnage.toFixed(QUANTITY_DECIMALS),
    status: {
      id: row.status.id,
      code: row.status.code,
      label: row.status.label,
      isActive: row.status.isActive,
      countsInTotals: countsInTotals(row.status.metadata),
    },
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedById && updatedByName !== undefined ? { id: row.updatedById, displayName: updatedByName } : null,
  };
}

/** Solo las columnas presentes (una edición no reescribe lo que no cambia). */
function writeData(input: Partial<ProjectProductWrite>): Prisma.ProjectProductUncheckedUpdateManyInput {
  const data: Prisma.ProjectProductUncheckedUpdateManyInput = {};
  if (input.opportunityId !== undefined) data.opportunityId = input.opportunityId;
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.unitId !== undefined) data.unitId = input.unitId;
  if (input.conversionRuleId !== undefined) data.conversionRuleId = input.conversionRuleId;
  if (input.conversionFactor !== undefined) data.conversionFactor = input.conversionFactor;
  if (input.tonnage !== undefined) data.tonnage = input.tonnage;
  if (input.statusId !== undefined) data.statusId = input.statusId;
  if (input.notes !== undefined) data.notes = input.notes;
  return data;
}

/**
 * Adaptador Prisma de productos asociados (03 §L.1). Todo se acota al proyecto:
 * `WHERE project_id = :projectId AND id = :projectProductId` (sin IDOR).
 */
@Injectable()
export class PrismaProjectProductsRepository implements ProjectProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(projectId: string, request: ProjectProductListRequest): Promise<Page<ProjectProductRecord>> {
    const where: Prisma.ProjectProductWhereInput = { projectId, deletedAt: null };
    const direction = request.sortOrder;
    const orderBy: Prisma.ProjectProductOrderByWithRelationInput[] =
      request.sortBy === 'sku'
        ? [{ product: { sku: direction } }, { createdAt: 'asc' }, { id: 'asc' }]
        : [{ [request.sortBy]: direction }, { id: 'asc' }];
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.projectProduct.findMany({
        where,
        select: PROJECT_PRODUCT_SELECT,
        orderBy,
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
      }),
      this.prisma.projectProduct.count({ where }),
    ]);
    const names = await this.userNames(rows.map((row) => row.updatedById));
    return createPage(
      rows.map((row) => toRecord(row, names)),
      totalItems,
      request,
    );
  }

  async totalsRows(projectId: string): Promise<ProjectProductTotalsRow[]> {
    const rows = await this.prisma.projectProduct.findMany({
      where: { projectId, deletedAt: null },
      select: {
        quantity: true,
        tonnage: true,
        unit: { select: { id: true, code: true, symbol: true, dimension: true } },
        status: { select: { metadata: true } },
      },
    });
    return rows.map((row) => ({
      quantity: row.quantity.toFixed(QUANTITY_DECIMALS),
      unit: row.unit,
      tonnage: row.tonnage === null ? null : row.tonnage.toFixed(QUANTITY_DECIMALS),
      statusCountsInTotals: countsInTotals(row.status.metadata),
    }));
  }

  async findById(projectId: string, projectProductId: string, tx?: TransactionContext): Promise<ProjectProductRecord | null> {
    if (!UUID_PATTERN.test(projectProductId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const row = await db.projectProduct.findFirst({ where: { id: projectProductId, projectId, deletedAt: null }, select: PROJECT_PRODUCT_SELECT });
    if (!row) return null;
    const names = await this.userNames([row.updatedById], tx);
    return toRecord(row, names);
  }

  async findActiveDuplicate(
    key: { readonly projectId: string; readonly opportunityId: string | null; readonly productId: string; readonly excludeId: string | null },
    tx: TransactionContext,
  ): Promise<{ id: string; productId: string; opportunityId: string | null } | null> {
    return prismaClientFor(this.prisma, tx).projectProduct.findFirst({
      where: {
        projectId: key.projectId,
        productId: key.productId,
        opportunityId: key.opportunityId,
        deletedAt: null,
        ...(key.excludeId ? { NOT: { id: key.excludeId } } : {}),
      },
      select: { id: true, productId: true, opportunityId: true },
    });
  }

  async opportunityBelongsToProject(projectId: string, opportunityId: string, tx?: TransactionContext): Promise<boolean> {
    if (!UUID_PATTERN.test(opportunityId)) return false;
    const row = await prismaClientFor(this.prisma, tx).opportunity.findFirst({
      where: { id: opportunityId, projectId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  async create(input: CreateProjectProductInput, tx: TransactionContext): Promise<string> {
    const created = await prismaClientFor(this.prisma, tx).projectProduct.create({
      data: {
        projectId: input.projectId,
        productId: input.productId,
        opportunityId: input.opportunityId,
        quantity: input.quantity,
        unitId: input.unitId,
        conversionRuleId: input.conversionRuleId,
        conversionFactor: input.conversionFactor,
        tonnage: input.tonnage,
        statusId: input.statusId,
        notes: input.notes,
        createdById: input.createdById,
        updatedById: input.createdById,
      },
      select: { id: true },
    });
    return created.id;
  }

  async update(projectId: string, projectProductId: string, input: Partial<ProjectProductWrite>, actorId: string | null, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).projectProduct.updateMany({
      where: { id: projectProductId, projectId, deletedAt: null },
      data: { ...writeData(input), updatedById: actorId },
    });
  }

  async softDelete(projectId: string, projectProductId: string, actorId: string | null, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).projectProduct.updateMany({
      where: { id: projectProductId, projectId, deletedAt: null },
      data: { deletedAt: new Date(), updatedById: actorId },
    });
  }

  async countOtherActive(projectId: string, productId: string, excludeId: string, tx: TransactionContext): Promise<number> {
    return prismaClientFor(this.prisma, tx).projectProduct.count({ where: { projectId, productId, deletedAt: null, NOT: { id: excludeId } } });
  }

  async forecastPeriodsWithQuantity(projectId: string, productId: string, periods: readonly YearMonth[], tx: TransactionContext): Promise<YearMonth[]> {
    if (periods.length === 0) return [];
    const rows = await prismaClientFor(this.prisma, tx).forecastLine.findMany({
      where: { projectId, productId, quantity: { gt: 0 }, OR: periods.map((period) => ({ year: period.year, month: period.month })) },
      select: { year: true, month: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    return rows;
  }

  async listDuplicable(projectId: string): Promise<DuplicableProjectProduct[]> {
    const rows = await this.prisma.projectProduct.findMany({
      where: { projectId, deletedAt: null },
      select: { productId: true, quantity: true, unitId: true, product: { select: { isActive: true } }, unit: { select: { isActive: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      productId: row.productId,
      productActive: row.product.isActive,
      unitId: row.unitId,
      unitActive: row.unit.isActive,
      quantity: row.quantity.toFixed(QUANTITY_DECIMALS),
    }));
  }

  private async userNames(ids: readonly (string | null)[], tx?: TransactionContext): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const users = await prismaClientFor(this.prisma, tx).user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}
