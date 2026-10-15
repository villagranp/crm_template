import type { DecimalString } from '@/common/decimal';
import type { Page } from '@/infrastructure/database/ports/pagination';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';
import type { CommercialStatusFilter } from '@/modules/projects/project-commercial-status';

import type { BusinessDateWindow, DateRange } from '../commercial-period';
import type {
  ActivityCategory,
  MetricClock,
  OpportunityCounts,
  OpportunityStatusFilter,
  SemanticCatalogItem,
  VisitCategory,
  YearMonth,
} from '../metric-definitions';

/**
 * Puerto de lectura de los **conteos e indicadores** compartidos por Inicio y Reportes
 * (01 F.2, 05 G.3, 00 §11). Token `COMMERCIAL_METRICS_READ_MODEL` (01 L.1); adaptador
 * `prisma-commercial-metrics.repository.ts`. Tipos de dominio, sin Prisma (ADR-004).
 *
 * Reglas comunes a todas las consultas (las aplica el adaptador, nunca el llamador):
 *
 * - **Alcance** (`scope`, 00 §4.2 + herencias DM-13) como predicado SQL; un alcance
 *   `FILTERED` vacío no ve nada.
 * - **Registro vigente** (RN-01.13, RN-05.5, D-05.12): ni el registro, ni su proyecto,
 *   ni su cliente eliminados lógicamente.
 * - **Semántica por ids** (RN-05.6): los conjuntos de etapas, fases y estados llegan
 *   ya resueltos desde `metric-definitions.ts`; el SQL nunca lee la `metadata`.
 * - **Sin multiplicar filas** (RN-05.19, RN-05.39): cada conteo es sobre la tabla del
 *   registro; productos con `EXISTS`; `visit_events` nunca entra en un `FROM`.
 * - Lectura `REPEATABLE READ READ ONLY` con `statement_timeout` (05 D.3); al vencer,
 *   `503 REPORT_TIMEOUT`.
 *
 * Los mismos criterios los usa `ReportingRepository` (Reportes) para las filas, así
 * que la lista y sus conteos salen del **mismo** conjunto (RN-05.9).
 */
export const COMMERCIAL_METRICS_READ_MODEL = Symbol('COMMERCIAL_METRICS_READ_MODEL');

/** Contexto de cálculo de 01 F.2: alcance resuelto + reloj del negocio (`now` inyectable). */
export interface MetricContext extends MetricClock {
  /** Resuelto por `VisibilityScopeResolver` con el permiso de quien consulta (`reportes.ver`, `oportunidades.ver`…). */
  readonly scope: VisibilityScope;
  /**
   * Alcance de `proyectos.ver` para la herencia de visitas y actividades en Inicio (04 H.3,
   * DM-13, 01 P-2): un registro vinculado a un proyecto visible cuenta aunque su dueño quede
   * fuera de `scope`. Solo lo usan KPI-06…09; sin él no hay herencia. Reportes no lo usa:
   * aplica `reportes.ver` a lo directo y a lo heredado (05 P-05.3).
   */
  readonly inheritedProjectScope?: VisibilityScope;
}

/** Período sobre la columna elegida (`dateBasis`, C.2): fechas para `date`, instantes para `timestamptz`. */
export interface PeriodCriterion<TBasis extends string> {
  readonly basis: TBasis;
  readonly window: BusinessDateWindow;
}

// ---------------------------------------------------------------------------
// Criterios por entidad
// ---------------------------------------------------------------------------

export const OPPORTUNITY_DATE_BASES = ['IDENTIFIED', 'DECIDED', 'UPDATED'] as const;
/** `opportunity_date` (DM-35), `opportunity_results.decision_date`, `opportunities.updated_at`. */
export type OpportunityDateBasis = (typeof OPPORTUNITY_DATE_BASES)[number];

export interface OpportunityCriteria {
  readonly scope: VisibilityScope;
  /** DEF-A resuelto (`openStageIds` / `closedStageIds`). */
  readonly openStageIds: readonly string[];
  readonly closedStageIds: readonly string[];
  readonly period: PeriodCriterion<OpportunityDateBasis> | null;
  readonly ownerIds: readonly string[];
  readonly customerIds: readonly string[];
  /** País del **proyecto** (00 §4.2). */
  readonly countryIds: readonly string[];
  readonly stageIds: readonly string[];
  /** RN-05.32, combinados con `OR`. */
  readonly statuses: readonly OpportunityStatusFilter[];
  /** D-05.10: con `EXISTS` sobre `project_products` no eliminados (nunca un `JOIN`). */
  readonly productIds: readonly string[];
  readonly productFamilyIds: readonly string[];
  /** Tipo de cliente (`customers.company_type_id`, `crm.tipo_empresa`, D-05.8, RN-05.57): filtro del embudo. */
  readonly companyTypeIds?: readonly string[];
}

