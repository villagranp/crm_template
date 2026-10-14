import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage } from '@/infrastructure/database/ports/pagination';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';
import type { ActivityCategory, OpportunityCategory, VisitCategory, YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import { OPPORTUNITY_STATUS_CATEGORIES } from '@/modules/commercial-metrics/metric-definitions';
import type {
  ActivityCountsRecord,
  ActivityCriteria,
  CommercialMetricsReadModel,
  ForecastCellRecord,
  ForecastCriteria,
  ForecastGroupBy,
  ForecastGroupCellRecord,
  ForecastGrouping,
  ForecastGroupKey,
  ForecastGroupsRecord,
  ForecastTotalsRecord,
  OpportunityCriteria,
  OpportunityTotalsRecord,
  OwnerOpportunityCountsRecord,
  ProjectCountsRecord,
  ProjectCriteria,
  StageCountRecord,
  VisitCountsRecord,
  VisitCriteria,
} from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import { PrismaService } from '../prisma.service';
import { runReportRead } from '../report-read';
import { andSql, escapeLikePattern, normalizedTextSql, orSql, uuidInSql } from '../sql-text';
import { commercialVisibilitySql } from './prisma-commercial-visibility';
import { forecastLineVisibilitySql } from './prisma-forecast.repository';
import { opportunityVisibilitySql } from './prisma-opportunities.repository';
import { commercialLateral, commercialStatusCondition, projectVisibilitySql } from './prisma-projects.repository';

/**
 * Predicados SQL compartidos por los indicadores (`CommercialMetricsReadModel`) y por las
 * filas de Reportes (`ReportingRepository`): **un solo** `FROM … WHERE …` por entidad,
 * así la lista, sus conteos y la exportación cuentan exactamente el mismo conjunto
 * (05 RN-05.9, RN-05.44). Todo valor viaja como parámetro (`Prisma.sql` de plantilla);
 * los alias son fijos.
 */

const AMOUNT_DECIMALS = 4;

function decimal(value: Prisma.Decimal | string | number | null | undefined, scale = AMOUNT_DECIMALS): string {
  if (value === null || value === undefined) return (0).toFixed(scale);
  return new Prisma.Decimal(value).toFixed(scale);
}

function timestampSql(value: Date): Prisma.Sql {
  return Prisma.sql`${value.toISOString()}::timestamptz`;
}

function contains(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

/** Visibilidad de Reportes sobre visitas y actividades: un solo alcance, directo y heredado (00 §4.2, DM-13). */
function reportCommercialVisibility(scope: VisibilityScope): CommercialVisibility {
  return { direct: scope, inherited: scope };
}

/** `col` dentro de `[fromInstant, toExclusive)` (columnas `timestamptz`, RN-05.8). */
function instantWindowSql(column: Prisma.Sql, window: { fromInstant: Date; toExclusive: Date }): Prisma.Sql {
  return Prisma.sql`(${column} >= ${timestampSql(window.fromInstant)} AND ${column} < ${timestampSql(window.toExclusive)})`;
}

/** `col` entre `from` y `to` incluidos (columnas `date`, RN-05.8). */
function dateWindowSql(column: Prisma.Sql, window: { from: string; to: string }): Prisma.Sql {
  return Prisma.sql`(${column} >= ${window.from}::date AND ${column} <= ${window.to}::date)`;
}

function periodIndexSql(period: YearMonth): number {
  return period.year * 12 + period.month;
}

// ---------------------------------------------------------------------------
// Oportunidades (RN-05.19–RN-05.32)
// ---------------------------------------------------------------------------

/** Una fila por oportunidad: el resultado es 0..1 (`opportunity_results.opportunity_id` único). */
export const OPPORTUNITY_FROM_SQL = Prisma.sql`
  FROM opportunities o
  JOIN projects p ON p.id = o.project_id
  JOIN customers c ON c.id = p.customer_id
  LEFT JOIN opportunity_results r ON r.opportunity_id = o.id`;

/** Categoría disjunta (RN-05.20–RN-05.26) como condición SQL sobre `o` y `r`. */
export function opportunityCategorySql(category: OpportunityCategory, criteria: Pick<OpportunityCriteria, 'openStageIds' | 'closedStageIds'>): Prisma.Sql {
  const closed = uuidInSql(Prisma.sql`o.stage_id`, criteria.closedStageIds);
  switch (category) {
    case 'OPEN':
      return uuidInSql(Prisma.sql`o.stage_id`, criteria.openStageIds);
    case 'WON_FULL':
      return Prisma.sql`(${closed} AND r.outcome::text = 'WON')`;
    case 'PARTIAL':
      return Prisma.sql`(${closed} AND r.outcome::text = 'PARTIAL')`;
    case 'LOST':
      return Prisma.sql`(${closed} AND r.outcome::text = 'LOST')`;
    case 'CLOSED_NO_RESULT':
      return Prisma.sql`(${closed} AND r.id IS NULL)`;
  }
}

export function opportunityWhereSql(criteria: OpportunityCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`o.deleted_at IS NULL`,
    Prisma.sql`p.deleted_at IS NULL`,
    Prisma.sql`c.deleted_at IS NULL`,
    opportunityVisibilitySql('o', 'p', criteria.scope),
  ];
  if (criteria.period) {
    const { window } = criteria.period;
    switch (criteria.period.basis) {
      case 'IDENTIFIED':
        conditions.push(dateWindowSql(Prisma.sql`o.opportunity_date`, window));
        break;
      case 'DECIDED':
        // Solo oportunidades con resultado (C.2): sin fila, `r.decision_date` es NULL y no casa.
        conditions.push(dateWindowSql(Prisma.sql`r.decision_date`, window));
        break;
      case 'UPDATED':
        conditions.push(instantWindowSql(Prisma.sql`o.updated_at`, window));
        break;
    }
  }
  if (criteria.ownerIds.length) conditions.push(uuidInSql(Prisma.sql`o.owner_id`, criteria.ownerIds));
  if (criteria.customerIds.length) conditions.push(uuidInSql(Prisma.sql`p.customer_id`, criteria.customerIds));
  if (criteria.countryIds.length) conditions.push(uuidInSql(Prisma.sql`p.country_id`, criteria.countryIds));
  if (criteria.stageIds.length) conditions.push(uuidInSql(Prisma.sql`o.stage_id`, criteria.stageIds));
  if (criteria.statuses.length) {
    const categories = [...new Set(criteria.statuses.flatMap((status) => OPPORTUNITY_STATUS_CATEGORIES[status]))];
    conditions.push(orSql(categories.map((category) => opportunityCategorySql(category, criteria))));
  }
  if (criteria.productIds.length) {
    // D-05.10, RN-05.19: EXISTS, nunca un JOIN con project_products (la oportunidad cuenta una vez).
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM project_products fpp
      WHERE fpp.opportunity_id = o.id AND fpp.deleted_at IS NULL AND ${uuidInSql(Prisma.sql`fpp.product_id`, criteria.productIds)})`);
  }
  if (criteria.productFamilyIds.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM project_products fpp JOIN products fpr ON fpr.id = fpp.product_id
      WHERE fpp.opportunity_id = o.id AND fpp.deleted_at IS NULL AND ${uuidInSql(Prisma.sql`fpr.family_id`, criteria.productFamilyIds)})`);
  }
  return andSql(conditions);
}

