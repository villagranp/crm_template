import { Inject, Injectable } from '@nestjs/common';

import { type DecimalString, divideDecimal, isZeroDecimal, multiplyDecimal, sumDecimals } from '@/common/decimal';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { noVisibility, type VisibilityScope } from '@/modules/access/visibility-scope';
import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import { itemRuleViolations, semanticsFor, validateMetadata } from '@/modules/catalogs/catalog-semantics.registry';
import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';
import { openStageRanking } from '@/modules/projects/project-commercial-status';

import { type CatalogSemanticsIssue, invalidCatalogSemanticsError } from './commercial-metrics-errors';
import { type DateRange, monthsBetween, parseYearMonth, type PeriodKind, periodInstants, resolvePeriod, toBusinessWindow } from './commercial-period';
import {
  activityStatusIdsByGroup,
  catalogOrder,
  closedStageIds,
  completedActivityStatusIds,
  confirmedVisitStatusIds,
  doneVisitStatusIds,
  dueSoonLimit,
  finalPhaseIds,
  forecastWindowMonths,
  isClosedStage,
  isFinalPhase,
  isFunnelStage,
  nonFinalPhaseIds,
  openActivityStatusIds,
  openStageIds,
  pendingVisitStatusIds,
  type SemanticCatalogItem,
  upcomingVisitsLimit,
  type VisitCategory,
  visitStatusIdsByCategory,
  type YearMonth,
} from './metric-definitions';
import {
  type AchievementSubject,
  type ActivityCountsRecord,
  type ActivityCriteria,
  COMMERCIAL_METRICS_READ_MODEL,
  type CommercialMetricsReadModel,
  type ForecastCellRecord,
  type ForecastCriteria,
  type ForecastGroupKey,
  type ForecastGrouping,
  type FunnelReachRecord,
  type MetricContext,
  type OpportunityCriteria,
  type OpportunityTotalsRecord,
  type OwnerOpportunityCountsRecord,
  type OwnerTonnageRecord,
  type ProjectCountsRecord,
  type ProjectCriteria,
  type SalesTargetRecord,
  type TargetMetric,
  type TargetSubjectFilter,
  type UnitRef,
  type VisitCountsRecord,
  type VisitCriteria,
} from './ports/commercial-metrics-read-model.port';

/** Contexto de cálculo (01 F.2): alcance, reloj y, en Inicio, la herencia por proyecto. Definido en el puerto. */
export type { MetricContext };

/** Visibilidad de visitas y actividades: alcance directo + herencia por proyecto (mismo predicado que el Módulo 4). */
function commercialVisibility(ctx: MetricContext): CommercialVisibility {
  return { direct: ctx.scope, inherited: ctx.inheritedProjectScope ?? noVisibility(ctx.scope.userId) };
}

export interface StageCount {
  readonly stageId: string;
  readonly code: string;
  readonly label: string;
  readonly order: number;
  readonly count: number;
}

export interface ForecastWindowSummary {
  readonly window: { readonly from: YearMonth; readonly to: YearMonth };
  readonly tonnageUnit: UnitRef | null;
  /** `null` si ninguna línea de la ventana tiene toneladas (RN-01.11: "Sin proyección"). */
  readonly totalTonnage: string | null;
  readonly months: readonly { readonly year: number; readonly month: number; readonly tonnage: string; readonly lineCount: number }[];
  readonly unconvertedLines: number;
  readonly quantitiesByUnit: readonly { readonly unitCode: string; readonly unitSymbol: string; readonly quantity: string }[];
}

export interface VisitCounts {
  readonly pending: number;
  readonly overdue: number;
  readonly upcoming: number;
  readonly upcomingDays: number;
}

export interface ActivityCounts {
  readonly pending: number;
  readonly dueSoon: number;
  readonly overdue: number;
  readonly dueSoonHours: number;
}