export const PROJECT_DATE_BASES = ['DECISION_ESTIMATED', 'UPDATED', 'CREATED'] as const;
/** `estimated_decision_date`, `last_activity_at` (DEF-C), `created_at`. */
export type ProjectDateBasis = (typeof PROJECT_DATE_BASES)[number];

export const PROJECT_SITUATIONS = ['ACTIVE', 'FINISHED', 'ALL'] as const;
/** `ACTIVE` = fase no final (RN-05.15); `FINISHED` = fase final (RN-05.16). */
export type ProjectSituation = (typeof PROJECT_SITUATIONS)[number];

export interface ProjectCriteria {
  readonly scope: VisibilityScope;
  readonly nonFinalPhaseIds: readonly string[];
  readonly finalPhaseIds: readonly string[];
  /** DEF-B: etapas abiertas por rango de desempate (`openStageRanking`). */
  readonly openStageRanking: readonly string[];
  /** Fases por `metadata.order`, para ordenar por `phaseOrder`. */
  readonly phaseRanking: readonly string[];
  readonly period: PeriodCriterion<ProjectDateBasis> | null;
  /** Ya recortada y en minúsculas sin acentos; ≤ 100 caracteres (H.2). */
  readonly search: string | null;
  readonly city: string | null;
  readonly countryIds: readonly string[];
  readonly ownerIds: readonly string[];
  readonly customerIds: readonly string[];
  readonly projectTypeIds: readonly string[];
  readonly phaseIds: readonly string[];
  readonly commercialStatus: readonly CommercialStatusFilter[];
  readonly situation: ProjectSituation;
}

export interface ForecastCriteria {
  readonly scope: VisibilityScope;
  /** Período absoluto de la línea (`year`, `month`), ambos incluidos. */
  readonly fromMonth: YearMonth;
  readonly toMonth: YearMonth;
  readonly projectIds: readonly string[];
  readonly customerIds: readonly string[];
  readonly productIds: readonly string[];
  readonly productFamilyIds: readonly string[];
  /** `forecast_lines.owner_id`. */
  readonly ownerIds: readonly string[];
  /** País del proyecto. */
  readonly countryIds: readonly string[];
}

export const VISIT_DATE_BASES = ['SCHEDULED', 'ACTUAL', 'CONFIRMED'] as const;
/** `scheduled_start_at` **vigente** (RN-05.39), `actual_start_at`, `confirmed_at`. */
export type VisitDateBasis = (typeof VISIT_DATE_BASES)[number];

export interface VisitCriteria {
  readonly scope: VisibilityScope;
  /** Ids de estado por categoría (`visitStatusIdsByCategory`). */
  readonly statusSets: Readonly<Record<VisitCategory, readonly string[]>>;
  readonly period: PeriodCriterion<VisitDateBasis> | null;
  readonly ownerIds: readonly string[];
  readonly customerIds: readonly string[];
  /** País del **cliente** (AC-05.19). */
  readonly countryIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly categories: readonly VisitCategory[];
  readonly statusIds: readonly string[];
}

export const ACTIVITY_DATE_BASES = ['ACTIVITY_DATE', 'DUE', 'COMPLETED'] as const;
/** `COALESCE(scheduled_at, due_at)`, `due_at`, `completed_at`. */
export type ActivityDateBasis = (typeof ACTIVITY_DATE_BASES)[number];

