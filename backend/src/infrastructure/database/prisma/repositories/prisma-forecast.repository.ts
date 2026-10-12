import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { roundDecimal } from '@/common/decimal';
import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import type {
  ForecastAssociationUnit,
  ForecastCriteria,
  ForecastLineKey,
  ForecastLineRecord,
  ForecastLineWrite,
  ForecastPair,
  ForecastProjectRecord,
  ForecastRepository,
  ForecastRowQuery,
  ForecastRowRecord,
  ForecastTotalsGroup,
  ForecastUnitRecord,
} from '@/modules/forecast/ports/forecast.repository.port';
import type { UnitDimensionCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, normalizedTextSql, uuidInSql } from '../sql-text';
import { projectVisibilitySql, projectVisibilityWhere } from './prisma-projects.repository';

const QUANTITY_DECIMALS = 4;
const FACTOR_DECIMALS = 8;

const LINE_SELECT = {
  id: true,
  projectId: true,
  productId: true,
  year: true,
  month: true,
  quantity: true,
  conversionFactor: true,
  tonnage: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
  unit: { select: { id: true, code: true, symbol: true, dimension: true, isActive: true } },
  conversionRule: { select: { id: true, scope: true } },
  owner: { select: { id: true, displayName: true } },
} satisfies Prisma.ForecastLineSelect;

type LineRow = Prisma.ForecastLineGetPayload<{ select: typeof LINE_SELECT }>;

interface RowHeaderRow {
  project_id: string;
  product_id: string;
  project_code: string;
  project_name: string;
  owner_id: string;
  owner_name: string;
  country_id: string;
  project_type_id: string | null;
  project_visible: boolean;
  sku: string;
  description: string;
  family_id: string;
  family_code: string;
  family_name: string;
  unit_id: string;
  unit_code: string;
  unit_symbol: string;
  unit_dimension: string;
  last_updated_at: Date | null;
}

interface TotalsRow {
  year: number;
  month: number;
  unit_id: string;
  unit_code: string;
  unit_symbol: string;
  unit_dimension: string;
  quantity: string;
  tonnage: string | null;
  lines: number;
  without_conversion: number;
}

function toLineRecord(row: LineRow, names: ReadonlyMap<string, string>): ForecastLineRecord {
  const updatedByName = row.updatedById ? names.get(row.updatedById) : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    productId: row.productId,
    year: row.year,
    month: row.month,
    quantity: row.quantity.toFixed(QUANTITY_DECIMALS),
    unit: row.unit,
    conversion:
      row.conversionRule && row.conversionFactor
        ? { ruleId: row.conversionRule.id, scope: row.conversionRule.scope, factor: row.conversionFactor.toFixed(FACTOR_DECIMALS) }
        : null,
    tonnage: row.tonnage === null ? null : row.tonnage.toFixed(QUANTITY_DECIMALS),
    owner: row.owner,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedById && updatedByName !== undefined ? { id: row.updatedById, displayName: updatedByName } : null,
  };
}

