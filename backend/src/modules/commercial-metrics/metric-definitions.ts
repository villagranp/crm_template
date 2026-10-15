/**
 * Fuente única de las fórmulas comerciales compartidas (01 RN-01.10, 03 RN-03.77,
 * 05 RN-05.15–RN-05.18). Funciones **puras**, sin Prisma ni Nest: las usan los casos
 * de uso y los adaptadores de Proyectos, Oportunidades y Forecast, y las usarán
 * `CommercialMetricsService` (Inicio, Módulo 1) y `ReportingRepository` (Reportes).
 *
 * Ningún otro archivo pregunta por `metadata.isClosed` / `metadata.isFinal`
 * directamente (prueba de arquitectura PF-01.24): para filtrar en SQL se obtienen
 * los ids con `openStageIds` / `closedStageIds` / `nonFinalPhaseIds` y se pasan
 * como `IN (…)`.
 *
 * Creado por el Módulo 3 con DEF-A, DEF-B, DEF-C y DEF-G (y "proyecto activo",
 * RN-03.15, que DEF-B/KPI-01 necesitan). El Módulo 1 añade DEF-D, DEF-E y DEF-F y
 * el servicio (01 §L, D-01.2).
 *
 * Reportes (05 G.3, K.2 paso 1) añade, al final del archivo, las categorías
 * disjuntas de oportunidades (RN-05.20–RN-05.27), visitas (RN-05.38, DEF-E) y
 * actividades (RN-05.41, DEF-D) y sus conjuntos de ids para SQL. Las de visitas y
 * actividades **reutilizan** las definiciones de referencia del Módulo 4
 * (`visit-lifecycle.ts`, `activity-lifecycle.ts`, `activity-due-status.ts`): no son
 * una segunda implementación.
 */
import { dueSoonLimit } from '@/modules/commercial-activity/activity-due-status';
import { activityStatusGroup, activityStatusSemantics } from '@/modules/commercial-activity/activity-lifecycle';
import { visitStatusGroup, visitStatusSemantics } from '@/modules/commercial-activity/visit-lifecycle';

/** Elemento de catálogo con su semántica (`metadata`, 00 §3.3). Forma neutral, sin ORM. */
export interface SemanticCatalogItem {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
}

/** Referencia a un elemento de catálogo tal como viaja en la API (`CatalogRefDto`). */
export interface CatalogItemRef {
  readonly id: string;
  readonly code: string;
  readonly label: string;
}

function toRef(item: SemanticCatalogItem): CatalogItemRef {
  return { id: item.id, code: item.code, label: item.label };
}

/** `metadata.order` de etapas y fases (entero validado por el registro de semántica); 0 si falta. */
export function catalogOrder(item: SemanticCatalogItem): number {
  const order = item.metadata?.['order'];
  return typeof order === 'number' && Number.isFinite(order) ? order : 0;
}

// ---------------------------------------------------------------------------
// DEF-A — Oportunidad abierta / cerrada
// ---------------------------------------------------------------------------

/** DEF-A: oportunidad **cerrada** = su etapa (`crm.etapa_oportunidad`) tiene `isClosed = true`. */
export function isClosedStage(stage: SemanticCatalogItem): boolean {
  return stage.metadata?.['isClosed'] === true;
}

/** DEF-A: oportunidad **abierta** = no cerrada. */
export function isOpenStage(stage: SemanticCatalogItem): boolean {
  return !isClosedStage(stage);
}

/** Ids de etapas abiertas, para filtros SQL (`stage_id IN (…)`, nunca un `JOIN` a la `metadata`). */
export function openStageIds(stages: readonly SemanticCatalogItem[]): string[] {
  return stages.filter(isOpenStage).map((stage) => stage.id);
}

export function closedStageIds(stages: readonly SemanticCatalogItem[]): string[] {
  return stages.filter(isClosedStage).map((stage) => stage.id);
}

/** RN-05.53: etapa que forma parte del embudo comercial (`metadata.inFunnel = true`). */
export function isFunnelStage(stage: SemanticCatalogItem): boolean {
  return stage.metadata?.['inFunnel'] === true;
}

// ---------------------------------------------------------------------------
// Resultado (C.8, DM-15)
// ---------------------------------------------------------------------------

