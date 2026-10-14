import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toCalendarDate } from '@/common/calendar-date';
import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';
import type {
  ActivityCriteria,
  ForecastCriteria,
  OpportunityCriteria,
  ProjectCriteria,
  UserRef,
  VisitCriteria,
} from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import type {
  ActivityReportRecord,
  ActivityReportSortField,
  CountryOptionRecord,
  ForecastReportRecord,
  ForecastReportSortField,
  NamedRef,
  OpportunityReportRecord,
  OpportunityRowsRequest,
  ProjectReportRecord,
  ProjectReportSortField,
  ReportingRepository,
  ReportPageRequest,
  VisitReportRecord,
  VisitReportSortField,
} from '@/modules/reports/ports/reporting.repository.port';

import { PrismaService } from '../prisma.service';
import { runReportRead } from '../report-read';
import { normalizedTextSql, uuidInSql } from '../sql-text';
import { PRIORITY_WEIGHT_SQL } from './prisma-activity.repository';
import {
  ACTIVITY_DATE_SQL,
  ACTIVITY_FROM_SQL,
  activityWhereSql,
  FORECAST_FROM_SQL,
  forecastWhereSql,
  OPPORTUNITY_FROM_SQL,
  opportunityWhereSql,
  projectFromSql,
  projectWhereSql,
  VISIT_FROM_SQL,
  visitWhereSql,
} from './prisma-commercial-metrics.repository';

const QUANTITY_DECIMALS = 4;
const RATE_DECIMALS = 8;
const PERCENT_DECIMALS = 2;

function fixed(value: Prisma.Decimal, scale: number): string {
  return value.toFixed(scale);
}

function optionalFixed(value: Prisma.Decimal | null, scale: number): string | null {
  return value === null ? null : value.toFixed(scale);
}

function optionalDate(value: Date | null): string | null {
  return value === null ? null : toCalendarDate(value);
}

function direction(order: 'asc' | 'desc'): Prisma.Sql {
  return Prisma.raw(order === 'desc' ? 'DESC' : 'ASC');
}

/** `array_position` del ranking (orden de catálogo); `NULL` sin ranking. */
function rankingPosition(ranking: readonly string[], column: Prisma.Sql): Prisma.Sql {
  return ranking.length === 0 ? Prisma.sql`NULL::int` : Prisma.sql`array_position(${[...ranking]}::uuid[], ${column})`;
}

/** Campo pedido (lista blanca) + desempate por `id` (RN-05.14). */
function orderBy(expression: Prisma.Sql, order: 'asc' | 'desc', idColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`ORDER BY ${expression} ${direction(order)} NULLS LAST, ${idColumn} ASC`;
}

function offsetOf(page: { page: number; pageSize: number }): number {
  return (page.page - 1) * page.pageSize;
}

const NO_FILTERS = { ownerIds: [], customerIds: [], countryIds: [] } as const;

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  customer_id: string;
  customer_name: string;
  country_id: string;
  country_name: string;
  owner_id: string;
  owner_name: string;
  type_id: string | null;
  type_label: string | null;
  phase_id: string;
  phase_label: string;
  phase_progress: Prisma.Decimal;
  estimated_decision_date: Date | null;
  last_activity_at: Date;
  opportunity_count: number;
  has_won: boolean;
  lead_id: string | null;
  lead_code: string | null;
  lead_label: string | null;
}

function projectSort(field: ProjectReportSortField, criteria: ProjectCriteria): Prisma.Sql {
  switch (field) {
    case 'code':
      return Prisma.sql`p.code`;
    case 'name':
      return normalizedTextSql(Prisma.sql`p.name`);
    case 'customerName':
      return Prisma.sql`c.legal_name_normalized`;
    case 'countryName':
      return Prisma.sql`lower(co.name)`;
    case 'ownerName':
      return Prisma.sql`lower(u.display_name)`;
    case 'phaseOrder':
      return rankingPosition(criteria.phaseRanking, Prisma.sql`p.phase_id`);
    case 'phaseProgress':
      return Prisma.sql`p.phase_progress`;
    case 'estimatedDecisionDate':
      return Prisma.sql`p.estimated_decision_date`;
    case 'lastActivityAt':
      return Prisma.sql`p.last_activity_at`;
  }
}