export interface TargetCompliance {
  readonly targetId: string | null;
  readonly metric: TargetMetric;
  readonly subject: { readonly type: 'USER' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION'; readonly id: string | null; readonly label: string };
  readonly targetValue: string;
  readonly achievedValue: string;
  /** `null` si el objetivo es 0 (RN-01.18). */
  readonly compliancePercent: string | null;
  readonly unit: UnitRef | null;
  /** `USD` en `AMOUNT` (DM-36); `null` en el resto. */
  readonly currencyCode: 'USD' | null;
}

/** Catálogos con semántica que leen los indicadores (00 §3.3). */
export const METRIC_CATALOGS = {
  projectPhase: 'crm.fase_cliente',
  opportunityStage: 'crm.etapa_oportunidad',
  visitStatus: 'crm.estado_visita',
  activityStatus: 'crm.estado_actividad',
} as const;

const SCALE = 4;
const QUANTITY_DECIMALS = SCALE;
const PERCENT_DECIMALS = 2;
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

/** Etapa de la distribución de Reportes (05 RN-05.30): `StageCount` de 01 + semántica y estado. */
export interface ReportStageCount extends StageCount {
  readonly isClosed: boolean;
  readonly isActive: boolean;
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

// --- Embudo (F-41) ---

/** D-05.9: denominador mínimo de la conversión acumulada (constante; parámetro si el negocio lo pide). */
export const MIN_FUNNEL_SAMPLE = 5;

export const FUNNEL_UNAVAILABLE_REASONS = ['NO_DATA', 'INSUFFICIENT_HISTORY', 'INSUFFICIENT_SAMPLE'] as const;
/** Motivo de un porcentaje `null` (RN-05.11, RN-05.54, RN-05.55). */
export type FunnelUnavailableReason = (typeof FUNNEL_UNAVAILABLE_REASONS)[number];

export interface SalesFunnelStage {
  readonly stage: { readonly id: string; readonly code: string; readonly label: string; readonly order: number };
  /** Oportunidades del conjunto cuya etapa **vigente** es esta (RN-05.53). */
  readonly count: number;
  /** % del total en etapas del embudo (2 decimales); `null` si el total es 0 (RN-05.54). */
  readonly shareOfTotal: DecimalString | null;
  /** % de las que alcanzaron la primera etapa que alcanzaron esta (RN-05.55); `null` con motivo. */
  readonly cumulativeConversion: DecimalString | null;
  /** Motivo del primer porcentaje `null` de la etapa (`NO_DATA` si ambos lo son). */
  readonly unavailableReason: FunnelUnavailableReason | null;
}

export interface SalesFunnel {
  readonly stages: readonly SalesFunnelStage[];
  readonly totalInFunnel: number;
  readonly sampleMinimum: number;
}

/** Etapas activas `inFunnel` en `metadata.order` (RN-05.53); sin `order` entero → `422 INVALID_CATALOG_SEMANTICS`. */
export function funnelStagesOf(stages: readonly MetricCatalogItem[]): MetricCatalogItem[] {
  const funnelStages = stages.filter((stage) => stage.isActive && isFunnelStage(stage));
  const invalid = funnelStages.filter((stage) => !Number.isInteger(stage.metadata?.['order']));
  if (invalid.length > 0) {
    throw invalidCatalogSemanticsError(
      invalid.map((stage) => ({ catalog: METRIC_CATALOGS.opportunityStage, itemCode: stage.code, issue: 'order: an inFunnel stage requires an integer order' })),
    );
  }
  return [...funnelStages].sort(byOrder);
}

/** Porcentaje `part / whole × 100` con 2 decimales `HALF_UP` (aritmética decimal). */
export function percentOf(part: number, whole: number): DecimalString {
  return divideDecimal(String(part * 100), String(whole), PERCENT_DECIMALS);
}

/**
 * RN-05.55, D-05.9: conversión acumulada calculable solo si **todas** las oportunidades
 * del conjunto tienen historial y las que alcanzaron la primera etapa son ≥ `MIN_FUNNEL_SAMPLE`.
 */
export function funnelConversion(
  reach: readonly FunnelReachRecord[],
  funnelStages: readonly MetricCatalogItem[],
): { readonly reason: FunnelUnavailableReason | null; readonly denominator: number; readonly reached: (order: number) => number } {
  const reached = (order: number): number => reach.filter((row) => row.maxOrder !== null && row.maxOrder >= order).reduce((sum, row) => sum + row.count, 0);
  const total = reach.reduce((sum, row) => sum + row.count, 0);
  const first = funnelStages[0];
  const denominator = first ? reached(catalogOrder(first)) : 0;
  let reason: FunnelUnavailableReason | null = null;
  if (total === 0 || !first) reason = 'NO_DATA';
  else if (reach.some((row) => !row.hasHistory && row.count > 0)) reason = 'INSUFFICIENT_HISTORY';
  else if (denominator < MIN_FUNNEL_SAMPLE) reason = 'INSUFFICIENT_SAMPLE';
  return { reason, denominator, reached };
}

// --- Dashboard (F-40) ---

/** Filtros del dashboard (E.7): período de calendario, asesor y país, dentro del alcance. */
export interface CommercialDashboardCriteria extends MetricContext {
  readonly period: DateRange;
  readonly ownerIds: readonly string[];
  readonly countryIds: readonly string[];
}

export const MONTHLY_SERIES_METRICS = ['OPPORTUNITIES_IDENTIFIED', 'WON', 'LOST', 'ACTIVITIES_COMPLETED', 'VISITS_COMPLETED'] as const;
/** Indicadores con tendencia (RN-05.52); "proyectos activos" no tiene (D-05.13). */
export type MonthlySeriesMetric = (typeof MONTHLY_SERIES_METRICS)[number];

export interface MonthlyPoint {
  readonly year: number;
  readonly month: number;
  readonly value: number;
}

/** Un mes del dashboard con cada indicador en su columna histórica (RN-05.52). */
export interface MonthlyCounts {
  readonly year: number;
  readonly month: number;
  /** `opportunity_date`. */
  readonly identified: number;
  /** `decision_date`: WON + PARTIAL (DM-15). */
  readonly won: number;
  readonly wonFull: number;
  readonly partial: number;
  readonly lost: number;
  /** `completed_at`. */
  readonly activitiesCompleted: number;
  /** `actual_start_at`: realizadas + confirmadas. */
  readonly visitsCompleted: number;
  /** `cancelled_at`. */
  readonly visitsCancelled: number;
}

export interface PhaseCount {
  readonly phaseId: string;
  readonly code: string;
  readonly label: string;
  readonly order: number;
  readonly count: number;
}

/** Meses de calendario del período, ambos extremos incluidos. */
export function periodMonths(period: DateRange): YearMonth[] {
  const from = parseYearMonth(period.from.slice(0, 7));
  const to = parseYearMonth(period.to.slice(0, 7));
  return from && to ? monthsBetween(from, to) : [];
}

export function seriesOf(metric: MonthlySeriesMetric, rows: readonly MonthlyCounts[]): MonthlyPoint[] {
  const pick: Record<MonthlySeriesMetric, (row: MonthlyCounts) => number> = {
    OPPORTUNITIES_IDENTIFIED: (row) => row.identified,
    WON: (row) => row.won,
    LOST: (row) => row.lost,
    ACTIVITIES_COMPLETED: (row) => row.activitiesCompleted,
    VISITS_COMPLETED: (row) => row.visitsCompleted,
  };
  return rows.map((row) => ({ year: row.year, month: row.month, value: pick[metric](row) }));
}

/**
 * Servicio compartido de indicadores (01 F.2, 05 G.3): **fuente única** de las fórmulas
 * de Inicio y Reportes (01 RN-01.10, D-01.2). Inicio usa KPI-01…KPI-10 con la firma de
 * 01 F.2; Reportes, las agregaciones con criterios por entidad (05 P-05.2). Ambas familias
 * resuelven la semántica con los predicados de `metric-definitions.ts` (nunca etiquetas ni
 * UUID fijos, RN-01.12, RN-05.6) y delegan los agregados en `CommercialMetricsReadModel`.
 * No resuelve alcances ni lee parámetros: el alcance, el reloj y los umbrales llegan del
 * llamador (`MetricContext`, criterios).
 */
@Injectable()
export class CommercialMetricsService {
  constructor(
    @Inject(COMMERCIAL_METRICS_READ_MODEL) private readonly readModel: CommercialMetricsReadModel,
    private readonly logger: AppLogger,
    private readonly catalogs: CatalogLookupService,
  ) {}

