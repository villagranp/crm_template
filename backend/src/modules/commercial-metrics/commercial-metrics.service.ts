import { Inject, Injectable } from '@nestjs/common';

import { divideDecimal, isZeroDecimal, multiplyDecimal, sumDecimals } from '@/common/decimal';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { VisibilityScope } from '@/modules/access/visibility-scope';

import { type DateRange, type PeriodKind, periodInstants, resolvePeriod } from './commercial-period';
import {
  catalogOrder,
  completedActivityStatusIds,
  confirmedVisitStatusIds,
  doneVisitStatusIds,
  forecastWindowMonths,
  nonFinalPhaseIds,
  openActivityStatusIds,
  openStageIds,
  pendingVisitStatusIds,
  type SemanticCatalogItem,
  type YearMonth,
} from './metric-definitions';
import {
  type AchievementSubject,
  COMMERCIAL_METRICS_READ_MODEL,
  type CommercialMetricsReadModel,
  type SalesTargetRecord,
  type TargetMetric,
  type TargetSubjectFilter,
  type UnitRef,
} from './ports/commercial-metrics-read-model.port';

/** Contexto de cálculo (01 F.2). */
export interface MetricContext {
  /** Alcance del permiso de la fuente, resuelto por `VisibilityScopeResolver`. */
  readonly scope: VisibilityScope;
  /** Inyectable para pruebas. */
  readonly now: Date;
  /** `crm.zona_horaria_negocio`. */
  readonly businessTimeZone: string;
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

export const METRIC_CATALOGS = {
  projectPhase: 'crm.fase_cliente',
  opportunityStage: 'crm.etapa_oportunidad',
  visitStatus: 'crm.estado_visita',
  activityStatus: 'crm.estado_actividad',
} as const;

const SCALE = 4;
const ZERO = '0.0000';

/**
 * Fuente única de las fórmulas KPI-01…KPI-10 (01 RN-01.10, D-01.2): Inicio las
 * consume y Reportes (Módulo 5) amplía este mismo servicio con sus agregaciones.
 * La semántica sale siempre del catálogo (RN-01.12) a través de los predicados de
 * `metric-definitions.ts`; nunca de etiquetas ni de UUID fijos.
 */
@Injectable()
export class CommercialMetricsService {
  constructor(
    @Inject(COMMERCIAL_METRICS_READ_MODEL) private readonly readModel: CommercialMetricsReadModel,
    private readonly logger: AppLogger,
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
    const rows = await this.readModel.countVisits(ctx.scope, pendingVisitStatusIds(statuses), ctx.now, until);
    return { ...rows, upcomingDays };
  }

  /** KPI-08/09: pendientes (abiertas no vencidas, con "por vencer") y vencidas, disjuntas (RN-01.17). */
  async countActivities(ctx: MetricContext, dueSoonHours: number): Promise<ActivityCounts> {
    const statuses = await this.readModel.catalogItems(METRIC_CATALOGS.activityStatus);
    const until = new Date(ctx.now.getTime() + dueSoonHours * 3_600_000);
    const rows = await this.readModel.countActivities(ctx.scope, openActivityStatusIds(statuses), ctx.now, until);
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