interface OpportunityRow {
  id: string;
  code: string;
  project_id: string;
  project_code: string;
  project_name: string;
  customer_id: string;
  customer_name: string;
  owner_id: string;
  owner_name: string;
  stage_id: string;
  stage_label: string;
  outcome: OpportunityOutcomeCode | null;
  reason_id: string | null;
  reason_label: string | null;
  awarded_percent: Prisma.Decimal | null;
  decision_date: Date | null;
  estimated_amount: Prisma.Decimal | null;
  currency_code: string | null;
  exchange_rate: Prisma.Decimal | null;
  exchange_rate_date: Date | null;
  estimated_amount_usd: Prisma.Decimal | null;
  estimated_tonnage: Prisma.Decimal | null;
  project_decision_date: Date | null;
  updated_at: Date;
}

function opportunitySort(page: OpportunityRowsRequest): Prisma.Sql {
  switch (page.sortBy) {
    case 'code':
      return Prisma.sql`o.code`;
    case 'projectName':
      return normalizedTextSql(Prisma.sql`p.name`);
    case 'customerName':
      return Prisma.sql`c.legal_name_normalized`;
    case 'ownerName':
      return Prisma.sql`lower(ou.display_name)`;
    case 'stageOrder':
      return rankingPosition(page.stageRanking, Prisma.sql`o.stage_id`);
    case 'estimatedAmountUsd':
      return Prisma.sql`o.estimated_amount_usd`;
    case 'decisionDate':
      // RN-05.28: la real si hay resultado; si no, la estimada del proyecto.
      return Prisma.sql`COALESCE(r.decision_date, p.estimated_decision_date)`;
    case 'updatedAt':
      return Prisma.sql`o.updated_at`;
  }
}

interface ForecastRow {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  customer_id: string;
  customer_name: string;
  product_id: string;
  product_sku: string;
  product_description: string;
  family_id: string;
  family_name: string;
  year: number;
  month: number;
  quantity: Prisma.Decimal;
  unit_id: string;
  unit_code: string;
  unit_symbol: string;
  tonnage: Prisma.Decimal | null;
  owner_id: string;
  owner_name: string;
  updated_at: Date;
}

function forecastSort(field: ForecastReportSortField): Prisma.Sql {
  switch (field) {
    case 'period':
      return Prisma.sql`(fl.year * 12 + fl.month)`;
    case 'projectName':
      return normalizedTextSql(Prisma.sql`p.name`);
    case 'productSku':
      return Prisma.sql`pr.sku`;
    case 'familyName':
      return Prisma.sql`lower(pf.name)`;
    case 'ownerName':
      return Prisma.sql`lower(ow.display_name)`;
    case 'tonnage':
      return Prisma.sql`fl.tonnage`;
    case 'updatedAt':
      return Prisma.sql`fl.updated_at`;
  }
}

interface VisitRow {
  id: string;
  code: string;
  customer_id: string;
  customer_name: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  owner_id: string;
  owner_name: string;
  scheduled_start_at: Date;
  original_scheduled_at: Date;
  reschedule_count: number;
  actual_start_at: Date | null;
  status_id: string;
  status_label: string;
  result_id: string | null;
  result_label: string | null;
  result_summary: string | null;
  confirmed_at: Date | null;
}

function visitSort(field: VisitReportSortField): Prisma.Sql {
  switch (field) {
    case 'scheduledStartAt':
      return Prisma.sql`v.scheduled_start_at`;
    case 'actualStartAt':
      return Prisma.sql`v.actual_start_at`;
    case 'confirmedAt':
      return Prisma.sql`v.confirmed_at`;
    case 'customerName':
      return Prisma.sql`c.legal_name_normalized`;
    case 'ownerName':
      return Prisma.sql`lower(vu.display_name)`;
    case 'statusOrder':
      return Prisma.sql`vs.sort_order`;
  }
}

interface ActivityRow {
  id: string;
  code: string;
  type_id: string;
  type_label: string;
  subject: string;
  customer_id: string;
  customer_name: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  owner_id: string;
  owner_name: string;
  activity_date: Date | null;
  due_at: Date | null;
  priority_id: string;
  priority_label: string;
  priority_weight: Prisma.Decimal | number;
  status_id: string;
  status_label: string;
  result_id: string | null;
  result_label: string | null;
  result_notes: string | null;
}

