import { Inject, Injectable } from '@nestjs/common';

import { type DecimalString, sumDecimals } from '@/common/decimal';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import { itemRuleViolations, semanticsFor, validateMetadata } from '@/modules/catalogs/catalog-semantics.registry';
import { openStageRanking } from '@/modules/projects/project-commercial-status';

import { type CatalogSemanticsIssue, invalidCatalogSemanticsError } from './commercial-metrics-errors';
import { type DateRange, monthsBetween, type PeriodKind, resolvePeriod, toBusinessWindow } from './commercial-period';
import {
  activityStatusIdsByGroup,
  catalogOrder,
  closedStageIds,
  dueSoonLimit,
  finalPhaseIds,
  forecastWindowMonths,
  isClosedStage,
  nonFinalPhaseIds,
  type OpportunityCounts,
  openStageIds,
  type SemanticCatalogItem,
  upcomingVisitsLimit,
  type VisitCategory,
  visitStatusIdsByCategory,
  type YearMonth,
} from './metric-definitions';
import {
  type ActivityCountsRecord,
  type ActivityCriteria,
  COMMERCIAL_METRICS_READ_MODEL,
  type CommercialMetricsReadModel,
  type ForecastCellRecord,
  type ForecastCriteria,
  type ForecastGroupKey,
  type ForecastGrouping,
  type MetricContext,
  type OpportunityCriteria,
  type OpportunityTotalsRecord,
  type OwnerOpportunityCountsRecord,
  type ProjectCountsRecord,
  type ProjectCriteria,
  type UnitRef,
  type VisitCountsRecord,
  type VisitCriteria,
} from './ports/commercial-metrics-read-model.port';

/** Catálogos con semántica que leen los indicadores (00 §3.3). */
export const METRIC_CATALOGS = {
  stage: 'crm.etapa_oportunidad',
  phase: 'crm.fase_cliente',
  visitStatus: 'crm.estado_visita',
  activityStatus: 'crm.estado_actividad',
} as const;

const QUANTITY_DECIMALS = 4;
const ZERO = (0).toFixed(QUANTITY_DECIMALS);

/** Elemento de catálogo con su semántica, estado y orden de presentación. */
export interface MetricCatalogItem extends SemanticCatalogItem {
  readonly isActive: boolean;
  readonly sortOrder: number;
}

/**
 * Semántica de los catálogos ya validada y resuelta a ids (RN-05.6). Se lee en cada
 * consulta (sin caché): un cambio del catálogo rige en la siguiente (PF-05.31).
 */
export interface CommercialSemantics {
  /** Todas las etapas (activas o no), por `metadata.order` y `code`. */
  readonly stages: readonly MetricCatalogItem[];
  readonly phases: readonly MetricCatalogItem[];
  readonly visitStatuses: readonly MetricCatalogItem[];
  readonly activityStatuses: readonly MetricCatalogItem[];
  readonly openStageIds: readonly string[];
  readonly closedStageIds: readonly string[];
  readonly openStageRanking: readonly string[];
  readonly nonFinalPhaseIds: readonly string[];
  readonly finalPhaseIds: readonly string[];
  readonly phaseRanking: readonly string[];
  readonly visitStatusSets: Readonly<Record<VisitCategory, readonly string[]>>;
  readonly activityStatusSets: Readonly<{ open: readonly string[]; completed: readonly string[]; cancelled: readonly string[] }>;
}

/** Etapa con su conteo (01 F.1 `byStage`, 05 RN-05.30). */
export interface StageCount {
  readonly stageId: string;
  readonly code: string;
  readonly label: string;
  readonly order: number;
  readonly isClosed: boolean;
  readonly isActive: boolean;
  readonly count: number;
}

/** Resumen de oportunidades (05 F.3): conteos + estimación total en USD y toneladas (RN-05.13). */
export type OpportunityTotals = OpportunityTotalsRecord;

export interface UnitQuantity {
  readonly unit: UnitRef;
  readonly quantity: DecimalString;
}

export interface UnitQuantityWithCumulative extends UnitQuantity {
  readonly cumulative: DecimalString;
}