  /**
   * Elementos de un catálogo con su semántica (`metadata`), para que los modelos de
   * lectura de Inicio y Reportes filtren con los predicados de `metric-definitions.ts`.
   */
  semanticCatalog(catalogKey: string): Promise<SemanticCatalogItem[]> {
    return this.readModel.catalogItems(catalogKey);
  }

  /** KPI-01: proyectos vigentes con fase `isFinal = false` (DM-16). */
  async countActiveProjects(ctx: MetricContext): Promise<number> {
    const phases = await this.readModel.catalogItems(METRIC_CATALOGS.projectPhase);
    return this.readModel.countProjects(ctx.scope, nonFinalPhaseIds(phases));
  }

  /** KPI-02: oportunidades vigentes abiertas (DEF-A), con desglose por etapa en el orden del catálogo. */
  async countOpenOpportunities(ctx: MetricContext): Promise<{ total: number; byStage: StageCount[] }> {
    const stages = await this.readModel.catalogItems(METRIC_CATALOGS.opportunityStage);
    const rows = await this.readModel.countOpportunitiesByStage(ctx.scope, openStageIds(stages));
    const counts = new Map(rows.map((row) => [row.stageId, row.count]));
    const byStage = stages
      .filter((stage) => counts.has(stage.id))
      .map((stage) => ({ stageId: stage.id, code: stage.code, label: stage.label, order: catalogOrder(stage), count: counts.get(stage.id) ?? 0 }))
      .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
    return { total: byStage.reduce((sum, stage) => sum + stage.count, 0), byStage };
  }