export interface ActivityCriteria {
  readonly scope: VisibilityScope;
  /** "Ahora" para vencidas (RN-05.7: instante del servidor). */
  readonly now: Date;
  /** Ids de estado por grupo (`activityStatusIdsByGroup`). */
  readonly statusSets: Readonly<{ open: readonly string[]; completed: readonly string[]; cancelled: readonly string[] }>;
  readonly period: PeriodCriterion<ActivityDateBasis> | null;
  readonly ownerIds: readonly string[];
  readonly customerIds: readonly string[];
  /** País del **cliente**. */
  readonly countryIds: readonly string[];
  readonly typeIds: readonly string[];
  readonly priorityIds: readonly string[];
  readonly categories: readonly ActivityCategory[];
  readonly statusIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

export interface UserRef {
  readonly id: string;
  readonly displayName: string;
}

export interface UnitRef {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
}

/** Conteos + estimación total (RN-05.13, RN-05.29): Σ `estimated_amount_usd` y Σ toneladas no nulas. */
export interface OpportunityTotalsRecord extends OpportunityCounts {
  /** 4 decimales; `'0.0000'` si no hay montos. */
  readonly amountUsd: DecimalString;
  readonly tonnage: DecimalString;
}

export interface StageCountRecord {
  readonly stageId: string;
  readonly count: number;
}

/** RN-05.31: por `opportunities.owner_id`. */
export interface OwnerOpportunityCountsRecord {
  readonly owner: UserRef;
  readonly total: number;
  readonly open: number;
  readonly won: number;
  readonly partial: number;
  readonly lost: number;
}

export interface ProjectCountsRecord {
  readonly total: number;
  /** RN-05.15 (KPI-01). */
  readonly active: number;
  /** RN-05.16. */
  readonly finished: number;
}

/** Agregado de líneas de forecast de un mes y una unidad. */
export interface ForecastCellRecord {
  readonly year: number;
  readonly month: number;
  readonly unit: UnitRef;
  /** Σ `quantity` (4 decimales): solo dentro de la misma unidad (RN-05.12). */
  readonly quantity: DecimalString;
  /** Σ `tonnage` de las líneas con conversión (4 decimales). */
  readonly tonnage: DecimalString;
  readonly lineCount: number;
  /** Líneas con `tonnage IS NULL` (DM-24). */
  readonly linesWithoutConversion: number;
}

export interface ForecastTotalsRecord {
  readonly cells: readonly ForecastCellRecord[];
  /** RN-05.37: `MAX(updated_at)` de las líneas filtradas y visibles. */
  readonly lastUpdatedAt: Date | null;
  readonly lineCount: number;
}

export const FORECAST_GROUP_BY = ['MONTH', 'PRODUCT', 'FAMILY', 'PROJECT', 'CUSTOMER', 'OWNER'] as const;
export type ForecastGroupBy = (typeof FORECAST_GROUP_BY)[number];

/** Clave de un grupo de la consolidación (RN-05.36). `MONTH` no tiene id: su etiqueta es `YYYY-MM`. */
export interface ForecastGroupKey {
  readonly type: ForecastGroupBy;
  readonly id: string | null;
  readonly label: string;
}

export interface ForecastGroupCellRecord extends ForecastCellRecord {
  readonly key: ForecastGroupKey;
  /** Segundo nivel (`thenBy`), o `null`. */
  readonly subKey: ForecastGroupKey | null;
}

export interface ForecastGroupsRecord {
  /** Página de claves del primer nivel, en su orden (mes cronológico; el resto por etiqueta). */
  readonly keys: Page<ForecastGroupKey>;
  /** Celdas de esas claves (todas sus subclaves). */
  readonly cells: readonly ForecastGroupCellRecord[];
}

export interface ForecastGrouping {
  readonly groupBy: ForecastGroupBy;
  readonly thenBy: ForecastGroupBy | null;
}

/** RN-05.38–RN-05.40. Las categorías suman `total`; los informativos no son aditivos. */
export interface VisitCountsRecord {
  readonly total: number;
  readonly scheduled: number;
  readonly completed: number;
  readonly confirmed: number;
  readonly cancelled: number;
  /** Visitas con `reschedule_count > 0` (contadas una vez, RN-05.39). */
  readonly rescheduledVisits: number;
  /** Σ `reschedule_count`. */
  readonly rescheduleEvents: number;
  /** Pendientes con `scheduled_start_at < ahora`. */
  readonly overduePending: number;
  /** Pendientes con `scheduled_start_at ∈ [ahora, upcomingUntil]` (KPI-07); 0 sin límite. */
  readonly upcoming: number;
}

/** RN-05.41, RN-05.42. Las cuatro categorías suman `total`. */
export interface ActivityCountsRecord {
  readonly total: number;
  readonly pending: number;
  readonly overdue: number;
  readonly completed: number;
  readonly cancelled: number;
  /** Pendientes con `due_at ∈ [ahora, dueSoonUntil]` (DEF-D); 0 sin límite. */
  readonly dueSoon: number;
}

/** Fase con su conteo (dashboard, panel "Proyectos activos", E.7). */
export interface PhaseCountRecord {
  readonly phaseId: string;
  readonly count: number;
}

/** Oportunidades por mes de la columna del período (`period.basis`): identificadas o decididas (RN-05.52). */
export interface OpportunityMonthRecord {
  readonly year: number;
  readonly month: number;
  readonly total: number;
  readonly wonFull: number;
  readonly partial: number;
  readonly lost: number;
}

/** Conteo de un mes. */
export interface MonthCountRecord {
  readonly year: number;
  readonly month: number;
  readonly count: number;
}

/** Visitas realizadas (`actual_start_at`, realizadas + confirmadas) y canceladas (`cancelled_at`) por mes. */
export interface VisitMonthRecord {
  readonly year: number;
  readonly month: number;
  readonly completed: number;
  readonly cancelled: number;
}

/** Toneladas de forecast por asesor de la línea (dashboard, "Distribución por asesor"). */
export interface OwnerTonnageRecord {
  readonly owner: UserRef;
  /** Σ `tonnage` de las líneas con conversión (4 decimales). */
  readonly tonnage: DecimalString;
}

/** Etapa del embudo con su orden (RN-05.53). */
export interface FunnelStageRef {
  readonly stageId: string;
  readonly order: number;
}

/**
 * Alcance de cada oportunidad del conjunto (RN-05.55): mayor `order` entre las etapas
 * del embudo presentes en su historial (incluida la vigente), agrupado.
 */
export interface FunnelReachRecord {
  /** `null` = nunca estuvo en una etapa del embudo. */
  readonly maxOrder: number | null;
  /** ¿Tiene al menos una fila en `opportunity_stage_history`? */
  readonly hasHistory: boolean;
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Indicadores de Inicio (01 F.2, KPI-01…KPI-10)
// ---------------------------------------------------------------------------

export interface StageCountRow {
  readonly stageId: string;
  readonly count: number;
}

export interface OutcomeCountRow {
  readonly outcome: 'WON' | 'LOST' | 'PARTIAL';
  readonly count: number;
}

export interface ForecastMonthRow extends YearMonth {
  /** Decimal en texto (4 decimales); `null` si el mes no tiene toneladas. */
  readonly tonnage: string | null;
  readonly lineCount: number;
}

export interface ForecastWindowRows {
  readonly months: readonly ForecastMonthRow[];
  readonly unconvertedLines: number;
  readonly quantitiesByUnit: readonly { readonly unit: UnitRef; readonly quantity: string }[];
}

export interface VisitCountRows {
  readonly pending: number;
  readonly overdue: number;
  readonly upcoming: number;
}

export interface ActivityCountRows {
  readonly pending: number;
  readonly dueSoon: number;
  readonly overdue: number;
}

export type TargetMetric = 'TONNAGE' | 'WON_OPPORTUNITIES' | 'VISITS' | 'ACTIVITIES' | 'AMOUNT';

export interface SalesTargetRecord {
  readonly id: string;
  readonly metric: TargetMetric;
  readonly year: number;
  readonly month: number | null;
  readonly userId: string | null;
  readonly teamId: string | null;
  readonly countryId: string | null;
  readonly productFamilyId: string | null;
  readonly targetValue: string;
  readonly subjectLabel: string;
}

/** Sujeto cuyos registros cuentan para el "logrado" de una meta (D-01.8). */
export type AchievementSubject =
  | { readonly kind: 'OWNERS'; readonly ownerIds: readonly string[] }
  | { readonly kind: 'COUNTRY'; readonly countryId: string }
  | { readonly kind: 'ALL' };

export interface AchievementQuery {
  readonly metric: TargetMetric;
  readonly subject: AchievementSubject;
  readonly period: DateRange;
  /** Para métricas con `timestamptz` (visitas, actividades). */
  readonly periodStart: Date;
  readonly periodEndExclusive: Date;
  readonly doneVisitStatusIds: readonly string[];
  readonly completedActivityStatusIds: readonly string[];
}

export interface TargetSubjectFilter {
  readonly userIds: readonly string[];
  readonly teamIds: readonly string[];
  readonly countryIds: readonly string[];
  /** Metas de país de todas las organizaciones (ORGANIZATION). */
  readonly allCountries: boolean;
}

/**
 * Un solo puerto para Inicio (01 F.2) y Reportes (05 G.3). Las consultas de Inicio
 * reciben el alcance y los ids ya resueltos; las de Reportes, un criterio por entidad.
 * Ambas familias aplican los mismos predicados de visibilidad y vigencia y las mismas
 * definiciones (`metric-definitions.ts`); PF-05.30 comprueba que cuadran.
 */
export interface CommercialMetricsReadModel {
  // --- Inicio (01 F.2) ---