// ---------------------------------------------------------------------------
// Proyectos (RN-05.15–RN-05.18, F-34)
// ---------------------------------------------------------------------------

/** Una fila por proyecto; el estado comercial sale de la subconsulta agregada de Proyectos (DEF-B). */
export function projectFromSql(criteria: Pick<ProjectCriteria, 'openStageRanking'>): Prisma.Sql {
  return Prisma.sql`
  FROM projects p
  JOIN customers c ON c.id = p.customer_id
  JOIN countries co ON co.id = p.country_id
  JOIN users u ON u.id = p.owner_id
  JOIN catalog_items ph ON ph.id = p.phase_id
  LEFT JOIN catalog_items pt ON pt.id = p.project_type_id
  ${commercialLateral(criteria.openStageRanking)}
  LEFT JOIN catalog_items ls ON ls.id = cs.leading_stage_id`;
}

export function projectWhereSql(criteria: ProjectCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`p.deleted_at IS NULL`, Prisma.sql`c.deleted_at IS NULL`, projectVisibilitySql('p', criteria.scope)];
  if (criteria.period) {
    const { window } = criteria.period;
    switch (criteria.period.basis) {
      case 'DECISION_ESTIMATED':
        conditions.push(dateWindowSql(Prisma.sql`p.estimated_decision_date`, window));
        break;
      case 'UPDATED':
        conditions.push(instantWindowSql(Prisma.sql`p.last_activity_at`, window));
        break;
      case 'CREATED':
        conditions.push(instantWindowSql(Prisma.sql`p.created_at`, window));
        break;
    }
  }
  if (criteria.search) {
    const pattern = contains(criteria.search);
    conditions.push(
      Prisma.sql`(${normalizedTextSql(Prisma.sql`p.name`)} LIKE ${pattern} OR lower(p.code) LIKE ${pattern} OR c.legal_name_normalized LIKE ${pattern})`,
    );
  }
  if (criteria.city) conditions.push(Prisma.sql`${normalizedTextSql(Prisma.sql`p.city`)} LIKE ${contains(criteria.city)}`);
  if (criteria.countryIds.length) conditions.push(uuidInSql(Prisma.sql`p.country_id`, criteria.countryIds));
  if (criteria.ownerIds.length) conditions.push(uuidInSql(Prisma.sql`p.owner_id`, criteria.ownerIds));
  if (criteria.customerIds.length) conditions.push(uuidInSql(Prisma.sql`p.customer_id`, criteria.customerIds));
  if (criteria.projectTypeIds.length) conditions.push(uuidInSql(Prisma.sql`p.project_type_id`, criteria.projectTypeIds));
  if (criteria.phaseIds.length) conditions.push(uuidInSql(Prisma.sql`p.phase_id`, criteria.phaseIds));
  if (criteria.commercialStatus.length) conditions.push(orSql(criteria.commercialStatus.map(commercialStatusCondition)));
  if (criteria.situation === 'ACTIVE') conditions.push(uuidInSql(Prisma.sql`p.phase_id`, criteria.nonFinalPhaseIds));
  if (criteria.situation === 'FINISHED') conditions.push(uuidInSql(Prisma.sql`p.phase_id`, criteria.finalPhaseIds));
  return andSql(conditions);
}

