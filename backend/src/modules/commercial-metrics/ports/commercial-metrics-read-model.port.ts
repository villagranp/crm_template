import type { VisibilityScope } from '@/modules/access/visibility-scope';

import type { DateRange } from '../commercial-period';
import type { SemanticCatalogItem, YearMonth } from '../metric-definitions';

/**
 * Puerto de lectura de los indicadores comerciales (01 F.2, L.1; 05 L amplía con
 * sus agregaciones). Tipos de dominio, sin Prisma (ADR-004). El adaptador aplica
 * la visibilidad de 00 §4.2 (con las herencias de DM-13) y la vigencia de
 * RN-01.13 (registro, proyecto y cliente no eliminados) en **todas** las
 * consultas; el servicio decide las fórmulas (qué estados, qué fechas).
 */
export const COMMERCIAL_METRICS_READ_MODEL = Symbol('COMMERCIAL_METRICS_READ_MODEL');

export interface StageCountRow {
  readonly stageId: string;
  readonly count: number;
}

export interface OutcomeCountRow {
  readonly outcome: 'WON' | 'LOST' | 'PARTIAL';
  readonly count: number;
}

export interface UnitRef {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
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

export interface CommercialMetricsReadModel {
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
  countVisits(scope: VisibilityScope, pendingStatusIds: readonly string[], now: Date, upcomingUntil: Date): Promise<VisitCountRows>;
  /** KPI-08/09: actividades vigentes visibles abiertas. */
  countActivities(scope: VisibilityScope, openStatusIds: readonly string[], now: Date, dueSoonUntil: Date): Promise<ActivityCountRows>;

  /** KPI-10: metas no eliminadas de los sujetos, de los meses o años indicados. */
  listTargets(subjects: TargetSubjectFilter, years: readonly number[]): Promise<SalesTargetRecord[]>;
  /** Equipos donde el usuario es responsable o miembro principal (D-01.8, TEAM). */
  teamsLedOrPrimary(userId: string): Promise<string[]>;
  /** Miembros (y responsable) de un equipo y sus subequipos activos. */
  teamOwnerIds(teamId: string): Promise<string[]>;
  /** "Logrado" de una métrica en un período (decimal en texto, 4 decimales). */
  achieved(query: AchievementQuery): Promise<string>;
}