/** `(year * 12 + month) = ANY(…)`, o `FALSE` sin períodos. */
function periodsSql(alias: Prisma.Sql, periods: readonly YearMonth[]): Prisma.Sql {
  if (periods.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`(${alias}.year * 12 + ${alias}.month) = ANY(${periods.map((period) => period.year * 12 + period.month)}::int[])`;
}

/** Línea visible (H.1): proyecto visible, o línea cuyo asesor está en el alcance. El proyecto (`p`) no eliminado lo exige quien llama. */
function lineVisibilitySql(scope: VisibilityScope): Prisma.Sql {
  if (scope.kind === 'ALL') return Prisma.sql`TRUE`;
  return Prisma.sql`(${projectVisibilitySql('p', scope)} OR ${uuidInSql(Prisma.sql`fl.owner_id`, scope.ownerIds)})`;
}

/** Filtros de par que se pueden aplicar en cada rama (`alias.project_id`, `alias.product_id`). */
function pairFilterSql(alias: Prisma.Sql, criteria: ForecastCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (criteria.projectIds.length > 0) conditions.push(uuidInSql(Prisma.sql`${alias}.project_id`, criteria.projectIds));
  if (criteria.productIds.length > 0) conditions.push(uuidInSql(Prisma.sql`${alias}.product_id`, criteria.productIds));
  return andSql(conditions);
}

/**
 * CTE de la matriz (03 H.1, DM-13):
 *
 * - `scoped_lines`: líneas visibles de los períodos consultados (proyecto no eliminado y
 *   visible, o asesor de la línea en el alcance).
 * - `pairs`: pares con asociación activa en un proyecto visible ∪ pares de `scoped_lines`.
 *   `UNION` elimina repetidos: un par es una fila.
 */
function pairsCte(criteria: ForecastCriteria, scope: VisibilityScope): Prisma.Sql {
  return Prisma.sql`
    WITH scoped_lines AS (
      SELECT fl.id, fl.project_id, fl.product_id, fl.year, fl.month, fl.quantity, fl.tonnage, fl.unit_id, fl.owner_id, fl.updated_at
      FROM forecast_lines fl
      JOIN projects p ON p.id = fl.project_id
      WHERE p.deleted_at IS NULL
        AND ${periodsSql(Prisma.sql`fl`, criteria.periods)}
        AND ${lineVisibilitySql(scope)}
        AND ${pairFilterSql(Prisma.sql`fl`, criteria)}
    ),
    pairs AS (
      SELECT pp.project_id, pp.product_id
      FROM project_products pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND ${projectVisibilitySql('p', scope)}
        AND ${pairFilterSql(Prisma.sql`pp`, criteria)}
      UNION
      SELECT project_id, product_id FROM scoped_lines
    )`;
}

/** Filtros de la fila sobre `pairs x` + `projects p` + `products pr` (búsqueda y asesor). */
function rowConditions(criteria: ForecastCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (criteria.search) {
    const pattern = `%${escapeLikePattern(criteria.search)}%`;
    conditions.push(Prisma.sql`(${normalizedTextSql(Prisma.sql`p.name`)} LIKE ${pattern} OR lower(p.code) LIKE ${pattern} OR lower(pr.sku) LIKE ${pattern})`);
  }
  if (criteria.ownerIds.length > 0) {
    // Asesor del proyecto o de alguna línea visible del par (sin JOIN que multiplique filas).
    conditions.push(Prisma.sql`(
      ${uuidInSql(Prisma.sql`p.owner_id`, criteria.ownerIds)}
      OR EXISTS (
        SELECT 1 FROM scoped_lines so
        WHERE so.project_id = x.project_id AND so.product_id = x.product_id AND ${uuidInSql(Prisma.sql`so.owner_id`, criteria.ownerIds)}
      )
    )`);
  }
  return andSql(conditions);
}

function orderBySql(query: ForecastRowQuery): Prisma.Sql {
  const direction = Prisma.raw(query.sortOrder === 'desc' ? 'DESC' : 'ASC');
  switch (query.sortBy) {
    case 'productSku':
      return Prisma.sql`pr.sku ${direction}, p.code ASC, p.id ASC, pr.id ASC`;
    case 'updatedAt':
      return Prisma.sql`lu.last_updated_at ${direction} NULLS LAST, p.code ASC, pr.sku ASC, p.id ASC, pr.id ASC`;
    case 'projectCode':
    default:
      return Prisma.sql`p.code ${direction}, pr.sku ASC, p.id ASC, pr.id ASC`;
  }
}

/** `(a, b) IN (SELECT * FROM unnest(…))` para pares. */
function pairsInSql(projectColumn: Prisma.Sql, productColumn: Prisma.Sql, pairs: readonly ForecastPair[]): Prisma.Sql {
  if (pairs.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`(${projectColumn}, ${productColumn}) IN (
    SELECT * FROM unnest(${pairs.map((pair) => pair.projectId)}::uuid[], ${pairs.map((pair) => pair.productId)}::uuid[]))`;
}

/**
 * Adaptador Prisma del forecast (03 §L.1). Lecturas de la matriz en SQL parametrizado
 * (sin `Unsafe`); las sumas de totales en `numeric` (exactas). Nunca borra líneas.
 */
@Injectable()
export class PrismaForecastRepository implements ForecastRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRows(query: ForecastRowQuery, scope: VisibilityScope): Promise<Page<ForecastRowRecord>> {
    const cte = pairsCte(query, scope);
    const where = rowConditions(query);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<RowHeaderRow[]>`
        ${cte}
        SELECT x.project_id, x.product_id, p.code AS project_code, p.name AS project_name, p.owner_id, u.display_name AS owner_name,
               p.country_id, p.project_type_id, (${projectVisibilitySql('p', scope)}) AS project_visible,
               pr.sku, pr.description, f.id AS family_id, f.code AS family_code, f.name AS family_name,
               du.id AS unit_id, du.code AS unit_code, du.symbol AS unit_symbol, du.dimension::text AS unit_dimension,
               lu.last_updated_at
        FROM pairs x
        JOIN projects p ON p.id = x.project_id
        JOIN users u ON u.id = p.owner_id
        JOIN products pr ON pr.id = x.product_id
        JOIN product_families f ON f.id = pr.family_id
        LEFT JOIN LATERAL (
          SELECT pp.unit_id FROM project_products pp
          WHERE pp.project_id = x.project_id AND pp.product_id = x.product_id AND pp.deleted_at IS NULL
          ORDER BY (pp.opportunity_id IS NULL) DESC, pp.created_at ASC, pp.id ASC
          LIMIT 1
        ) da ON TRUE
        JOIN units_of_measure du ON du.id = COALESCE(da.unit_id, pr.base_unit_id)
        LEFT JOIN LATERAL (
          SELECT MAX(sl.updated_at) AS last_updated_at FROM scoped_lines sl
          WHERE sl.project_id = x.project_id AND sl.product_id = x.product_id
        ) lu ON TRUE
        WHERE ${where}
        ORDER BY ${orderBySql(query)}
        LIMIT ${query.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        ${cte}
        SELECT COUNT(*)::int AS total
        FROM pairs x
        JOIN projects p ON p.id = x.project_id
        JOIN products pr ON pr.id = x.product_id
        WHERE ${where}`,
    ]);

    const items: ForecastRowRecord[] = rows.map((row) => ({
      project: {
        id: row.project_id,
        code: row.project_code,
        name: row.project_name,
        owner: { id: row.owner_id, displayName: row.owner_name },
        countryId: row.country_id,
        projectTypeId: row.project_type_id,
        visible: row.project_visible,
      },
      product: {
        id: row.product_id,
        sku: row.sku,
        description: row.description,
        family: { id: row.family_id, code: row.family_code, name: row.family_name },
      },
      defaultUnit: { id: row.unit_id, code: row.unit_code, symbol: row.unit_symbol, dimension: row.unit_dimension as UnitDimensionCode },
      lastUpdatedAt: row.last_updated_at,
    }));
    return createPage(items, totals[0]?.total ?? 0, query);
  }

  async listLines(pairs: readonly ForecastPair[], periods: readonly YearMonth[], scope: VisibilityScope): Promise<ForecastLineRecord[]> {
    if (pairs.length === 0 || periods.length === 0) return [];
    const visibility: Prisma.ForecastLineWhereInput =
      scope.kind === 'ALL' ? {} : { OR: [{ project: projectVisibilityWhere(scope) }, { ownerId: { in: [...scope.ownerIds] } }] };
    const rows = await this.prisma.forecastLine.findMany({
      where: {
        AND: [
          { OR: pairs.map((pair) => ({ projectId: pair.projectId, productId: pair.productId })) },
          { OR: periods.map((period) => ({ year: period.year, month: period.month })) },
          { project: { deletedAt: null } },
          visibility,
        ],
      },
      select: LINE_SELECT,
    });
    const names = await this.userNames(rows.map((row) => row.updatedById));
    return rows.map((row) => toLineRecord(row, names));
  }

  async totals(criteria: ForecastCriteria, scope: VisibilityScope): Promise<ForecastTotalsGroup[]> {
    const rows = await this.prisma.$queryRaw<TotalsRow[]>`
      ${pairsCte(criteria, scope)},
      filtered AS (
        SELECT x.project_id, x.product_id
        FROM pairs x
        JOIN projects p ON p.id = x.project_id
        JOIN products pr ON pr.id = x.product_id
        WHERE ${rowConditions(criteria)}
      )
      SELECT sl.year::int AS year, sl.month::int AS month, un.id AS unit_id, un.code AS unit_code, un.symbol AS unit_symbol,
             un.dimension::text AS unit_dimension, SUM(sl.quantity)::text AS quantity, SUM(sl.tonnage)::text AS tonnage,
             COUNT(*)::int AS lines, (COUNT(*) FILTER (WHERE sl.tonnage IS NULL))::int AS without_conversion
      FROM scoped_lines sl
      JOIN filtered fi ON fi.project_id = sl.project_id AND fi.product_id = sl.product_id
      JOIN units_of_measure un ON un.id = sl.unit_id
      GROUP BY sl.year, sl.month, un.id, un.code, un.symbol, un.dimension
      ORDER BY sl.year, sl.month, un.code`;
    return rows.map((row) => ({
      year: row.year,
      month: row.month,
      unit: { id: row.unit_id, code: row.unit_code, symbol: row.unit_symbol, dimension: row.unit_dimension as UnitDimensionCode },
      quantity: roundDecimal(row.quantity, QUANTITY_DECIMALS),
      tonnage: row.tonnage === null ? null : roundDecimal(row.tonnage, QUANTITY_DECIMALS),
      lines: row.lines,
      linesWithoutConversion: row.without_conversion,
    }));
  }

  async findVisibleProjects(projectIds: readonly string[], scope: VisibilityScope): Promise<ForecastProjectRecord[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ id: string; owner_id: string; country_id: string; project_type_id: string | null }[]>`
      SELECT p.id, p.owner_id, p.country_id, p.project_type_id
      FROM projects p
      WHERE ${uuidInSql(Prisma.sql`p.id`, projectIds)} AND p.deleted_at IS NULL AND ${projectVisibilitySql('p', scope)}`;
    return rows.map((row) => ({ id: row.id, ownerId: row.owner_id, countryId: row.country_id, projectTypeId: row.project_type_id }));
  }

  async findLines(keys: readonly ForecastLineKey[], tx?: TransactionContext): Promise<ForecastLineRecord[]> {
    if (keys.length === 0) return [];
    const db = prismaClientFor(this.prisma, tx);
    const rows = await db.forecastLine.findMany({
      where: { OR: keys.map((key) => ({ projectId: key.projectId, productId: key.productId, year: key.year, month: key.month })) },
      select: LINE_SELECT,
    });
    const names = await this.userNames(
      rows.map((row) => row.updatedById),
      tx,
    );
    return rows.map((row) => toLineRecord(row, names));
  }

  async lockLines(keys: readonly ForecastLineKey[], tx: TransactionContext): Promise<ForecastLineRecord[]> {
    if (keys.length === 0) return [];
    const db = prismaClientFor(this.prisma, tx);
    // Orden de `id`: dos lotes que bloquean las mismas líneas no se interbloquean.
    const locked = await db.$queryRaw<{ id: string }[]>`
      SELECT fl.id FROM forecast_lines fl
      WHERE (fl.project_id, fl.product_id, fl.year, fl.month) IN (
        SELECT * FROM unnest(
          ${keys.map((key) => key.projectId)}::uuid[], ${keys.map((key) => key.productId)}::uuid[],
          ${keys.map((key) => key.year)}::int[], ${keys.map((key) => key.month)}::int[]))
      ORDER BY fl.id
      FOR UPDATE`;
    if (locked.length === 0) return [];
    const rows = await db.forecastLine.findMany({ where: { id: { in: locked.map((row) => row.id) } }, select: LINE_SELECT });
    const names = await this.userNames(
      rows.map((row) => row.updatedById),
      tx,
    );
    return rows.map((row) => toLineRecord(row, names));
  }

  async associationUnits(pairs: readonly ForecastPair[], tx?: TransactionContext): Promise<ForecastAssociationUnit[]> {
    if (pairs.length === 0) return [];
    const rows = await prismaClientFor(this.prisma, tx).$queryRaw<{ project_id: string; product_id: string; unit_id: string }[]>`
      SELECT DISTINCT ON (pp.project_id, pp.product_id) pp.project_id, pp.product_id, pp.unit_id
      FROM project_products pp
      WHERE pp.deleted_at IS NULL AND ${pairsInSql(Prisma.sql`pp.project_id`, Prisma.sql`pp.product_id`, pairs)}
      ORDER BY pp.project_id, pp.product_id, (pp.opportunity_id IS NULL) DESC, pp.created_at ASC, pp.id ASC`;
    return rows.map((row) => ({ projectId: row.project_id, productId: row.product_id, unitId: row.unit_id }));
  }

  async findUnits(unitIds: readonly string[], tx?: TransactionContext): Promise<ForecastUnitRecord[]> {
    if (unitIds.length === 0) return [];
    return prismaClientFor(this.prisma, tx).unitOfMeasure.findMany({
      where: { id: { in: [...unitIds] } },
      select: { id: true, code: true, symbol: true, dimension: true, isActive: true },
    });
  }

  async createLine(key: ForecastLineKey, write: ForecastLineWrite, actorId: string | null, at: Date, tx: TransactionContext): Promise<string> {
    const created = await prismaClientFor(this.prisma, tx).forecastLine.create({
      data: {
        projectId: key.projectId,
        productId: key.productId,
        year: key.year,
        month: key.month,
        ...write,
        createdById: actorId,
        updatedById: actorId,
        createdAt: at,
        updatedAt: at,
      },
      select: { id: true },
    });
    return created.id;
  }

  async updateLine(lineId: string, write: ForecastLineWrite, actorId: string | null, at: Date, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).forecastLine.update({
      where: { id: lineId },
      data: { ...write, updatedById: actorId, updatedAt: at },
      select: { id: true },
    });
  }

  private async userNames(ids: readonly (string | null)[], tx?: TransactionContext): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const users = await prismaClientFor(this.prisma, tx).user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}