  /** Elementos de un catálogo (activos e inactivos: un registro puede apuntar a uno desactivado). */
  catalogItems(catalogKey: string): Promise<SemanticCatalogItem[]>;
  unitByCode(code: string): Promise<UnitRef | null>;
  /** KPI-01: proyectos vigentes visibles con fase en `phaseIds`. */
  countProjects(scope: VisibilityScope, phaseIds: readonly string[]): Promise<number>;
  /** KPI-02: oportunidades vigentes visibles por etapa (solo las etapas pedidas). */
  countOpportunitiesByStage(scope: VisibilityScope, stageIds: readonly string[]): Promise<StageCountRow[]>;
  /** KPI-03/04: oportunidades vigentes visibles con resultado decidido en el período (una fila por oportunidad). */
  countOpportunitiesByOutcome(scope: VisibilityScope, period: DateRange): Promise<OutcomeCountRow[]>;
  /** KPI-05: líneas de forecast de proyectos vigentes visibles en los meses dados. */
  forecastWindow(scope: VisibilityScope, months: readonly YearMonth[]): Promise<ForecastWindowRows>;
  /** KPI-06/07: visitas de clientes y proyectos vigentes, visibles, con estado pendiente. */
  countVisits(visibility: CommercialVisibility, pendingStatusIds: readonly string[], now: Date, upcomingUntil: Date): Promise<VisitCountRows>;
  /** KPI-08/09: actividades vigentes visibles abiertas. */
  countActivities(visibility: CommercialVisibility, openStatusIds: readonly string[], now: Date, dueSoonUntil: Date): Promise<ActivityCountRows>;
  /** KPI-10: metas no eliminadas de los sujetos, de los meses o años indicados. */
  listTargets(subjects: TargetSubjectFilter, years: readonly number[]): Promise<SalesTargetRecord[]>;
  /** Equipos donde el usuario es responsable o miembro principal (D-01.8, TEAM). */
  teamsLedOrPrimary(userId: string): Promise<string[]>;
  /** Miembros (y responsable) de un equipo y sus subequipos activos. */
  teamOwnerIds(teamId: string): Promise<string[]>;
  /** "Logrado" de una métrica en un período (decimal en texto, 4 decimales). */
  achieved(query: AchievementQuery): Promise<string>;