/** Valores de `opportunity_outcome` (00 §3.4). */
export type OpportunityOutcomeCode = 'WON' | 'LOST' | 'PARTIAL';

/** DM-15: "ganada" = `WON` o `PARTIAL` (el parcial cuenta como ganada). */
export function isWonOutcome(outcome: OpportunityOutcomeCode | null): boolean {
  return outcome === 'WON' || outcome === 'PARTIAL';
}

export function isLostOutcome(outcome: OpportunityOutcomeCode | null): boolean {
  return outcome === 'LOST';
}

// ---------------------------------------------------------------------------
// RN-03.15 — Proyecto activo (= KPI-01 = RN-05.15)
// ---------------------------------------------------------------------------

/** Fase final (`crm.fase_cliente` con `isFinal = true`). */
export function isFinalPhase(phase: SemanticCatalogItem): boolean {
  return phase.metadata?.['isFinal'] === true;
}

/** Ids de fases no finales, para el filtro SQL de "proyecto activo". */
export function nonFinalPhaseIds(phases: readonly SemanticCatalogItem[]): string[] {
  return phases.filter((phase) => !isFinalPhase(phase)).map((phase) => phase.id);
}

export function finalPhaseIds(phases: readonly SemanticCatalogItem[]): string[] {
  return phases.filter(isFinalPhase).map((phase) => phase.id);
}

/** RN-03.15: no eliminado y fase con `isFinal = false`. Independiente de sus oportunidades. */
export function isActiveProject(project: { readonly deletedAt: Date | null; readonly phase: SemanticCatalogItem }): boolean {
  return project.deletedAt === null && !isFinalPhase(project.phase);
}

// ---------------------------------------------------------------------------
// DEF-B — Estado comercial del proyecto (DM-16 = RN-03.14 = RN-05.17)
// ---------------------------------------------------------------------------

export type CommercialStatusKind = 'OPEN_STAGE' | 'WON' | 'LOST' | 'NO_OPPORTUNITIES';

/** Forma de la API (03 F.1, igual que 05): `{ kind, label, stage }`. */
export interface CommercialStatus {
  readonly kind: CommercialStatusKind;
  /** Etiqueta de la etapa en `OPEN_STAGE`; texto fijo en los demás casos. */
  readonly label: string;
  /** Solo en `OPEN_STAGE`. */
  readonly stage: CatalogItemRef | null;
}

/** Etiquetas de los estados que no son una etapa (DM-16, 05 RN-05.17). */
export const COMMERCIAL_STATUS_LABELS: Readonly<Record<Exclude<CommercialStatusKind, 'OPEN_STAGE'>, string>> = {
  WON: 'Ganado',
  LOST: 'Perdido',
  NO_OPPORTUNITIES: 'Sin oportunidades',
};

export interface CommercialStatusOpportunity {
  readonly stage: SemanticCatalogItem;
  /** Resultado vigente (`opportunity_results.outcome`), o `null`. */
  readonly outcome: OpportunityOutcomeCode | null;
  /** Las eliminadas no cuentan; si el llamador ya las excluyó puede omitirse. */
  readonly deletedAt?: Date | null;
}

/**
 * DEF-B, en este orden:
 * 1. Con oportunidades **abiertas** → la etapa abierta de mayor `metadata.order`
 *    (empate: el `code` menor, para que el resultado sea determinista).
 * 2. Sin abiertas y alguna con resultado `WON`/`PARTIAL` → "Ganado".
 * 3. Sin abiertas y ninguna ganada → "Perdido" (todas las cerradas son `LOST`;
 *    una cerrada sin resultado no debería existir, RN-03.46, y cuenta como no ganada).
 * 4. Sin oportunidades vigentes → "Sin oportunidades".
 *
 * Los adaptadores lo calculan con una subconsulta agregada por proyecto (nunca un
 * `JOIN` que multiplique filas) y lo materializan con esta función o con su
 * equivalente SQL probado contra ella.
 */