  /** KPI-03: ganadas = `WON` + `PARTIAL` decididas en el período (DM-15). */
  async countWonOpportunities(ctx: MetricContext, period: DateRange): Promise<{ total: number; won: number; partial: number }> {
    return (await this.countOutcomes(ctx, period)).won;
  }

  /** KPI-04: perdidas = `LOST` decididas en el período. */
  async countLostOpportunities(ctx: MetricContext, period: DateRange): Promise<number> {
    return (await this.countOutcomes(ctx, period)).lost;
  }

  /** KPI-03 y KPI-04 con una sola lectura (Inicio pide ambos a la vez, H.5). */
  async countOutcomes(ctx: MetricContext, period: DateRange): Promise<{ won: { total: number; won: number; partial: number }; lost: number }> {
    const rows = await this.readModel.countOpportunitiesByOutcome(ctx.scope, period);
    const count = (outcome: 'WON' | 'LOST' | 'PARTIAL'): number => rows.find((row) => row.outcome === outcome)?.count ?? 0;
    return { won: { total: count('WON') + count('PARTIAL'), won: count('WON'), partial: count('PARTIAL') }, lost: count('LOST') };
  }

  /**
   * KPI-05: toneladas de la ventana M+1…M+H (RN-01.16). Las cantidades se informan
   * por unidad y nunca se suman entre unidades; las líneas con cantidad y sin
   * conversión no entran en el total.
   */
  async forecastWindow(ctx: MetricContext, horizonMonths: number, tonnageUnitCode?: string): Promise<ForecastWindowSummary> {
    const months = this.forecastWindowMonths(ctx, horizonMonths);
    const [rows, tonnageUnit] = await Promise.all([
      this.readModel.forecastWindow(ctx.scope, months),
      tonnageUnitCode ? this.readModel.unitByCode(tonnageUnitCode) : Promise.resolve(null),
    ]);
    const byMonth = new Map(rows.months.map((row) => [`${row.year}-${row.month}`, row]));
    const monthly = months.map((month) => {
      const row = byMonth.get(`${month.year}-${month.month}`);
      return { year: month.year, month: month.month, tonnage: row?.tonnage ?? ZERO, lineCount: row?.lineCount ?? 0 };
    });
    const withTonnage = rows.months.filter((row) => row.tonnage !== null).map((row) => row.tonnage as string);
    return {
      window: { from: months[0] as YearMonth, to: months[months.length - 1] as YearMonth },
      tonnageUnit,
      totalTonnage: withTonnage.length === 0 ? null : sumDecimals(withTonnage, SCALE),
      months: monthly,
      unconvertedLines: rows.unconvertedLines,
      quantitiesByUnit: rows.quantitiesByUnit.map((entry) => ({ unitCode: entry.unit.code, unitSymbol: entry.unit.symbol, quantity: entry.quantity })),
    };
  }