/** Total mensual del forecast (RN-05.34) con su acumulado (RN-05.35). */
export interface ForecastMonthTotal {
  readonly year: number;
  readonly month: number;
  readonly tonnage: DecimalString;
  readonly cumulativeTonnage: DecimalString;
  /** Una entrada por cada unidad que aparece en el rango (0 si ese mes no tiene líneas de ella). */
  readonly quantities: readonly UnitQuantityWithCumulative[];
  readonly lineCount: number;
  readonly linesWithoutConversion: number;
}

export interface ForecastAggregate {
  readonly tonnage: DecimalString;
  readonly quantities: readonly UnitQuantity[];
  readonly lineCount: number;
  readonly linesWithoutConversion: number;
}

export interface ForecastTotals {
  readonly range: { readonly from: YearMonth; readonly to: YearMonth };
  readonly months: readonly ForecastMonthTotal[];
  readonly totals: ForecastAggregate;
  readonly lastUpdatedAt: Date | null;
  readonly lineCount: number;
}

export interface ForecastGroupMonth extends ForecastAggregate {
  readonly year: number;
  readonly month: number;
}

/** Grupo de la consolidación (RN-05.36): toneladas por mes del rango, total, cantidades por unidad. */
export interface ForecastGroup {
  readonly key: ForecastGroupKey;
  readonly months: readonly ForecastGroupMonth[];
  readonly total: ForecastAggregate;
  /** Solo con `thenBy`. */
  readonly subgroups: readonly ForecastGroup[] | null;
}

// --- Tipos de los indicadores de Inicio (01 F.1/F.2) ---

export interface ForecastWindowSummary {
  readonly window: { readonly from: YearMonth; readonly to: YearMonth };
  /** `null` si no hay líneas en la ventana (RN-01.11, "Sin proyección"). */
  readonly totalTonnage: DecimalString | null;
  readonly months: readonly { readonly year: number; readonly month: number; readonly tonnage: DecimalString; readonly lineCount: number }[];
  readonly unconvertedLines: number;
  readonly quantitiesByUnit: readonly UnitQuantity[];
}

/** KPI-06/07. */
export interface VisitCounts {
  readonly pending: number;
  /** Pendientes con `scheduled_start_at < ahora`. */
  readonly overdue: number;
  readonly upcoming: number;
}

/** KPI-08/09 (D-01.6: pendientes y vencidas disjuntas). */
export interface ActivityCounts {
  readonly pending: number;
  readonly dueSoon: number;
  readonly overdue: number;
}

function toMetricItem(item: { id: string; code: string; label: string; metadata: unknown; isActive: boolean; sortOrder: number }): MetricCatalogItem {
  const metadata = typeof item.metadata === 'object' && item.metadata !== null && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : null;
  return { id: item.id, code: item.code, label: item.label, metadata, isActive: item.isActive, sortOrder: item.sortOrder };
}