export function commercialStatus(opportunities: readonly CommercialStatusOpportunity[]): CommercialStatus {
  const current = opportunities.filter((opportunity) => !opportunity.deletedAt);
  if (current.length === 0) {
    return { kind: 'NO_OPPORTUNITIES', label: COMMERCIAL_STATUS_LABELS.NO_OPPORTUNITIES, stage: null };
  }

  const openStages = current.map((opportunity) => opportunity.stage).filter(isOpenStage);
  if (openStages.length > 0) {
    const [leading] = [...openStages].sort(
      (a, b) => catalogOrder(b) - catalogOrder(a) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    );
    const stage = leading as SemanticCatalogItem;
    return { kind: 'OPEN_STAGE', label: stage.label, stage: toRef(stage) };
  }

  return current.some((opportunity) => isWonOutcome(opportunity.outcome))
    ? { kind: 'WON', label: COMMERCIAL_STATUS_LABELS.WON, stage: null }
    : { kind: 'LOST', label: COMMERCIAL_STATUS_LABELS.LOST, stage: null };
}

// ---------------------------------------------------------------------------
// DEF-C — Última actualización del proyecto (DM-16 = RN-05.18)
// ---------------------------------------------------------------------------

/** DEF-C: columna que es la "última actualización" (orden de la vista de equipo, alerta AL-3). */
export const PROJECT_LAST_UPDATE_FIELD = 'lastActivityAt' as const;

/** DEF-C: `projects.last_activity_at` (00 §2.6). Nunca `updatedAt` ni un cálculo sobre hijos. */
export function projectLastUpdate(project: { readonly lastActivityAt: Date }): Date {
  return project.lastActivityAt;
}

// ---------------------------------------------------------------------------
// DEF-G — Ventana de forecast y "mes actual"
// ---------------------------------------------------------------------------

/** Período absoluto del forecast (`forecast_lines.year`, `month` 1–12). */
export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** Reloj de negocio: subconjunto de `MetricContext` de 01 F.2 (el Módulo 1 añade `scope`). */
export interface MetricClock {
  /** Inyectable en pruebas. */
  readonly now: Date;
  /** `crm.zona_horaria_negocio`. */
  readonly businessTimeZone: string;
}