  /** KPI-06/07: visitas pendientes (con atrasadas) y próximas en `upcomingDays` días. */
  async countVisits(ctx: MetricContext, upcomingDays: number): Promise<VisitCounts> {
    const statuses = await this.readModel.catalogItems(METRIC_CATALOGS.visitStatus);
    const until = new Date(ctx.now.getTime() + upcomingDays * 86_400_000);
    const rows = await this.readModel.countVisits(commercialVisibility(ctx), pendingVisitStatusIds(statuses), ctx.now, until);
    return { ...rows, upcomingDays };
  }

  /** KPI-08/09: pendientes (abiertas no vencidas, con "por vencer") y vencidas, disjuntas (RN-01.17). */
  async countActivities(ctx: MetricContext, dueSoonHours: number): Promise<ActivityCounts> {
    const statuses = await this.readModel.catalogItems(METRIC_CATALOGS.activityStatus);
    const until = new Date(ctx.now.getTime() + dueSoonHours * 3_600_000);
    const rows = await this.readModel.countActivities(commercialVisibility(ctx), openActivityStatusIds(statuses), ctx.now, until);
    return { ...rows, dueSoonHours };
  }

  /**
   * KPI-10 (D-01.8, DM-9): metas aplicables al ámbito y al período, con su logrado
   * y cumplimiento. Sujeto según el alcance: OWN → metas del usuario; TEAM → de los
   * equipos que lidera o de su equipo principal; COUNTRY → de su país;
   * ORGANIZATION → suma de las metas de país por métrica.
   */
  async targetCompliance(ctx: MetricContext, period: DateRange, tonnageUnitCode = 'TON'): Promise<TargetCompliance[]> {
    const { scope } = ctx;
    const userId = scope.userId;
    if (!userId) return [];
    const subjects = await this.targetSubjects(scope, userId);
    const years = yearsOf(period);
    const targets = (await this.readModel.listTargets(subjects, years)).filter((target) => {
      if (target.productFamilyId !== null) {
        // Sin fórmula de logrado por familia de producto (no la define 01): no se muestra (precisión P-4).
        this.logger.warn('sales_target_with_product_family_skipped', { targetId: target.id });
        return false;
      }
      return targetInPeriod(target, period);
    });
    if (targets.length === 0) return [];

    const [visitStatuses, activityStatuses, tonnageUnit] = await Promise.all([
      this.readModel.catalogItems(METRIC_CATALOGS.visitStatus),
      this.readModel.catalogItems(METRIC_CATALOGS.activityStatus),
      this.readModel.unitByCode(tonnageUnitCode),
    ]);
    const instants = periodInstants(period, ctx.businessTimeZone);
    const achievedFor = (metric: TargetMetric, subject: AchievementSubject): Promise<string> =>
      this.readModel.achieved({
        metric,
        subject,
        period,
        periodStart: instants.start,
        periodEndExclusive: instants.endExclusive,
        doneVisitStatusIds: [...doneVisitStatusIds(visitStatuses), ...confirmedVisitStatusIds(visitStatuses)],
        completedActivityStatusIds: completedActivityStatusIds(activityStatuses),
      });

    const groups = await this.groupTargets(targets, scope.dataScope === 'ORGANIZATION');
    // Logrado de todos los grupos en paralelo (H.5: sin consultas en serie por meta).
    const achievedValues = await Promise.all(groups.map((group) => achievedFor(group.metric, group.achievementSubject)));
    const items: TargetCompliance[] = [];
    for (const [index, group] of groups.entries()) {
      const achievedValue = achievedValues[index] as string;
      items.push({
        targetId: group.targetId,
        metric: group.metric,
        subject: group.subject,
        targetValue: group.targetValue,
        achievedValue,
        compliancePercent: isZeroDecimal(group.targetValue) ? null : multiplyDecimal(divideDecimal(achievedValue, group.targetValue, 8), '100', 2),
        unit: group.metric === 'TONNAGE' ? tonnageUnit : null,
        currencyCode: group.metric === 'AMOUNT' ? 'USD' : null,
      });
    }
    return items;
  }