  // --- Reportes (05 G.3) ---

  opportunityTotals(criteria: OpportunityCriteria): Promise<OpportunityTotalsRecord>;
  /** Conteo por etapa vigente; solo etapas con al menos una oportunidad. */
  opportunityStageCounts(criteria: OpportunityCriteria): Promise<StageCountRecord[]>;
  opportunityOwnerCounts(criteria: OpportunityCriteria): Promise<OwnerOpportunityCountsRecord[]>;
  projectCounts(criteria: ProjectCriteria): Promise<ProjectCountsRecord>;
  /** Celdas (año, mes, unidad) de las líneas con `quantity > 0` del rango. */
  forecastTotals(criteria: ForecastCriteria): Promise<ForecastTotalsRecord>;
  forecastGroups(criteria: ForecastCriteria, grouping: ForecastGrouping, page: { page: number; pageSize: number }): Promise<ForecastGroupsRecord>;
  visitCounts(criteria: VisitCriteria, now: Date, upcomingUntil: Date | null): Promise<VisitCountsRecord>;
  activityCounts(criteria: ActivityCriteria, dueSoonUntil: Date | null): Promise<ActivityCountsRecord>;
  /** Conteo por fase (solo fases con proyectos). */
  projectPhaseCounts(criteria: ProjectCriteria): Promise<PhaseCountRecord[]>;
  /** Exige `criteria.period`: agrupa por mes de su columna (`IDENTIFIED`, `DECIDED`; `UPDATED` en `timeZone`). */
  opportunityMonthlyCounts(criteria: OpportunityCriteria, timeZone: string): Promise<OpportunityMonthRecord[]>;
  /** Actividades completadas por mes de `completed_at` en `timeZone` (exige `period.basis = COMPLETED`). */
  activityMonthlyCounts(criteria: ActivityCriteria, timeZone: string): Promise<MonthCountRecord[]>;
  /** `criteria.period` se ignora: cada serie usa su columna dentro de `window`. */
  visitMonthlyCounts(criteria: VisitCriteria, window: BusinessDateWindow, timeZone: string): Promise<VisitMonthRecord[]>;
  forecastOwnerTonnage(criteria: ForecastCriteria): Promise<OwnerTonnageRecord[]>;
  opportunityFunnelReach(criteria: OpportunityCriteria, funnelStages: readonly FunnelStageRef[]): Promise<FunnelReachRecord[]>;
}