/** DEF-G: mes en curso (M) en la zona del negocio, no en UTC. */
export function businessMonth(clock: MetricClock): YearMonth {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: clock.businessTimeZone, year: 'numeric', month: '2-digit' }).formatToParts(
    clock.now,
  );
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Cannot compute the business month in time zone ${clock.businessTimeZone}`);
  }
  return { year, month };
}

/** `period` + `months` (puede ser negativo), con cambio de año correcto. */
export function addMonths(period: YearMonth, months: number): YearMonth {
  const index = period.year * 12 + (period.month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Negativo si `a` es anterior a `b`, 0 si es el mismo mes. */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/**
 * DEF-G: ventana M+1 … M+H (`H = crm.forecast.horizonte_meses`), con M = mes en
 * curso en `crm.zona_horaria_negocio`. Es la misma que usan el forecast (RN-03.66,
 * solo esos períodos son editables) e Inicio (KPI-05).
 */
export function forecastWindowMonths(clock: MetricClock, horizonMonths: number): YearMonth[] {
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1) {
    throw new RangeError('The forecast horizon must be a positive integer');
  }
  const current = businessMonth(clock);
  return Array.from({ length: horizonMonths }, (_, index) => addMonths(current, index + 1));
}

/** ¿`period` está dentro de la ventana M+1 … M+H? (RN-03.66). */
export function isInForecastWindow(period: YearMonth, clock: MetricClock, horizonMonths: number): boolean {
  const offset = compareYearMonth(period, businessMonth(clock));
  return offset >= 1 && offset <= horizonMonths;
}

// ===========================================================================
// Reportes (05 G.3) — categorías disjuntas y conjuntos de ids para SQL
// ===========================================================================

// ---------------------------------------------------------------------------
// Oportunidades: abierta / ganada / parcial / perdida / cerrada sin resultado
// (RN-05.20–RN-05.27, DM-15, KPI-02…04)
// ---------------------------------------------------------------------------

/**
 * Categoría **disjunta** de una oportunidad vigente:
 *
 * - `OPEN`: etapa abierta (DEF-A), tenga o no fila de resultado.
 * - `WON_FULL`: cerrada con `outcome = WON` (implícito 100 %, DM-15).
 * - `PARTIAL`: cerrada con `outcome = PARTIAL` (una adjudicación: cuenta como ganada).
 * - `LOST`: cerrada con `outcome = LOST`.
 * - `CLOSED_NO_RESULT`: cerrada sin fila en `opportunity_results` (dato heredado, RN-05.26).
 *
 * Ganadas = `WON_FULL` + `PARTIAL`. Invariante RN-05.27:
 * `abiertas + ganadas + perdidas + cerradas sin resultado = total`.
 */
export type OpportunityCategory = 'OPEN' | 'WON_FULL' | 'PARTIAL' | 'LOST' | 'CLOSED_NO_RESULT';

export function opportunityCategory(stage: SemanticCatalogItem, outcome: OpportunityOutcomeCode | null): OpportunityCategory {
  if (isOpenStage(stage)) return 'OPEN';
  switch (outcome) {
    case 'WON':
      return 'WON_FULL';
    case 'PARTIAL':
      return 'PARTIAL';
    case 'LOST':
      return 'LOST';
    default:
      return 'CLOSED_NO_RESULT';
  }
}

/** Filtro `status` del reporte de oportunidades (RN-05.32). No son disjuntos: se combinan con `OR`. */
export const OPPORTUNITY_STATUS_FILTERS = ['OPEN', 'CLOSED', 'WON', 'PARTIAL', 'LOST', 'CLOSED_NO_RESULT'] as const;
export type OpportunityStatusFilter = (typeof OPPORTUNITY_STATUS_FILTERS)[number];

/** Categorías que casan con cada valor del filtro `status` (RN-05.32). */
export const OPPORTUNITY_STATUS_CATEGORIES: Readonly<Record<OpportunityStatusFilter, readonly OpportunityCategory[]>> = {
  OPEN: ['OPEN'],
  CLOSED: ['WON_FULL', 'PARTIAL', 'LOST', 'CLOSED_NO_RESULT'],
  WON: ['WON_FULL', 'PARTIAL'],
  PARTIAL: ['PARTIAL'],
  LOST: ['LOST'],
  CLOSED_NO_RESULT: ['CLOSED_NO_RESULT'],
};

export function matchesOpportunityStatus(category: OpportunityCategory, status: OpportunityStatusFilter): boolean {
  return OPPORTUNITY_STATUS_CATEGORIES[status].includes(category);
}

/** Conteos de oportunidades (05 F.3 `OpportunityReportSummaryDto`, KPI-02…04). */
export interface OpportunityCounts {
  readonly total: number;
  readonly open: number;
  /** Ganadas = `wonFull + partial` (DM-15). */
  readonly won: number;
  readonly wonFull: number;
  readonly partial: number;
  readonly lost: number;
  readonly closedWithoutResult: number;
}

/** Conteos a partir de las categorías: referencia de los agregados SQL (PF-05.2). */
export function tallyOpportunities(categories: readonly OpportunityCategory[]): OpportunityCounts {
  const count = (category: OpportunityCategory): number => categories.filter((value) => value === category).length;
  const wonFull = count('WON_FULL');
  const partial = count('PARTIAL');
  return {
    total: categories.length,
    open: count('OPEN'),
    won: wonFull + partial,
    wonFull,
    partial,
    lost: count('LOST'),
    closedWithoutResult: count('CLOSED_NO_RESULT'),
  };
}

/** RN-05.27: `open + won + lost + closedWithoutResult = total`, `won = wonFull + partial` y `partial ≤ won`. */
export function opportunityCountsAreConsistent(counts: OpportunityCounts): boolean {
  return (
    counts.open + counts.won + counts.lost + counts.closedWithoutResult === counts.total &&
    counts.wonFull + counts.partial === counts.won &&
    counts.partial <= counts.won
  );
}

// ---------------------------------------------------------------------------
// Visitas: programada / realizada / confirmada / cancelada (RN-05.38, DEF-E, KPI-06/07)
// ---------------------------------------------------------------------------

export const VISIT_CATEGORIES = ['SCHEDULED', 'COMPLETED', 'CONFIRMED', 'CANCELLED'] as const;
/**
 * Categoría disjunta por el estado **vigente** (`visits.status_id`): `SCHEDULED` =
 * `isPending` (incluye REPROGRAMADA), `COMPLETED` = `isDone` (realizada sin confirmar,
 * DEF-E), `CONFIRMED` = `isConfirmed`, `CANCELLED` = `isCancelled`. Misma precedencia
 * que `visitStatusGroup` del Módulo 4 (sin indicador válido = `CANCELLED`).
 */
export type VisitCategory = (typeof VISIT_CATEGORIES)[number];

const VISIT_CATEGORY_BY_GROUP = { PENDING: 'SCHEDULED', DONE: 'COMPLETED', CONFIRMED: 'CONFIRMED', CANCELLED: 'CANCELLED' } as const;

export function visitCategory(status: SemanticCatalogItem): VisitCategory {
  return VISIT_CATEGORY_BY_GROUP[visitStatusGroup(visitStatusSemantics(status.metadata))];
}

/** Ids de estados de visita por categoría, para `status_id = ANY(…)` (el SQL nunca lee la `metadata`). */
export function visitStatusIdsByCategory(statuses: readonly SemanticCatalogItem[]): Readonly<Record<VisitCategory, readonly string[]>> {
  const result: Record<VisitCategory, string[]> = { SCHEDULED: [], COMPLETED: [], CONFIRMED: [], CANCELLED: [] };
  for (const status of statuses) result[visitCategory(status)].push(status.id);
  return result;
}

const DAY_MS = 86_400_000;

/** KPI-07 / RN-05.40: límite superior (incluido) de "visita próxima": `ahora + días`. */
export function upcomingVisitsLimit(now: Date, upcomingDays: number): Date {
  return new Date(now.getTime() + upcomingDays * DAY_MS);
}

// ---------------------------------------------------------------------------
// Actividades: pendiente / vencida / realizada / cancelada (RN-05.41, D-05.5, DEF-D, KPI-08/09)
// ---------------------------------------------------------------------------

export const ACTIVITY_CATEGORIES = ['PENDING', 'OVERDUE', 'COMPLETED', 'CANCELLED'] as const;
/**
 * Categoría disjunta: `PENDING` = abierta y (`due_at IS NULL` o `due_at ≥ ahora`);
 * `OVERDUE` = abierta y `due_at < ahora` (derivada, nunca un estado, 00 C8);
 * `COMPLETED` = `isCompleted`; `CANCELLED` = `isCancelled`. Mismo criterio que la
 * bandeja de pendientes del Módulo 4 (`activity-due-status.ts`).
 */
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Grupo de estado de `crm.estado_actividad` (`OPEN`/`COMPLETED`/`CANCELLED`), regla del Módulo 4. */
export function activityStateGroup(status: SemanticCatalogItem): 'OPEN' | 'COMPLETED' | 'CANCELLED' {
  return activityStatusGroup(activityStatusSemantics(status.metadata));
}

export function activityCategory(status: SemanticCatalogItem, dueAt: Date | null, now: Date): ActivityCategory {
  const group = activityStateGroup(status);
  if (group !== 'OPEN') return group;
  return dueAt !== null && dueAt.getTime() < now.getTime() ? 'OVERDUE' : 'PENDING';
}

/**
 * DEF-D "por vencer": pendiente con `due_at ∈ [ahora, ahora + horas]` (límite incluido,
 * igual que `activityDueBucket` del Módulo 4 y KPI-08 de 01).
 */
export function isActivityDueSoon(status: SemanticCatalogItem, dueAt: Date | null, now: Date, dueSoonHours: number): boolean {
  if (dueAt === null || activityCategory(status, dueAt, now) !== 'PENDING') return false;
  return dueAt.getTime() <= dueSoonLimit(now, dueSoonHours).getTime();
}

export { dueSoonLimit };

/** Ids de estados de actividad por grupo, para `status_id = ANY(…)`. */
export function activityStatusIdsByGroup(
  statuses: readonly SemanticCatalogItem[],
): Readonly<{ open: readonly string[]; completed: readonly string[]; cancelled: readonly string[] }> {
  const open: string[] = [];
  const completed: string[] = [];
  const cancelled: string[] = [];
  for (const status of statuses) {
    const group = activityStateGroup(status);
    (group === 'OPEN' ? open : group === 'COMPLETED' ? completed : cancelled).push(status.id);
  }
  return { open, completed, cancelled };
}

// ---------------------------------------------------------------------------
// Semántica de visitas y actividades (00 §3.3, RN-01.12) — Módulo 1
// ---------------------------------------------------------------------------

function flag(item: SemanticCatalogItem, key: string): boolean {
  return item.metadata?.[key] === true;
}

function idsWith(items: readonly SemanticCatalogItem[], key: string): string[] {
  return items.filter((item) => flag(item, key)).map((item) => item.id);
}

/** Estados de visita (`crm.estado_visita`) pendientes: `isPending = true` (KPI-06/07). */
export function pendingVisitStatusIds(statuses: readonly SemanticCatalogItem[]): string[] {
  return idsWith(statuses, 'isPending');
}

/** Estados de visita realizada (`isDone`). */
export function doneVisitStatusIds(statuses: readonly SemanticCatalogItem[]): string[] {
  return idsWith(statuses, 'isDone');
}

/** Estados de visita confirmada (`isConfirmed`). */
export function confirmedVisitStatusIds(statuses: readonly SemanticCatalogItem[]): string[] {
  return idsWith(statuses, 'isConfirmed');
}

/** Estados de actividad abierta (`crm.estado_actividad`, `isOpen = true`). */
export function openActivityStatusIds(statuses: readonly SemanticCatalogItem[]): string[] {
  return idsWith(statuses, 'isOpen');
}

/** Estados de actividad completada (`isCompleted = true`). */
export function completedActivityStatusIds(statuses: readonly SemanticCatalogItem[]): string[] {
  return idsWith(statuses, 'isCompleted');
}

/** Tipos de actividad que son interacción (`crm.tipo_actividad`, `isInteraction = true`, DM-22). */
export function interactionActivityTypeIds(types: readonly SemanticCatalogItem[]): string[] {
  return idsWith(types, 'isInteraction');
}

// ---------------------------------------------------------------------------
// DEF-D — Actividad vencida / por vencer (00 C8: nunca un estado del catálogo)
// ---------------------------------------------------------------------------

export interface ActivityDueState {
  /** Estado con `isOpen = true`. */
  readonly isOpen: boolean;
  readonly dueAt: Date | null;
}

/** DEF-D: abierta y `due_at < ahora`. */
export function isOverdueActivity(activity: ActivityDueState, now: Date): boolean {
  return activity.isOpen && activity.dueAt !== null && activity.dueAt.getTime() < now.getTime();
}

/** DEF-D: abierta y `due_at ∈ [ahora, ahora + horas]`. */
export function isDueSoonActivity(activity: ActivityDueState, now: Date, dueSoonHours: number): boolean {
  if (!activity.isOpen || activity.dueAt === null) return false;
  const due = activity.dueAt.getTime();
  return due >= now.getTime() && due <= now.getTime() + dueSoonHours * 3_600_000;
}

/** KPI-08 (RN-01.17, D-01.6): pendiente = abierta y no vencida (disjunta de KPI-09). */
export function isPendingActivity(activity: ActivityDueState, now: Date): boolean {
  return activity.isOpen && !isOverdueActivity(activity, now);
}

// ---------------------------------------------------------------------------
// DEF-E — Visita realizada sin confirmar
// ---------------------------------------------------------------------------

/** DEF-E: estado con `isDone = true` y `confirmed_at IS NULL`. */
export function isDoneUnconfirmedVisit(visit: { readonly isDone: boolean; readonly confirmedAt: Date | null }): boolean {
  return visit.isDone && visit.confirmedAt === null;
}

// ---------------------------------------------------------------------------
// DEF-F — Interacción (DM-22)
// ---------------------------------------------------------------------------

export type InteractionCandidate =
  | { readonly sourceType: 'VISIT'; readonly statusIsDone: boolean; readonly statusIsConfirmed: boolean }
  | { readonly sourceType: 'ACTIVITY'; readonly statusIsCompleted: boolean; readonly typeIsInteraction: boolean };

/**
 * DEF-F: fila de `crm_interactions_v` cuyo origen es una visita realizada o
 * confirmada, o una actividad completada de un tipo con `isInteraction = true`.
 */
export function isInteraction(row: InteractionCandidate): boolean {
  return row.sourceType === 'VISIT' ? row.statusIsDone || row.statusIsConfirmed : row.statusIsCompleted && row.typeIsInteraction;
}