  private async targetSubjects(scope: VisibilityScope, userId: string): Promise<TargetSubjectFilter> {
    switch (scope.dataScope) {
      case 'ORGANIZATION':
        return { userIds: [], teamIds: [], countryIds: [], allCountries: true };
      case 'COUNTRY':
        return { userIds: [], teamIds: [], countryIds: scope.kind === 'FILTERED' ? [...scope.countryIds] : [], allCountries: false };
      case 'TEAM':
        return { userIds: [], teamIds: await this.readModel.teamsLedOrPrimary(userId), countryIds: [], allCountries: false };
      case 'OWN':
        return { userIds: [userId], teamIds: [], countryIds: [], allCountries: false };
      default:
        return { userIds: [], teamIds: [], countryIds: [], allCountries: false };
    }
  }

  private async groupTargets(
    targets: readonly SalesTargetRecord[],
    organization: boolean,
  ): Promise<
    {
      targetId: string | null;
      metric: TargetMetric;
      subject: TargetCompliance['subject'];
      targetValue: string;
      achievementSubject: AchievementSubject;
    }[]
  > {
    if (organization) {
      // ORGANIZATION: suma de las metas de país por métrica (D-01.8).
      const byMetric = new Map<TargetMetric, string[]>();
      for (const target of targets) byMetric.set(target.metric, [...(byMetric.get(target.metric) ?? []), target.targetValue]);
      return [...byMetric.entries()].map(([metric, values]) => ({
        targetId: null,
        metric,
        subject: { type: 'ORGANIZATION', id: null, label: 'Organización' },
        targetValue: sumDecimals(values, SCALE),
        achievementSubject: { kind: 'ALL' },
      }));
    }
    // Metas del mismo sujeto y métrica dentro del período (p. ej. tres mensuales en un trimestre) se suman.
    const groups = new Map<string, { targets: SalesTargetRecord[] }>();
    for (const target of targets) {
      const key = `${target.metric}|${target.userId ?? ''}|${target.teamId ?? ''}|${target.countryId ?? ''}`;
      const group = groups.get(key) ?? { targets: [] };
      group.targets.push(target);
      groups.set(key, group);
    }
    const result = [];
    // Miembros de cada equipo leídos una sola vez aunque tenga metas de varias métricas.
    const teamOwners = new Map<string, Promise<string[]>>();
    for (const { targets: members } of groups.values()) {
      const first = members[0] as SalesTargetRecord;
      result.push({
        targetId: members.length === 1 ? first.id : null,
        metric: first.metric,
        subject: subjectOf(first),
        targetValue: sumDecimals(
          members.map((member) => member.targetValue),
          SCALE,
        ),
        achievementSubject: await this.achievementSubject(first, teamOwners),
      });
    }
    return result;
  }

  private async achievementSubject(target: SalesTargetRecord, teamOwners: Map<string, Promise<string[]>>): Promise<AchievementSubject> {
    if (target.userId) return { kind: 'OWNERS', ownerIds: [target.userId] };
    if (target.teamId) {
      const teamId = target.teamId;
      if (!teamOwners.has(teamId)) teamOwners.set(teamId, this.readModel.teamOwnerIds(teamId));
      return { kind: 'OWNERS', ownerIds: await (teamOwners.get(teamId) as Promise<string[]>) };
    }
    if (target.countryId) return { kind: 'COUNTRY', countryId: target.countryId };
    return { kind: 'ALL' };
  }

  /** Mes, trimestre o año en curso en la zona del negocio (RN-01.15). */
  resolvePeriod(kind: PeriodKind, ctx: MetricContext): DateRange {
    return resolvePeriod(kind, ctx);
  }

