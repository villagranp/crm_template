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
 */

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
