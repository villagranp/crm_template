import type { PaginatedResponse } from '@/types/api';

/**
 * Tipos del Panel de control: reflejo de los DTO del backend
 * (`backend/src/modules/dashboard/dto/dashboard-*.dto.ts`, 01 §F.1). Decimales
 * como **cadena** (nunca se convierten a `number` para calcular), fechas ISO
 * 8601 UTC y fechas de calendario `YYYY-MM-DD`.
 */

export const DASHBOARD_PERIODS = ['MONTH', 'QUARTER', 'YEAR'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/** `PeriodDto`: fechas de calendario inclusivas; `CUSTOM` si llegó `from`/`to`. */
export interface PeriodRange {
  from: string;
  to: string;
  kind: DashboardPeriod | 'CUSTOM';
}

export interface ProjectIndicators {
  activeProjects: number;
  generatedAt: string;
}

export interface StageCount {
  stageId: string;
  code: string;
  label: string;
  order: number;
  count: number;
}

export interface OpportunityIndicators {
  open: { count: number; byStage: StageCount[] };
  won: { count: number; wonCount: number; partialCount: number };
  lost: { count: number };
  period: PeriodRange;
  generatedAt: string;
}

export interface YearMonth {
  year: number;
  month: number;
}

export interface UnitRef {
  code: string;
  symbol: string;
}

export interface ForecastMonth extends YearMonth {
  tonnage: string;
  lineCount: number;
}

export interface UnitQuantity {
  unitCode: string;
  unitSymbol: string;
  quantity: string;
}

export interface ForecastIndicators {
  window: { from: YearMonth; to: YearMonth };
  tonnageUnit: UnitRef | null;
  /** `null` sin toneladas en la ventana: "Sin proyección" (RN-01.11). */
  totalTonnage: string | null;
  months: ForecastMonth[];
  unconvertedLines: number;
  quantitiesByUnit: UnitQuantity[];
  generatedAt: string;
}

export interface VisitIndicators {
  pending: { count: number; overdueCount: number };
  upcoming: { count: number; days: number };
  generatedAt: string;
}

export interface ActivityIndicators {
  pending: { count: number; dueSoonCount: number; dueSoonHours: number };
  overdue: { count: number };
  generatedAt: string;
}

export type TargetMetric = 'TONNAGE' | 'AMOUNT' | 'WON_OPPORTUNITIES' | 'VISITS' | 'ACTIVITIES';

export interface TargetItem {
  /** `null` si agrupa varias metas. */
  targetId: string | null;
  metric: TargetMetric;
  subject: { type: 'USER' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION'; id: string | null; label: string };
  targetValue: string;
  achievedValue: string;
  /** `null` si el objetivo es 0: "No calculable". */
  compliancePercent: string | null;
  unit: UnitRef | null;
  /** `USD` en `AMOUNT` (DM-36); `null` en el resto. */
  currencyCode: string | null;
}

export interface TargetIndicators {
  /** `false` → "Sin metas configuradas" (RN-01.18). */
  hasTargets: boolean;
  period: PeriodRange;
  items: TargetItem[];
  generatedAt: string;
}

export interface UserRef {
  id: string;
  displayName: string;
}

export interface CustomerRef {
  id: string;
  crmCode: string;
  name: string;
}

export interface ProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface CatalogValue {
  code: string;
  label: string;
}

export interface UpcomingVisit {
  id: string;
  code: string;
  scheduledStartAt: string;
  scheduledEndAt: string | null;
  status: CatalogValue;
  objective: string;
  owner: UserRef;
  customer: CustomerRef;
  project: ProjectRef | null;
  /** `ahora ≥ inicio − recordatorio` (RN-01.25). */
  reminderDue: boolean;
}

export const SOURCE_TYPES = ['ACTIVITY', 'VISIT', 'OPPORTUNITY', 'PROJECT'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface SourceRef {
  type: SourceType;
  id: string;
  code: string;
  /** Proyecto padre (oportunidades). */
  projectId: string | null;
}

export const RECENT_ACTIVITY_EVENT_TYPES = [
  'ACTIVIDAD_REGISTRADA',
  'ACTIVIDAD_COMPLETADA',
  'INTERACCION',
  'OPORTUNIDAD_ETAPA',
  'OPORTUNIDAD_CERRADA',
  'OPORTUNIDAD_RESULTADO',
  'OPORTUNIDAD_CREADA',
  'OPORTUNIDAD_ACTUALIZADA',
  'PROYECTO_CREADO',
  'PROYECTO_FASE',
] as const;
export type RecentActivityEventType = (typeof RECENT_ACTIVITY_EVENT_TYPES)[number];

export interface RecentActivityItem {
  /** `{tipo}:{id del hecho}`, estable. */
  id: string;
  eventType: RecentActivityEventType;
  occurredAt: string;
  /** ≤ 200 caracteres; sin datos de contactos. */
  summary: string;
  responsible: UserRef;
  customer: CustomerRef | null;
  project: ProjectRef | null;
  source: SourceRef;
}

export const ALERT_TYPES = [
  'ACTIVIDAD_VENCIDA',
  'VISITA_SIN_CONFIRMAR',
  'PROYECTO_SIN_ACTUALIZAR',
  'OPORTUNIDAD_SIN_SIGUIENTE_ACCION',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export interface Priority {
  code: string;
  label: string;
  /** `crm.prioridad.metadata.weight`: mayor peso, más urgente (RN-01.27). */
  weight: number;
}

export interface DashboardAlert {
  /** `{tipo}:{id del origen}` (RN-01.28). */
  id: string;
  type: AlertType;
  description: string;
  priority: Priority;
  responsible: UserRef;
  referenceDate: string;
  customer: CustomerRef | null;
  project: ProjectRef | null;
  source: SourceRef;
}

export type AlertDisabledReason = 'DISABLED_BY_PARAMETER' | 'PARAMETER_INVALID';

export interface AlertSummaryItem {
  type: AlertType;
  enabled: boolean;
  disabledReason: AlertDisabledReason | null;
  count: number;
  priority: Priority | null;
}

export interface AlertsSummary {
  /** Sólo los tipos que el usuario puede ver. */
  items: AlertSummaryItem[];
  generatedAt: string;
}

export const ALERT_SORT_FIELDS = ['priority', 'referenceDate'] as const;
export type AlertSortField = (typeof ALERT_SORT_FIELDS)[number];

/** `DashboardAlertsQueryDto`: las listas viajan como CSV, igual que las acepta la API. */
export interface AlertsQuery {
  page: number;
  pageSize: number;
  type?: string;
  priority?: string;
  mine?: boolean;
  sortBy?: AlertSortField;
}

/** `RecentActivityQueryDto` sin `page` (lo pone la paginación "Cargar más"). */
export interface RecentActivityQuery {
  pageSize: number;
  /** CSV de `RecentActivityEventType`; sin él, todos los permitidos. */
  types?: string;
}

export type PaginatedUpcomingVisits = PaginatedResponse<UpcomingVisit>;
export type PaginatedRecentActivity = PaginatedResponse<RecentActivityItem>;
export type PaginatedAlerts = PaginatedResponse<DashboardAlert>;

/** `GET /me/safety-minute` (Ajustes 1, §6.3): mensaje institucional de hoy o `null`. */
export interface SafetyMinuteOfTheDay {
  /** Fecha sin hora, `YYYY-MM-DD`. */
  displayDate: string;
  /** Texto plano con saltos de línea; nunca se interpreta como HTML. */
  message: string;
}

export interface SafetyMinuteResponse {
  safetyMinute: SafetyMinuteOfTheDay | null;
}