  /** DEF-G: ventana M+1…M+H en la zona del negocio. */
  forecastWindowMonths(ctx: MetricContext, horizonMonths: number): YearMonth[] {
    return forecastWindowMonths(ctx, horizonMonths);
  }

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
      this.loadCatalog(METRIC_CATALOGS.opportunityStage),
      this.loadCatalog(METRIC_CATALOGS.projectPhase),
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
  async stageDistribution(criteria: OpportunityCriteria, semantics: CommercialSemantics): Promise<ReportStageCount[]> {
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
  // Embudo (F-41, RN-05.53–RN-05.56) y series mensuales (F-40, RN-05.52)
  // -------------------------------------------------------------------------

  /**
   * RN-05.53–RN-05.56. `criteria` es el conjunto **completo** del resto de filtros (sin
   * el de etapa): los porcentajes siempre se calculan sobre él; `visibleStageIds` solo
   * limita las barras devueltas (RN-05.56). Una etapa `inFunnel` sin `order` válido →
   * `422 INVALID_CATALOG_SEMANTICS` (PF-05.32).
   */
  async funnel(criteria: OpportunityCriteria, semantics: CommercialSemantics, visibleStageIds: readonly string[] = []): Promise<SalesFunnel> {
    const funnelStages = funnelStagesOf(semantics.stages);
    const [counts, reach] = await Promise.all([
      this.readModel.opportunityStageCounts(criteria),
      funnelStages.length === 0 ? Promise.resolve([]) : this.readModel.opportunityFunnelReach(criteria, funnelStages.map((stage) => ({ stageId: stage.id, order: catalogOrder(stage) }))),
    ]);
    const byStage = new Map(counts.map((row) => [row.stageId, row.count]));
    const stageCounts = funnelStages.map((stage) => ({ stage, count: byStage.get(stage.id) ?? 0 }));
    const totalInFunnel = stageCounts.reduce((sum, entry) => sum + entry.count, 0);
    const conversion = funnelConversion(reach, funnelStages);
    const visible = new Set(visibleStageIds);
    return {
      stages: stageCounts
        .filter((entry) => visible.size === 0 || visible.has(entry.stage.id))
        .map(({ stage, count }) => {
          const shareOfTotal = totalInFunnel > 0 ? percentOf(count, totalInFunnel) : null;
          const cumulative = totalInFunnel > 0 && conversion.reason === null ? percentOf(conversion.reached(catalogOrder(stage)), conversion.denominator) : null;
          return {
            stage: { id: stage.id, code: stage.code, label: stage.label, order: catalogOrder(stage) },
            count,
            shareOfTotal,
            cumulativeConversion: cumulative,
            unavailableReason: totalInFunnel === 0 ? 'NO_DATA' : (conversion.reason ?? null),
          };
        }),
      totalInFunnel,
      sampleMinimum: MIN_FUNNEL_SAMPLE,
    };
  }

  /**
   * Tabla mensual del dashboard (RN-05.52): cada indicador en su columna histórica y en la
   * zona del negocio, con **todos** los meses del período (también en 0).
   */
  async monthlyCounts(criteria: CommercialDashboardCriteria, semantics: CommercialSemantics): Promise<MonthlyCounts[]> {
    const window = toBusinessWindow(criteria.period, criteria.businessTimeZone);
    const opportunity = { ...this.dashboardOpportunityCriteria(criteria, semantics) };
    const [identified, decided, activities, visits] = await Promise.all([
      this.readModel.opportunityMonthlyCounts({ ...opportunity, period: { basis: 'IDENTIFIED', window } }, criteria.businessTimeZone),
      this.readModel.opportunityMonthlyCounts({ ...opportunity, period: { basis: 'DECIDED', window } }, criteria.businessTimeZone),
      this.readModel.activityMonthlyCounts(
        { ...this.dashboardActivityCriteria(criteria, semantics), period: { basis: 'COMPLETED', window }, categories: ['COMPLETED'] },
        criteria.businessTimeZone,
      ),
      this.readModel.visitMonthlyCounts(this.dashboardVisitCriteria(criteria, semantics), window, criteria.businessTimeZone),
    ]);
    const keyOf = (row: { year: number; month: number }): string => `${row.year}-${row.month}`;
    const identifiedBy = new Map(identified.map((row) => [keyOf(row), row]));
    const decidedBy = new Map(decided.map((row) => [keyOf(row), row]));
    const activitiesBy = new Map(activities.map((row) => [keyOf(row), row]));
    const visitsBy = new Map(visits.map((row) => [keyOf(row), row]));
    return periodMonths(criteria.period).map((month) => {
      const key = keyOf(month);
      const decidedRow = decidedBy.get(key);
      return {
        year: month.year,
        month: month.month,
        identified: identifiedBy.get(key)?.total ?? 0,
        won: (decidedRow?.wonFull ?? 0) + (decidedRow?.partial ?? 0),
        wonFull: decidedRow?.wonFull ?? 0,
        partial: decidedRow?.partial ?? 0,
        lost: decidedRow?.lost ?? 0,
        activitiesCompleted: activitiesBy.get(key)?.count ?? 0,
        visitsCompleted: visitsBy.get(key)?.completed ?? 0,
        visitsCancelled: visitsBy.get(key)?.cancelled ?? 0,
      };
    });
  }

  /** Serie mensual de un indicador con fecha histórica fiable (05 G.3 `monthlySeries`, RN-05.52). */
  async monthlySeries(metric: MonthlySeriesMetric, criteria: CommercialDashboardCriteria, semantics: CommercialSemantics): Promise<MonthlyPoint[]> {
    return seriesOf(metric, await this.monthlyCounts(criteria, semantics));
  }

  /** Conteo por fase de los proyectos **activos** (RN-05.15); estado actual, sin período (D-05.13). */
  async activeProjectsByPhase(criteria: CommercialDashboardCriteria, semantics: CommercialSemantics): Promise<{ count: number; byPhase: PhaseCount[] }> {
    const projectCriteria: ProjectCriteria = {
      ...this.projectCriteria(criteria, semantics),
      ownerIds: criteria.ownerIds,
      countryIds: criteria.countryIds,
      situation: 'ACTIVE',
    };
    const counts = new Map((await this.readModel.projectPhaseCounts(projectCriteria)).map((row) => [row.phaseId, row.count]));
    const byPhase = semantics.phases
      .filter((phase) => !isFinalPhase(phase) && (phase.isActive || (counts.get(phase.id) ?? 0) > 0))
      .map((phase) => ({ phaseId: phase.id, code: phase.code, label: phase.label, order: catalogOrder(phase), count: counts.get(phase.id) ?? 0 }));
    return { count: byPhase.reduce((sum, phase) => sum + phase.count, 0), byPhase };
  }

  /** Toneladas de forecast por asesor de la línea (dashboard). */
  forecastOwnerTonnage(criteria: ForecastCriteria): Promise<OwnerTonnageRecord[]> {
    return this.readModel.forecastOwnerTonnage(criteria);
  }

  /** Criterio de oportunidades del dashboard: alcance + asesor + país, sin período. */
  dashboardOpportunityCriteria(criteria: CommercialDashboardCriteria, semantics: CommercialSemantics): OpportunityCriteria {
    return { ...this.opportunityCriteria(criteria, semantics), ownerIds: criteria.ownerIds, countryIds: criteria.countryIds };
  }

  dashboardActivityCriteria(criteria: CommercialDashboardCriteria, semantics: CommercialSemantics): ActivityCriteria {
    return { ...this.activityCriteria(criteria, semantics), ownerIds: criteria.ownerIds, countryIds: criteria.countryIds };
  }

  dashboardVisitCriteria(criteria: CommercialDashboardCriteria, semantics: CommercialSemantics): VisitCriteria {
    return { ...this.visitCriteria(criteria, semantics), ownerIds: criteria.ownerIds, countryIds: criteria.countryIds };
  }

  // -------------------------------------------------------------------------
  // Criterios "sin filtros adicionales" (alcance y sin período, 05 G.3): base de los de Reportes
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
}

function subjectOf(target: SalesTargetRecord): TargetCompliance['subject'] {
  if (target.userId) return { type: 'USER', id: target.userId, label: target.subjectLabel };
  if (target.teamId) return { type: 'TEAM', id: target.teamId, label: target.subjectLabel };
  if (target.countryId) return { type: 'COUNTRY', id: target.countryId, label: target.subjectLabel };
  return { type: 'ORGANIZATION', id: null, label: target.subjectLabel };
}

function yearsOf(period: DateRange): number[] {
  const first = Number(period.from.slice(0, 4));
  const last = Number(period.to.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_value, index) => first + index);
}

/** La meta aplica si su propio período (mes o año) cae entero dentro del pedido (PF-01.50). */
export function targetInPeriod(target: Pick<SalesTargetRecord, 'year' | 'month'>, period: DateRange): boolean {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const start = target.month === null ? `${target.year}-01-01` : `${target.year}-${pad(target.month)}-01`;
  const endMonth = target.month ?? 12;
  const endDay = new Date(Date.UTC(target.year, endMonth, 0)).getUTCDate();
  const end = `${target.year}-${pad(endMonth)}-${pad(endDay)}`;
  return start >= period.from && end <= period.to;
}