function byOrder(a: MetricCatalogItem, b: MetricCatalogItem): number {
  return catalogOrder(a) - catalogOrder(b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}

function bySortOrder(a: MetricCatalogItem, b: MetricCatalogItem): number {
  return a.sortOrder - b.sortOrder || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}

function unitKey(unit: UnitRef): string {
  return unit.id;
}

/** Unidades presentes en las celdas, por código. */
function unitsOf(cells: readonly ForecastCellRecord[]): UnitRef[] {
  const units = new Map<string, UnitRef>();
  for (const cell of cells) units.set(unitKey(cell.unit), cell.unit);
  return [...units.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** Suma de celdas: toneladas, cantidades **por unidad** (nunca entre unidades, RN-05.12) y líneas. */
function aggregate(cells: readonly ForecastCellRecord[], units: readonly UnitRef[]): ForecastAggregate {
  return {
    tonnage: sumDecimals(
      cells.map((cell) => cell.tonnage),
      QUANTITY_DECIMALS,
    ),
    quantities: units.map((unit) => ({
      unit,
      quantity: sumDecimals(
        cells.filter((cell) => cell.unit.id === unit.id).map((cell) => cell.quantity),
        QUANTITY_DECIMALS,
      ),
    })),
    lineCount: cells.reduce((total, cell) => total + cell.lineCount, 0),
    linesWithoutConversion: cells.reduce((total, cell) => total + cell.linesWithoutConversion, 0),
  };
}

function monthsOf(cells: readonly ForecastCellRecord[], months: readonly YearMonth[], units: readonly UnitRef[]): ForecastGroupMonth[] {
  return months.map((period) => ({
    year: period.year,
    month: period.month,
    ...aggregate(
      cells.filter((cell) => cell.year === period.year && cell.month === period.month),
      units,
    ),
  }));
}

/**
 * Servicio compartido de indicadores (01 F.2, 05 G.3): **fuente única** de las fórmulas
 * de Inicio y Reportes (RN-01.10). Resuelve la semántica de catálogos a ids, delega los
 * agregados en `CommercialMetricsReadModel` y compone el resultado con las definiciones
 * de `metric-definitions.ts`. No resuelve alcances ni lee parámetros: el alcance, el
 * reloj y los umbrales llegan del llamador (`MetricContext`, criterios).
 */
@Injectable()
export class CommercialMetricsService {
  constructor(
    @Inject(COMMERCIAL_METRICS_READ_MODEL) private readonly readModel: CommercialMetricsReadModel,
    private readonly catalogs: CatalogLookupService,
  ) {}

  // -------------------------------------------------------------------------
  // Semántica de catálogos (RN-05.6, 05 G.4)
  // -------------------------------------------------------------------------

  /**
   * Lee etapas, fases y estados con su semántica y comprueba la `metadata` de cada
   * elemento contra el registro de 00 §3.3 (activos o no: registros viejos pueden
   * seguir usándolos). Un elemento inválido → `422 INVALID_CATALOG_SEMANTICS`.
   */
  async semantics(): Promise<CommercialSemantics> {
    const [stages, phases, visitStatuses, activityStatuses] = await Promise.all([
      this.loadCatalog(METRIC_CATALOGS.stage),
      this.loadCatalog(METRIC_CATALOGS.phase),
      this.loadCatalog(METRIC_CATALOGS.visitStatus),
      this.loadCatalog(METRIC_CATALOGS.activityStatus),
    ]);
    const issues = [...stages.issues, ...phases.issues, ...visitStatuses.issues, ...activityStatuses.issues];
    if (issues.length > 0) throw invalidCatalogSemanticsError(issues);

    const sortedStages = [...stages.items].sort(byOrder);
    const sortedPhases = [...phases.items].sort(byOrder);
    return {
      stages: sortedStages,
      phases: sortedPhases,
      visitStatuses: [...visitStatuses.items].sort(bySortOrder),
      activityStatuses: [...activityStatuses.items].sort(bySortOrder),
      openStageIds: openStageIds(sortedStages),
      closedStageIds: closedStageIds(sortedStages),
      openStageRanking: openStageRanking(sortedStages),
      nonFinalPhaseIds: nonFinalPhaseIds(sortedPhases),
      finalPhaseIds: finalPhaseIds(sortedPhases),
      phaseRanking: sortedPhases.map((phase) => phase.id),
      visitStatusSets: visitStatusIdsByCategory(visitStatuses.items),
      activityStatusSets: activityStatusIdsByGroup(activityStatuses.items),
    };
  }

  private async loadCatalog(key: string): Promise<{ items: MetricCatalogItem[]; issues: CatalogSemanticsIssue[] }> {
    const catalog = await this.catalogs.findByKey(key);
    const semantics = semanticsFor(key);
    if (!catalog || !semantics) {
      return { items: [], issues: [{ catalog: key, itemCode: null, issue: 'Catalog not found' }] };
    }
    const items = catalog.items.map(toMetricItem);
    const issues: CatalogSemanticsIssue[] = [];
    for (const item of catalog.items) {
      const problems = [...validateMetadata(semantics, item.metadata).map((problem) => `${problem.field}: ${problem.issue}`)];
      if (problems.length === 0) problems.push(...itemRuleViolations(semantics, item.metadata));
      for (const issue of problems) issues.push({ catalog: key, itemCode: item.code, issue });
    }
    return { items, issues };
  }

  // -------------------------------------------------------------------------
  // Agregaciones con filtros (Reportes, 05 G.3)
  // -------------------------------------------------------------------------

  /** RN-05.19–RN-05.29: conteos disjuntos + Σ `estimated_amount_usd` y Σ toneladas. */
  countOpportunities(criteria: OpportunityCriteria): Promise<OpportunityTotals> {
    return this.readModel.opportunityTotals(criteria);
  }

  /**
   * RN-05.30: todas las etapas **activas** en `metadata.order` (también con 0) y, además,
   * las inactivas que aún tienen oportunidades, para que la distribución sume el total.
   */
  async stageDistribution(criteria: OpportunityCriteria, semantics: CommercialSemantics): Promise<StageCount[]> {
    const counts = new Map((await this.readModel.opportunityStageCounts(criteria)).map((row) => [row.stageId, row.count]));
    return semantics.stages
      .filter((stage) => stage.isActive || (counts.get(stage.id) ?? 0) > 0)
      .map((stage) => ({
        stageId: stage.id,
        code: stage.code,
        label: stage.label,
        order: catalogOrder(stage),
        isClosed: isClosedStage(stage),
        isActive: stage.isActive,
        count: counts.get(stage.id) ?? 0,
      }));
  }

  /** RN-05.31: por `opportunities.owner_id`; la suma de `total` es el total del conjunto. */
  ownerDistribution(criteria: OpportunityCriteria): Promise<OwnerOpportunityCountsRecord[]> {
    return this.readModel.opportunityOwnerCounts(criteria);
  }

  /** RN-05.15/16: total, activos y finalizados del conjunto filtrado. */
  countProjects(criteria: ProjectCriteria): Promise<ProjectCountsRecord> {
    return this.readModel.projectCounts(criteria);
  }

  /** RN-05.38–RN-05.40. `upcomingDays` = `crm.inicio.visitas_proximas_dias` (D-05.6); `null` sin "próximas". */
  countVisitCategories(criteria: VisitCriteria, now: Date, upcomingDays: number | null): Promise<VisitCountsRecord> {
    return this.readModel.visitCounts(criteria, now, upcomingDays === null ? null : upcomingVisitsLimit(now, upcomingDays));
  }

  /** RN-05.41/42. `dueSoonHours` = `crm.alertas.actividad_por_vencer_horas`; `null` sin "por vencer". */
  countActivityCategories(criteria: ActivityCriteria, dueSoonHours: number | null): Promise<ActivityCountsRecord> {
    return this.readModel.activityCounts(criteria, dueSoonHours === null ? null : dueSoonLimit(criteria.now, dueSoonHours));
  }

  /**
   * RN-05.34/35/37: un total por **cada** mes del rango (también vacíos), su acumulado en
   * toneladas, cantidades por unidad con su acumulado, líneas sin conversión y la última
   * actualización del conjunto.
   */
  async forecastTotals(criteria: ForecastCriteria): Promise<ForecastTotals> {
    const record = await this.readModel.forecastTotals(criteria);
    const units = unitsOf(record.cells);
    const months = monthsBetween(criteria.fromMonth, criteria.toMonth);
    let cumulativeTonnage = ZERO;
    const cumulativeByUnit = new Map(units.map((unit) => [unit.id, ZERO]));
    const monthTotals: ForecastMonthTotal[] = monthsOf(record.cells, months, units).map((month) => {
      cumulativeTonnage = sumDecimals([cumulativeTonnage, month.tonnage], QUANTITY_DECIMALS);
      return {
        year: month.year,
        month: month.month,
        tonnage: month.tonnage,
        cumulativeTonnage,
        quantities: month.quantities.map((entry) => {
          const cumulative = sumDecimals([cumulativeByUnit.get(entry.unit.id) ?? ZERO, entry.quantity], QUANTITY_DECIMALS);
          cumulativeByUnit.set(entry.unit.id, cumulative);
          return { ...entry, cumulative };
        }),
        lineCount: month.lineCount,
        linesWithoutConversion: month.linesWithoutConversion,
      };
    });
    return {
      range: { from: criteria.fromMonth, to: criteria.toMonth },
      months: monthTotals,
      totals: aggregate(record.cells, units),
      lastUpdatedAt: record.lastUpdatedAt,
      lineCount: record.lineCount,
    };
  }

  /**
   * RN-05.36: grupos del primer nivel paginados (con `thenBy`, sus subgrupos), cada uno
   * con las toneladas de **cada** mes del rango, su total, cantidades por unidad y
   * líneas sin conversión. La suma de los grupos coincide con `forecastTotals` (AC-05.14).
   */
  async forecastConsolidation(criteria: ForecastCriteria, grouping: ForecastGrouping, page: { page: number; pageSize: number }): Promise<Page<ForecastGroup>> {
    const record = await this.readModel.forecastGroups(criteria, grouping, page);
    const months = monthsBetween(criteria.fromMonth, criteria.toMonth);
    const groups = record.keys.items.map((key) => {
      const cells = record.cells.filter((cell) => cell.key.label === key.label && cell.key.id === key.id);
      const units = unitsOf(cells);
      let subgroups: ForecastGroup[] | null = null;
      if (grouping.thenBy) {
        const subKeys = new Map<string, ForecastGroupKey>();
        for (const cell of cells) if (cell.subKey) subKeys.set(`${cell.subKey.id ?? ''}|${cell.subKey.label}`, cell.subKey);
        subgroups = [...subKeys.entries()].map(([id, subKey]) => {
          const subCells = cells.filter((cell) => cell.subKey && `${cell.subKey.id ?? ''}|${cell.subKey.label}` === id);
          const subUnits = unitsOf(subCells);
          return { key: subKey, months: monthsOf(subCells, months, subUnits), total: aggregate(subCells, subUnits), subgroups: null };
        });
      }
      return { key, months: monthsOf(cells, months, units), total: aggregate(cells, units), subgroups };
    });
    return { ...record.keys, items: groups };
  }

  // -------------------------------------------------------------------------
  // Indicadores de Inicio (01 F.2): mismas agregaciones, sin filtros adicionales
  // -------------------------------------------------------------------------

  /** KPI-01: proyectos vigentes con fase no final (DM-16). */
  async countActiveProjects(ctx: MetricContext): Promise<number> {
    const semantics = await this.semantics();
    return (await this.countProjects(this.projectCriteria(ctx, semantics))).active;
  }

  /** KPI-02: abiertas, con desglose por etapa abierta (orden `metadata.order`). */
  async countOpenOpportunities(ctx: MetricContext): Promise<{ total: number; byStage: StageCount[] }> {
    const semantics = await this.semantics();
    const criteria = { ...this.opportunityCriteria(ctx, semantics), statuses: ['OPEN'] as const };
    const [counts, byStage] = await Promise.all([this.countOpportunities(criteria), this.stageDistribution(criteria, semantics)]);
    return { total: counts.open, byStage: byStage.filter((stage) => !stage.isClosed) };
  }

  /** KPI-03: ganadas (WON + PARTIAL) con `decision_date` en el período (DM-15). */
  async countWonOpportunities(ctx: MetricContext, period: DateRange): Promise<{ total: number; won: number; partial: number }> {
    const counts = await this.decidedCounts(ctx, period);
    return { total: counts.won, won: counts.wonFull, partial: counts.partial };
  }

  /** KPI-04: perdidas con `decision_date` en el período. */
  async countLostOpportunities(ctx: MetricContext, period: DateRange): Promise<number> {
    return (await this.decidedCounts(ctx, period)).lost;
  }

  /** KPI-05: ventana M+1…M+H; solo toneladas convertidas; cantidades por unidad; `null` sin líneas. */
  async forecastWindow(ctx: MetricContext, horizonMonths: number): Promise<ForecastWindowSummary> {
    const window = forecastWindowMonths(ctx, horizonMonths);
    const from = window[0] as YearMonth;
    const to = window[window.length - 1] as YearMonth;
    const totals = await this.forecastTotals(this.forecastCriteria(ctx, from, to));
    return {
      window: { from, to },
      totalTonnage: totals.lineCount === 0 ? null : totals.totals.tonnage,
      months: totals.months.map((month) => ({ year: month.year, month: month.month, tonnage: month.tonnage, lineCount: month.lineCount })),
      unconvertedLines: totals.totals.linesWithoutConversion,
      quantitiesByUnit: totals.totals.quantities,
    };
  }

  /** KPI-06/07: pendientes (cualquier fecha), atrasadas y próximas en `[ahora, ahora + días]`. */
  async countVisits(ctx: MetricContext, upcomingDays: number): Promise<VisitCounts> {
    const semantics = await this.semantics();
    const counts = await this.countVisitCategories(this.visitCriteria(ctx, semantics), ctx.now, upcomingDays);
    return { pending: counts.scheduled, overdue: counts.overduePending, upcoming: counts.upcoming };
  }

  /** KPI-08/09: pendientes (no vencidas), por vencer y vencidas (D-01.6). */
  async countActivities(ctx: MetricContext, dueSoonHours: number): Promise<ActivityCounts> {
    const semantics = await this.semantics();
    const counts = await this.countActivityCategories(this.activityCriteria(ctx, semantics), dueSoonHours);
    return { pending: counts.pending, dueSoon: counts.dueSoon, overdue: counts.overdue };
  }

  /** 01 F.2: mes, trimestre o año en curso en la zona del negocio (D-01.3). */
  resolvePeriod(kind: PeriodKind, ctx: MetricContext): DateRange {
    return resolvePeriod(kind, ctx);
  }

  /** DEF-G. */
  forecastWindowMonths(ctx: MetricContext, horizonMonths: number): YearMonth[] {
    return forecastWindowMonths(ctx, horizonMonths);
  }

  // -------------------------------------------------------------------------
  // Criterios "sin filtros adicionales" (Inicio = Reportes con el alcance y sin período, 05 G.3)
  // -------------------------------------------------------------------------

  opportunityCriteria(ctx: MetricContext, semantics: CommercialSemantics): OpportunityCriteria {
    return {
      scope: ctx.scope,
      openStageIds: semantics.openStageIds,
      closedStageIds: semantics.closedStageIds,
      period: null,
      ownerIds: [],
      customerIds: [],
      countryIds: [],
      stageIds: [],
      statuses: [],
      productIds: [],
      productFamilyIds: [],
    };
  }

  projectCriteria(ctx: MetricContext, semantics: CommercialSemantics): ProjectCriteria {
    return {
      scope: ctx.scope,
      nonFinalPhaseIds: semantics.nonFinalPhaseIds,
      finalPhaseIds: semantics.finalPhaseIds,
      openStageRanking: semantics.openStageRanking,
      phaseRanking: semantics.phaseRanking,
      period: null,
      search: null,
      city: null,
      countryIds: [],
      ownerIds: [],
      customerIds: [],
      projectTypeIds: [],
      phaseIds: [],
      commercialStatus: [],
      situation: 'ALL',
    };
  }

  forecastCriteria(ctx: MetricContext, fromMonth: YearMonth, toMonth: YearMonth): ForecastCriteria {
    return { scope: ctx.scope, fromMonth, toMonth, projectIds: [], customerIds: [], productIds: [], productFamilyIds: [], ownerIds: [], countryIds: [] };
  }

  visitCriteria(ctx: MetricContext, semantics: CommercialSemantics): VisitCriteria {
    return {
      scope: ctx.scope,
      statusSets: semantics.visitStatusSets,
      period: null,
      ownerIds: [],
      customerIds: [],
      countryIds: [],
      projectIds: [],
      categories: [],
      statusIds: [],
    };
  }

  activityCriteria(ctx: MetricContext, semantics: CommercialSemantics): ActivityCriteria {
    return {
      scope: ctx.scope,
      now: ctx.now,
      statusSets: semantics.activityStatusSets,
      period: null,
      ownerIds: [],
      customerIds: [],
      countryIds: [],
      typeIds: [],
      priorityIds: [],
      categories: [],
      statusIds: [],
    };
  }

  private async decidedCounts(ctx: MetricContext, period: DateRange): Promise<OpportunityCounts> {
    const semantics = await this.semantics();
    return this.countOpportunities({
      ...this.opportunityCriteria(ctx, semantics),
      period: { basis: 'DECIDED', window: toBusinessWindow(period, ctx.businessTimeZone) },
    });
  }
}