function activitySort(field: ActivityReportSortField): Prisma.Sql {
  switch (field) {
    case 'activityDate':
      return ACTIVITY_DATE_SQL;
    case 'dueAt':
      return Prisma.sql`a.due_at`;
    case 'priorityWeight':
      return PRIORITY_WEIGHT_SQL;
    case 'customerName':
      return Prisma.sql`c.legal_name_normalized`;
    case 'ownerName':
      return Prisma.sql`lower(au.display_name)`;
    case 'typeName':
      return Prisma.sql`lower(aty.label)`;
  }
}

function projectRef(id: string | null, code: string | null, name: string | null): { id: string; code: string; name: string } | null {
  return id !== null && code !== null && name !== null ? { id, code, name } : null;
}

function labelRef(id: string | null, label: string | null): { id: string; label: string } | null {
  return id !== null && label !== null ? { id, label } : null;
}

/**
 * Adaptador Prisma de `ReportingRepository` (05 §L.1, ADR-004). Filas con SQL
 * parametrizado sobre los **mismos** `FROM … WHERE …` que los indicadores; página y
 * conteo en una sola transacción de lectura (misma instantánea).
 */
@Injectable()
export class PrismaReportingRepository implements ReportingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async projectRows(criteria: ProjectCriteria, page: ReportPageRequest<ProjectReportSortField>): Promise<Page<ProjectReportRecord>> {
    const from = projectFromSql(criteria);
    const where = projectWhereSql(criteria);
    const { rows, total } = await runReportRead(this.prisma, async (db) => ({
      rows: await db.$queryRaw<ProjectRow[]>`
        SELECT p.id, p.code, p.name, p.city, c.id AS customer_id, c.legal_name AS customer_name,
               co.id AS country_id, co.name AS country_name, u.id AS owner_id, u.display_name AS owner_name,
               pt.id AS type_id, pt.label AS type_label, ph.id AS phase_id, ph.label AS phase_label, p.phase_progress,
               p.estimated_decision_date, p.last_activity_at,
               cs.opportunity_count, COALESCE(cs.has_won, FALSE) AS has_won,
               ls.id AS lead_id, ls.code AS lead_code, ls.label AS lead_label
        ${from}
        WHERE ${where}
        ${orderBy(projectSort(page.sortBy, criteria), page.sortOrder, Prisma.sql`p.id`)}
        LIMIT ${page.pageSize} OFFSET ${offsetOf(page)}`,
      total: await db.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${from} WHERE ${where}`,
    }));
    const items = rows.map(
      (row): ProjectReportRecord => ({
        id: row.id,
        code: row.code,
        name: row.name,
        customer: { id: row.customer_id, name: row.customer_name },
        country: { id: row.country_id, name: row.country_name },
        city: row.city,
        owner: { id: row.owner_id, displayName: row.owner_name },
        projectType: labelRef(row.type_id, row.type_label),
        phase: { id: row.phase_id, label: row.phase_label },
        phaseProgress: fixed(row.phase_progress, PERCENT_DECIMALS),
        commercial: {
          leadingOpenStage:
            row.lead_id !== null && row.lead_code !== null && row.lead_label !== null
              ? { id: row.lead_id, code: row.lead_code, label: row.lead_label }
              : null,
          opportunityCount: row.opportunity_count,
          hasWon: row.has_won,
        },
        estimatedDecisionDate: optionalDate(row.estimated_decision_date),
        lastActivityAt: row.last_activity_at,
      }),
    );
    return createPage(items, total[0]?.total ?? 0, page);
  }

  async opportunityRows(criteria: OpportunityCriteria, page: OpportunityRowsRequest): Promise<Page<OpportunityReportRecord>> {
    const where = opportunityWhereSql(criteria);
    const { rows, total } = await runReportRead(this.prisma, async (db) => ({
      rows: await db.$queryRaw<OpportunityRow[]>`
        SELECT o.id, o.code, p.id AS project_id, p.code AS project_code, p.name AS project_name,
               c.id AS customer_id, c.legal_name AS customer_name, ou.id AS owner_id, ou.display_name AS owner_name,
               st.id AS stage_id, st.label AS stage_label,
               r.outcome::text AS outcome, rr.id AS reason_id, rr.label AS reason_label, r.awarded_percent, r.decision_date,
               o.estimated_amount, o.currency_code, o.exchange_rate, o.exchange_rate_date, o.estimated_amount_usd, o.estimated_tonnage,
               p.estimated_decision_date AS project_decision_date, o.updated_at
        ${OPPORTUNITY_FROM_SQL}
        JOIN users ou ON ou.id = o.owner_id
        JOIN catalog_items st ON st.id = o.stage_id
        LEFT JOIN catalog_items rr ON rr.id = r.reason_id
        WHERE ${where}
        ${orderBy(opportunitySort(page), page.sortOrder, Prisma.sql`o.id`)}
        LIMIT ${page.pageSize} OFFSET ${offsetOf(page)}`,
      total: await db.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${OPPORTUNITY_FROM_SQL} WHERE ${where}`,
    }));
    const items = rows.map(
      (row): OpportunityReportRecord => ({
        id: row.id,
        code: row.code,
        project: { id: row.project_id, code: row.project_code, name: row.project_name },
        customer: { id: row.customer_id, name: row.customer_name },
        owner: { id: row.owner_id, displayName: row.owner_name },
        stage: { id: row.stage_id, label: row.stage_label },
        result:
          row.outcome !== null && row.decision_date !== null
            ? {
                outcome: row.outcome,
                reason: labelRef(row.reason_id, row.reason_label),
                awardedPercent: optionalFixed(row.awarded_percent, PERCENT_DECIMALS),
                decisionDate: toCalendarDate(row.decision_date),
              }
            : null,
        estimate: {
          amount: optionalFixed(row.estimated_amount, QUANTITY_DECIMALS),
          currencyCode: row.currency_code,
          exchangeRate: optionalFixed(row.exchange_rate, RATE_DECIMALS),
          exchangeRateDate: optionalDate(row.exchange_rate_date),
          amountUsd: optionalFixed(row.estimated_amount_usd, QUANTITY_DECIMALS),
          tonnage: optionalFixed(row.estimated_tonnage, QUANTITY_DECIMALS),
        },
        projectEstimatedDecisionDate: optionalDate(row.project_decision_date),
        updatedAt: row.updated_at,
      }),
    );
    return createPage(items, total[0]?.total ?? 0, page);
  }

  async forecastRows(criteria: ForecastCriteria, page: ReportPageRequest<ForecastReportSortField>): Promise<Page<ForecastReportRecord>> {
    const where = forecastWhereSql(criteria);
    const { rows, total } = await runReportRead(this.prisma, async (db) => ({
      rows: await db.$queryRaw<ForecastRow[]>`
        SELECT fl.id, p.id AS project_id, p.code AS project_code, p.name AS project_name,
               c.id AS customer_id, c.legal_name AS customer_name,
               pr.id AS product_id, pr.sku AS product_sku, pr.description AS product_description,
               pf.id AS family_id, pf.name AS family_name, fl.year::int AS year, fl.month::int AS month, fl.quantity,
               uo.id AS unit_id, uo.code AS unit_code, uo.symbol AS unit_symbol, fl.tonnage,
               ow.id AS owner_id, ow.display_name AS owner_name, fl.updated_at
        ${FORECAST_FROM_SQL}
        WHERE ${where}
        ${orderBy(forecastSort(page.sortBy), page.sortOrder, Prisma.sql`fl.id`)}
        LIMIT ${page.pageSize} OFFSET ${offsetOf(page)}`,
      total: await db.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${FORECAST_FROM_SQL} WHERE ${where}`,
    }));
    const items = rows.map(
      (row): ForecastReportRecord => ({
        id: row.id,
        project: { id: row.project_id, code: row.project_code, name: row.project_name },
        customer: { id: row.customer_id, name: row.customer_name },
        product: { id: row.product_id, sku: row.product_sku, description: row.product_description },
        family: { id: row.family_id, name: row.family_name },
        year: row.year,
        month: row.month,
        quantity: fixed(row.quantity, QUANTITY_DECIMALS),
        unit: { id: row.unit_id, code: row.unit_code, symbol: row.unit_symbol },
        tonnage: optionalFixed(row.tonnage, QUANTITY_DECIMALS),
        owner: { id: row.owner_id, displayName: row.owner_name },
        updatedAt: row.updated_at,
      }),
    );
    return createPage(items, total[0]?.total ?? 0, page);
  }

  async visitRows(criteria: VisitCriteria, page: ReportPageRequest<VisitReportSortField>): Promise<Page<VisitReportRecord>> {
    const where = visitWhereSql(criteria);
    const { rows, total } = await runReportRead(this.prisma, async (db) => ({
      rows: await db.$queryRaw<VisitRow[]>`
        SELECT v.id, v.code, c.id AS customer_id, c.legal_name AS customer_name,
               vpj.id AS project_id, vpj.code AS project_code, vpj.name AS project_name,
               vu.id AS owner_id, vu.display_name AS owner_name,
               v.scheduled_start_at, v.original_scheduled_at, v.reschedule_count, v.actual_start_at,
               vs.id AS status_id, vs.label AS status_label, vr.id AS result_id, vr.label AS result_label,
               v.result_summary, v.confirmed_at
        ${VISIT_FROM_SQL}
        JOIN users vu ON vu.id = v.owner_id
        JOIN catalog_items vs ON vs.id = v.status_id
        LEFT JOIN catalog_items vr ON vr.id = v.result_id
        WHERE ${where}
        ${orderBy(visitSort(page.sortBy), page.sortOrder, Prisma.sql`v.id`)}
        LIMIT ${page.pageSize} OFFSET ${offsetOf(page)}`,
      total: await db.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${VISIT_FROM_SQL} WHERE ${where}`,
    }));
    const items = rows.map(
      (row): VisitReportRecord => ({
        id: row.id,
        code: row.code,
        customer: { id: row.customer_id, name: row.customer_name },
        project: projectRef(row.project_id, row.project_code, row.project_name),
        owner: { id: row.owner_id, displayName: row.owner_name },
        scheduledStartAt: row.scheduled_start_at,
        originalScheduledAt: row.original_scheduled_at,
        rescheduleCount: row.reschedule_count,
        actualStartAt: row.actual_start_at,
        status: { id: row.status_id, label: row.status_label },
        result: labelRef(row.result_id, row.result_label),
        resultSummary: row.result_summary,
        confirmedAt: row.confirmed_at,
      }),
    );
    return createPage(items, total[0]?.total ?? 0, page);
  }

  async activityRows(criteria: ActivityCriteria, page: ReportPageRequest<ActivityReportSortField>): Promise<Page<ActivityReportRecord>> {
    const where = activityWhereSql(criteria);
    const { rows, total } = await runReportRead(this.prisma, async (db) => ({
      rows: await db.$queryRaw<ActivityRow[]>`
        SELECT a.id, a.code, aty.id AS type_id, aty.label AS type_label, a.subject,
               c.id AS customer_id, c.legal_name AS customer_name,
               apj.id AS project_id, apj.code AS project_code, apj.name AS project_name,
               au.id AS owner_id, au.display_name AS owner_name,
               ${ACTIVITY_DATE_SQL} AS activity_date, a.due_at,
               pr.id AS priority_id, pr.label AS priority_label, ${PRIORITY_WEIGHT_SQL} AS priority_weight,
               s.id AS status_id, s.label AS status_label, ar.id AS result_id, ar.label AS result_label, a.result_notes
        ${ACTIVITY_FROM_SQL}
        JOIN catalog_items aty ON aty.id = a.type_id
        JOIN users au ON au.id = a.owner_id
        JOIN catalog_items pr ON pr.id = a.priority_id
        JOIN catalog_items s ON s.id = a.status_id
        LEFT JOIN catalog_items ar ON ar.id = a.result_id
        WHERE ${where}
        ${orderBy(activitySort(page.sortBy), page.sortOrder, Prisma.sql`a.id`)}
        LIMIT ${page.pageSize} OFFSET ${offsetOf(page)}`,
      total: await db.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${ACTIVITY_FROM_SQL} WHERE ${where}`,
    }));
    const items = rows.map(
      (row): ActivityReportRecord => ({
        id: row.id,
        code: row.code,
        type: { id: row.type_id, label: row.type_label },
        subject: row.subject,
        customer: { id: row.customer_id, name: row.customer_name },
        project: projectRef(row.project_id, row.project_code, row.project_name),
        owner: { id: row.owner_id, displayName: row.owner_name },
        activityDate: row.activity_date,
        dueAt: row.due_at,
        priority: { id: row.priority_id, label: row.priority_label, weight: Number(row.priority_weight) },
        status: { id: row.status_id, label: row.status_label },
        result: labelRef(row.result_id, row.result_label),
        resultNotes: row.result_notes,
      }),
    );
    return createPage(items, total[0]?.total ?? 0, page);
  }

  // -------------------------------------------------------------------------
  // Opciones de filtro
  // -------------------------------------------------------------------------

  async visibleOwners(scope: VisibilityScope): Promise<UserRef[]> {
    const owners = this.visibleRecordsUnion(scope, {
      project: Prisma.sql`p.owner_id`,
      opportunity: Prisma.sql`o.owner_id`,
      forecast: Prisma.sql`fl.owner_id`,
      visit: Prisma.sql`v.owner_id`,
      activity: Prisma.sql`a.owner_id`,
    });
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<{ id: string; display_name: string }[]>`
        SELECT u.id, u.display_name FROM users u
        WHERE u.id IN (${owners})
        ORDER BY lower(u.display_name) ASC, u.id ASC`,
    );
    return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
  }

  async visibleCountries(scope: VisibilityScope): Promise<CountryOptionRecord[]> {
    const countries = this.visibleRecordsUnion(scope, {
      project: Prisma.sql`p.country_id`,
      opportunity: Prisma.sql`p.country_id`,
      forecast: Prisma.sql`p.country_id`,
      visit: Prisma.sql`c.country_id`,
      activity: Prisma.sql`c.country_id`,
    });
    const scopeCountries = scope.kind === 'FILTERED' ? scope.countryIds : [];
    const rows = await runReportRead(
      this.prisma,
      (db) => db.$queryRaw<{ id: string; name: string; currency_code: string }[]>`
        SELECT co.id, co.name, co.currency_code FROM countries co
        WHERE co.id IN (${countries}) OR ${uuidInSql(Prisma.sql`co.id`, scopeCountries)}
        ORDER BY co.sort_order ASC, lower(co.name) ASC, co.id ASC`,
    );
    return rows.map((row) => ({ id: row.id, name: row.name, currencyCode: row.currency_code }));
  }

  async productFamilies(): Promise<NamedRef[]> {
    const rows = await this.prisma.productFamily.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return rows;
  }

  async countryCurrencies(countryIds: readonly string[]): Promise<CountryOptionRecord[]> {
    if (countryIds.length === 0) return [];
    const rows = await this.prisma.country.findMany({
      where: { id: { in: [...countryIds] } },
      select: { id: true, name: true, currencyCode: true },
    });
    return rows;
  }

  /**
   * `SELECT columna` de los registros vigentes y visibles de cada entidad, unidos: los
   * mismos predicados que los reportes con criterios vacíos (sin filtros ni período).
   */
  private visibleRecordsUnion(
    scope: VisibilityScope,
    columns: { project: Prisma.Sql; opportunity: Prisma.Sql; forecast: Prisma.Sql; visit: Prisma.Sql; activity: Prisma.Sql },
  ): Prisma.Sql {
    const project = projectWhereSql({
      ...NO_FILTERS,
      scope,
      nonFinalPhaseIds: [],
      finalPhaseIds: [],
      openStageRanking: [],
      phaseRanking: [],
      period: null,
      search: null,
      city: null,
      projectTypeIds: [],
      phaseIds: [],
      commercialStatus: [],
      situation: 'ALL',
    });
    const opportunity = opportunityWhereSql({
      ...NO_FILTERS,
      scope,
      openStageIds: [],
      closedStageIds: [],
      period: null,
      stageIds: [],
      statuses: [],
      productIds: [],
      productFamilyIds: [],
    });
    const forecastWhere = forecastWhereSql({
      ...NO_FILTERS,
      scope,
      fromMonth: { year: 1, month: 1 },
      toMonth: { year: 9999, month: 12 },
      projectIds: [],
      productIds: [],
      productFamilyIds: [],
    });
    const emptyVisitSets = { SCHEDULED: [], COMPLETED: [], CONFIRMED: [], CANCELLED: [] };
    const visit = visitWhereSql({ ...NO_FILTERS, scope, statusSets: emptyVisitSets, period: null, projectIds: [], categories: [], statusIds: [] });
    const activity = activityWhereSql({
      ...NO_FILTERS,
      scope,
      now: new Date(0),
      statusSets: { open: [], completed: [], cancelled: [] },
      period: null,
      typeIds: [],
      priorityIds: [],
      categories: [],
      statusIds: [],
    });
    return Prisma.sql`
      SELECT ${columns.project} FROM projects p JOIN customers c ON c.id = p.customer_id WHERE ${project}
      UNION SELECT ${columns.opportunity} ${OPPORTUNITY_FROM_SQL} WHERE ${opportunity}
      UNION SELECT ${columns.forecast} ${FORECAST_FROM_SQL} WHERE ${forecastWhere}
      UNION SELECT ${columns.visit} ${VISIT_FROM_SQL} WHERE ${visit}
      UNION SELECT ${columns.activity} ${ACTIVITY_FROM_SQL} WHERE ${activity}`;
  }
}