// ---------------------------------------------------------------------------
// Forecast (RN-05.33–RN-05.37, DM-25)
// ---------------------------------------------------------------------------

export const FORECAST_FROM_SQL = Prisma.sql`
  FROM forecast_lines fl
  JOIN projects p ON p.id = fl.project_id
  JOIN customers c ON c.id = p.customer_id
  JOIN products pr ON pr.id = fl.product_id
  JOIN product_families pf ON pf.id = pr.family_id
  JOIN units_of_measure uo ON uo.id = fl.unit_id
  JOIN users ow ON ow.id = fl.owner_id`;

export function forecastWhereSql(criteria: ForecastCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.deleted_at IS NULL`,
    Prisma.sql`c.deleted_at IS NULL`,
    // RN-05.33: cantidad 0 = proyección retirada (00 §2.9).
    Prisma.sql`fl.quantity > 0`,
    forecastLineVisibilitySql(criteria.scope),
    Prisma.sql`(fl.year * 12 + fl.month) BETWEEN ${periodIndexSql(criteria.fromMonth)} AND ${periodIndexSql(criteria.toMonth)}`,
  ];
  if (criteria.projectIds.length) conditions.push(uuidInSql(Prisma.sql`fl.project_id`, criteria.projectIds));
  if (criteria.customerIds.length) conditions.push(uuidInSql(Prisma.sql`p.customer_id`, criteria.customerIds));
  if (criteria.productIds.length) conditions.push(uuidInSql(Prisma.sql`fl.product_id`, criteria.productIds));
  if (criteria.productFamilyIds.length) conditions.push(uuidInSql(Prisma.sql`pr.family_id`, criteria.productFamilyIds));
  if (criteria.ownerIds.length) conditions.push(uuidInSql(Prisma.sql`fl.owner_id`, criteria.ownerIds));
  if (criteria.countryIds.length) conditions.push(uuidInSql(Prisma.sql`p.country_id`, criteria.countryIds));
  return andSql(conditions);
}

interface GroupExpressions {
  readonly id: Prisma.Sql;
  readonly label: Prisma.Sql;
  readonly sort: Prisma.Sql;
}

const MONTH_KEY_SQL = Prisma.sql`(lpad(fl.year::text, 4, '0') || '-' || lpad(fl.month::text, 2, '0'))`;

/** Expresiones fijas de cada agrupación (lista blanca, RN-05.36). `MONTH` se ordena por período. */
function groupExpressions(groupBy: ForecastGroupBy): GroupExpressions {
  switch (groupBy) {
    case 'MONTH':
      return { id: MONTH_KEY_SQL, label: MONTH_KEY_SQL, sort: MONTH_KEY_SQL };
    case 'PRODUCT':
      return { id: Prisma.sql`pr.id::text`, label: Prisma.sql`(pr.sku || ' · ' || pr.description)`, sort: Prisma.sql`pr.sku` };
    case 'FAMILY':
      return { id: Prisma.sql`pf.id::text`, label: Prisma.sql`pf.name`, sort: Prisma.sql`lower(pf.name)` };
    case 'PROJECT':
      return { id: Prisma.sql`p.id::text`, label: Prisma.sql`(p.code || ' · ' || p.name)`, sort: Prisma.sql`p.code` };
    case 'CUSTOMER':
      return { id: Prisma.sql`c.id::text`, label: Prisma.sql`c.legal_name`, sort: Prisma.sql`c.legal_name_normalized` };
    case 'OWNER':
      return { id: Prisma.sql`ow.id::text`, label: Prisma.sql`ow.display_name`, sort: Prisma.sql`lower(ow.display_name)` };
  }
}

function groupKey(type: ForecastGroupBy, id: string, label: string): ForecastGroupKey {
  return { type, id: type === 'MONTH' ? null : id, label };
}

// ---------------------------------------------------------------------------
// Visitas (RN-05.38–RN-05.40) y actividades (RN-05.41, RN-05.42)
// ---------------------------------------------------------------------------

/** Una fila por visita (00 §2.10): `visit_events` nunca entra (RN-05.39). */
export const VISIT_FROM_SQL = Prisma.sql`
  FROM visits v
  JOIN customers c ON c.id = v.customer_id
  LEFT JOIN projects vpj ON vpj.id = v.project_id`;

export function visitCategorySql(category: VisitCategory, criteria: Pick<VisitCriteria, 'statusSets'>): Prisma.Sql {
  return uuidInSql(Prisma.sql`v.status_id`, criteria.statusSets[category]);
}

export function visitWhereSql(criteria: VisitCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`c.deleted_at IS NULL`,
    Prisma.sql`(v.project_id IS NULL OR vpj.deleted_at IS NULL)`,
    commercialVisibilitySql('v', 'c', reportCommercialVisibility(criteria.scope)),
  ];
  if (criteria.period) {
    const { window } = criteria.period;
    switch (criteria.period.basis) {
      case 'SCHEDULED':
        conditions.push(instantWindowSql(Prisma.sql`v.scheduled_start_at`, window));
        break;
      case 'ACTUAL':
        conditions.push(instantWindowSql(Prisma.sql`v.actual_start_at`, window));
        break;
      case 'CONFIRMED':
        conditions.push(instantWindowSql(Prisma.sql`v.confirmed_at`, window));
        break;
    }
  }
  if (criteria.ownerIds.length) conditions.push(uuidInSql(Prisma.sql`v.owner_id`, criteria.ownerIds));
  if (criteria.customerIds.length) conditions.push(uuidInSql(Prisma.sql`v.customer_id`, criteria.customerIds));
  if (criteria.countryIds.length) conditions.push(uuidInSql(Prisma.sql`c.country_id`, criteria.countryIds));
  if (criteria.projectIds.length) conditions.push(uuidInSql(Prisma.sql`v.project_id`, criteria.projectIds));
  if (criteria.categories.length) conditions.push(orSql(criteria.categories.map((category) => visitCategorySql(category, criteria))));
  if (criteria.statusIds.length) conditions.push(uuidInSql(Prisma.sql`v.status_id`, criteria.statusIds));
  return andSql(conditions);
}

export const ACTIVITY_FROM_SQL = Prisma.sql`
  FROM activities a
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN projects apj ON apj.id = a.project_id`;

/** Categoría disjunta (RN-05.41) sobre `a`; "ahora" es el instante del servidor (RN-05.7). */
export function activityCategorySql(category: ActivityCategory, criteria: Pick<ActivityCriteria, 'statusSets' | 'now'>): Prisma.Sql {
  const open = uuidInSql(Prisma.sql`a.status_id`, criteria.statusSets.open);
  switch (category) {
    case 'PENDING':
      return Prisma.sql`(${open} AND (a.due_at IS NULL OR a.due_at >= ${timestampSql(criteria.now)}))`;
    case 'OVERDUE':
      return Prisma.sql`(${open} AND a.due_at < ${timestampSql(criteria.now)})`;
    case 'COMPLETED':
      return uuidInSql(Prisma.sql`a.status_id`, criteria.statusSets.completed);
    case 'CANCELLED':
      return uuidInSql(Prisma.sql`a.status_id`, criteria.statusSets.cancelled);
  }
}

/** Fecha de la actividad (C.2 `ACTIVITY_DATE`, igual que la agenda RN-04.36). */
export const ACTIVITY_DATE_SQL = Prisma.sql`COALESCE(a.scheduled_at, a.due_at)`;

export function activityWhereSql(criteria: ActivityCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`a.deleted_at IS NULL`,
    Prisma.sql`c.deleted_at IS NULL`,
    Prisma.sql`(a.project_id IS NULL OR apj.deleted_at IS NULL)`,
    commercialVisibilitySql('a', 'c', reportCommercialVisibility(criteria.scope)),
  ];
  if (criteria.period) {
    const { window } = criteria.period;
    switch (criteria.period.basis) {
      case 'ACTIVITY_DATE':
        conditions.push(instantWindowSql(ACTIVITY_DATE_SQL, window));
        break;
      case 'DUE':
        conditions.push(instantWindowSql(Prisma.sql`a.due_at`, window));
        break;
      case 'COMPLETED':
        conditions.push(instantWindowSql(Prisma.sql`a.completed_at`, window));
        break;
    }
  }
  if (criteria.ownerIds.length) conditions.push(uuidInSql(Prisma.sql`a.owner_id`, criteria.ownerIds));
  if (criteria.customerIds.length) conditions.push(uuidInSql(Prisma.sql`a.customer_id`, criteria.customerIds));
  if (criteria.countryIds.length) conditions.push(uuidInSql(Prisma.sql`c.country_id`, criteria.countryIds));
  if (criteria.typeIds.length) conditions.push(uuidInSql(Prisma.sql`a.type_id`, criteria.typeIds));
  if (criteria.priorityIds.length) conditions.push(uuidInSql(Prisma.sql`a.priority_id`, criteria.priorityIds));
  if (criteria.categories.length) conditions.push(orSql(criteria.categories.map((category) => activityCategorySql(category, criteria))));
  if (criteria.statusIds.length) conditions.push(uuidInSql(Prisma.sql`a.status_id`, criteria.statusIds));
  return andSql(conditions);
}

// ---------------------------------------------------------------------------
// Adaptador
// ---------------------------------------------------------------------------

interface OpportunityTotalsRow {
  total: number;
  open: number;
  won_full: number;
  partial: number;
  lost: number;
  closed_no_result: number;
  amount_usd: Prisma.Decimal | null;
  tonnage: Prisma.Decimal | null;
}

interface CellRow {
  year: number;
  month: number;
  unit_id: string;
  unit_code: string;
  unit_symbol: string;
  quantity: Prisma.Decimal;
  tonnage: Prisma.Decimal | null;
  line_count: number;
  without_conversion: number;
}

interface GroupCellRow extends CellRow {
  key_id: string;
  key_label: string;
  sub_id: string | null;
  sub_label: string | null;
}

function toCell(row: CellRow): ForecastCellRecord {
  return {
    year: row.year,
    month: row.month,
    unit: { id: row.unit_id, code: row.unit_code, symbol: row.unit_symbol },
    quantity: decimal(row.quantity),
    tonnage: decimal(row.tonnage),
    lineCount: row.line_count,
    linesWithoutConversion: row.without_conversion,
  };
}

const CELL_AGGREGATES = Prisma.sql`
  SUM(fl.quantity) AS quantity,
  SUM(fl.tonnage) AS tonnage,
  COUNT(*)::int AS line_count,
  (COUNT(*) FILTER (WHERE fl.tonnage IS NULL))::int AS without_conversion`;

/**
 * Adaptador Prisma de `CommercialMetricsReadModel` (01 L.1, 05 G.3). Solo agrega:
 * las definiciones llegan resueltas en los criterios y el servicio compone el resultado.
 */
@Injectable()
export class PrismaCommercialMetricsRepository implements CommercialMetricsReadModel {
  constructor(private readonly prisma: PrismaService) {}

  async opportunityTotals(criteria: OpportunityCriteria): Promise<OpportunityTotalsRecord> {
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<OpportunityTotalsRow[]>`
        SELECT COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('OPEN', criteria)}))::int AS open,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('WON_FULL', criteria)}))::int AS won_full,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('PARTIAL', criteria)}))::int AS partial,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('LOST', criteria)}))::int AS lost,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('CLOSED_NO_RESULT', criteria)}))::int AS closed_no_result,
               SUM(o.estimated_amount_usd) AS amount_usd,
               SUM(o.estimated_tonnage) AS tonnage
        ${OPPORTUNITY_FROM_SQL}
        WHERE ${opportunityWhereSql(criteria)}`,
    );
    const row = rows[0];
    const counts = {
      total: row?.total ?? 0,
      open: row?.open ?? 0,
      wonFull: row?.won_full ?? 0,
      partial: row?.partial ?? 0,
      lost: row?.lost ?? 0,
      closedWithoutResult: row?.closed_no_result ?? 0,
    };
    return { ...counts, won: counts.wonFull + counts.partial, amountUsd: decimal(row?.amount_usd), tonnage: decimal(row?.tonnage) };
  }

  async opportunityStageCounts(criteria: OpportunityCriteria): Promise<StageCountRecord[]> {
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<{ stage_id: string; count: number }[]>`
        SELECT o.stage_id, COUNT(*)::int AS count
        ${OPPORTUNITY_FROM_SQL}
        WHERE ${opportunityWhereSql(criteria)}
        GROUP BY o.stage_id`,
    );
    return rows.map((row) => ({ stageId: row.stage_id, count: row.count }));
  }

  async opportunityOwnerCounts(criteria: OpportunityCriteria): Promise<OwnerOpportunityCountsRecord[]> {
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<{ owner_id: string; owner_name: string; total: number; open: number; won: number; partial: number; lost: number }[]>`
        SELECT o.owner_id, ou.display_name AS owner_name, COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('OPEN', criteria)}))::int AS open,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('WON_FULL', criteria)} OR ${opportunityCategorySql('PARTIAL', criteria)}))::int AS won,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('PARTIAL', criteria)}))::int AS partial,
               (COUNT(*) FILTER (WHERE ${opportunityCategorySql('LOST', criteria)}))::int AS lost
        ${OPPORTUNITY_FROM_SQL}
        JOIN users ou ON ou.id = o.owner_id
        WHERE ${opportunityWhereSql(criteria)}
        GROUP BY o.owner_id, ou.display_name
        ORDER BY lower(ou.display_name) ASC, o.owner_id ASC`,
    );
    return rows.map((row) => ({
      owner: { id: row.owner_id, displayName: row.owner_name },
      total: row.total,
      open: row.open,
      won: row.won,
      partial: row.partial,
      lost: row.lost,
    }));
  }

  async projectCounts(criteria: ProjectCriteria): Promise<ProjectCountsRecord> {
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<{ total: number; active: number; finished: number }[]>`
        SELECT COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE ${uuidInSql(Prisma.sql`p.phase_id`, criteria.nonFinalPhaseIds)}))::int AS active,
               (COUNT(*) FILTER (WHERE ${uuidInSql(Prisma.sql`p.phase_id`, criteria.finalPhaseIds)}))::int AS finished
        ${projectFromSql(criteria)}
        WHERE ${projectWhereSql(criteria)}`,
    );
    return { total: rows[0]?.total ?? 0, active: rows[0]?.active ?? 0, finished: rows[0]?.finished ?? 0 };
  }

  async forecastTotals(criteria: ForecastCriteria): Promise<ForecastTotalsRecord> {
    return runReportRead(this.prisma, async (db) => {
      const cells = await db.$queryRaw<CellRow[]>`
        SELECT fl.year::int AS year, fl.month::int AS month, uo.id AS unit_id, uo.code AS unit_code, uo.symbol AS unit_symbol,
               ${CELL_AGGREGATES}
        ${FORECAST_FROM_SQL}
        WHERE ${forecastWhereSql(criteria)}
        GROUP BY fl.year, fl.month, uo.id, uo.code, uo.symbol
        ORDER BY fl.year ASC, fl.month ASC, uo.code ASC`;
      const summary = await db.$queryRaw<{ last_updated_at: Date | null; line_count: number }[]>`
        SELECT MAX(fl.updated_at) AS last_updated_at, COUNT(*)::int AS line_count
        ${FORECAST_FROM_SQL}
        WHERE ${forecastWhereSql(criteria)}`;
      return { cells: cells.map(toCell), lastUpdatedAt: summary[0]?.last_updated_at ?? null, lineCount: summary[0]?.line_count ?? 0 };
    });
  }

  async forecastGroups(criteria: ForecastCriteria, grouping: ForecastGrouping, page: { page: number; pageSize: number }): Promise<ForecastGroupsRecord> {
    const first = groupExpressions(grouping.groupBy);
    const second = grouping.thenBy ? groupExpressions(grouping.thenBy) : null;
    const where = forecastWhereSql(criteria);
    const offset = (page.page - 1) * page.pageSize;
    return runReportRead(this.prisma, async (db) => {
      const keys = await db.$queryRaw<{ key_id: string; key_label: string }[]>`
        SELECT DISTINCT ${first.id} AS key_id, ${first.label} AS key_label, ${first.sort} AS sort_key
        ${FORECAST_FROM_SQL}
        WHERE ${where}
        ORDER BY sort_key ASC, key_id ASC
        LIMIT ${page.pageSize} OFFSET ${offset}`;
      const totals = await db.$queryRaw<{ total: number }[]>`
        SELECT COUNT(DISTINCT ${first.id})::int AS total ${FORECAST_FROM_SQL} WHERE ${where}`;
      const keyIds = keys.map((key) => key.key_id);
      const cells =
        keyIds.length === 0
          ? []
          : await db.$queryRaw<GroupCellRow[]>`
              SELECT ${first.id} AS key_id, ${first.label} AS key_label,
                     ${second ? second.id : Prisma.sql`NULL::text`} AS sub_id,
                     ${second ? second.label : Prisma.sql`NULL::text`} AS sub_label,
                     ${second ? Prisma.sql`MIN(${second.sort})` : Prisma.sql`NULL::text`} AS sub_sort,
                     fl.year::int AS year, fl.month::int AS month, uo.id AS unit_id, uo.code AS unit_code, uo.symbol AS unit_symbol,
                     ${CELL_AGGREGATES}
              ${FORECAST_FROM_SQL}
              WHERE ${where} AND ${first.id} = ANY(${keyIds}::text[])
              GROUP BY 1, 2, 3, 4, fl.year, fl.month, uo.id, uo.code, uo.symbol
              ORDER BY sub_sort ASC NULLS FIRST, sub_id ASC NULLS FIRST, fl.year ASC, fl.month ASC, uo.code ASC`;
      const groupCells: ForecastGroupCellRecord[] = cells.map((row) => ({
        ...toCell(row),
        key: groupKey(grouping.groupBy, row.key_id, row.key_label),
        subKey: grouping.thenBy && row.sub_id !== null && row.sub_label !== null ? groupKey(grouping.thenBy, row.sub_id, row.sub_label) : null,
      }));
      return {
        keys: createPage(
          keys.map((key) => groupKey(grouping.groupBy, key.key_id, key.key_label)),
          totals[0]?.total ?? 0,
          page,
        ),
        cells: groupCells,
      };
    });
  }

  async visitCounts(criteria: VisitCriteria, now: Date, upcomingUntil: Date | null): Promise<VisitCountsRecord> {
    const scheduled = visitCategorySql('SCHEDULED', criteria);
    const upcoming = upcomingUntil
      ? Prisma.sql`(${scheduled} AND v.scheduled_start_at >= ${timestampSql(now)} AND v.scheduled_start_at <= ${timestampSql(upcomingUntil)})`
      : Prisma.sql`FALSE`;
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<
        {
          total: number;
          scheduled: number;
          completed: number;
          confirmed: number;
          cancelled: number;
          rescheduled_visits: number;
          reschedule_events: number;
          overdue_pending: number;
          upcoming: number;
        }[]
      >`
        SELECT COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE ${scheduled}))::int AS scheduled,
               (COUNT(*) FILTER (WHERE ${visitCategorySql('COMPLETED', criteria)}))::int AS completed,
               (COUNT(*) FILTER (WHERE ${visitCategorySql('CONFIRMED', criteria)}))::int AS confirmed,
               (COUNT(*) FILTER (WHERE ${visitCategorySql('CANCELLED', criteria)}))::int AS cancelled,
               (COUNT(*) FILTER (WHERE v.reschedule_count > 0))::int AS rescheduled_visits,
               COALESCE(SUM(v.reschedule_count), 0)::int AS reschedule_events,
               (COUNT(*) FILTER (WHERE ${scheduled} AND v.scheduled_start_at < ${timestampSql(now)}))::int AS overdue_pending,
               (COUNT(*) FILTER (WHERE ${upcoming}))::int AS upcoming
        ${VISIT_FROM_SQL}
        WHERE ${visitWhereSql(criteria)}`,
    );
    const row = rows[0];
    return {
      total: row?.total ?? 0,
      scheduled: row?.scheduled ?? 0,
      completed: row?.completed ?? 0,
      confirmed: row?.confirmed ?? 0,
      cancelled: row?.cancelled ?? 0,
      rescheduledVisits: row?.rescheduled_visits ?? 0,
      rescheduleEvents: row?.reschedule_events ?? 0,
      overduePending: row?.overdue_pending ?? 0,
      upcoming: row?.upcoming ?? 0,
    };
  }

  async activityCounts(criteria: ActivityCriteria, dueSoonUntil: Date | null): Promise<ActivityCountsRecord> {
    const pending = activityCategorySql('PENDING', criteria);
    const dueSoon = dueSoonUntil
      ? Prisma.sql`(${pending} AND a.due_at IS NOT NULL AND a.due_at <= ${timestampSql(dueSoonUntil)})`
      : Prisma.sql`FALSE`;
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<{ total: number; pending: number; overdue: number; completed: number; cancelled: number; due_soon: number }[]>`
        SELECT COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE ${pending}))::int AS pending,
               (COUNT(*) FILTER (WHERE ${activityCategorySql('OVERDUE', criteria)}))::int AS overdue,
               (COUNT(*) FILTER (WHERE ${activityCategorySql('COMPLETED', criteria)}))::int AS completed,
               (COUNT(*) FILTER (WHERE ${activityCategorySql('CANCELLED', criteria)}))::int AS cancelled,
               (COUNT(*) FILTER (WHERE ${dueSoon}))::int AS due_soon
        ${ACTIVITY_FROM_SQL}
        WHERE ${activityWhereSql(criteria)}`,
    );
    const row = rows[0];
    return {
      total: row?.total ?? 0,
      pending: row?.pending ?? 0,
      overdue: row?.overdue ?? 0,
      completed: row?.completed ?? 0,
      cancelled: row?.cancelled ?? 0,
      dueSoon: row?.due_soon ?? 0,
    };
  }
}
