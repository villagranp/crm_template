import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';
import type { Page } from '@/infrastructure/database/ports/pagination';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';
import type {
  ActivityCriteria,
  ForecastCriteria,
  OpportunityCriteria,
  ProjectCriteria,
  UnitRef,
  UserRef,
  VisitCriteria,
} from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import type { CommercialStatusAggregate } from '@/modules/projects/project-commercial-status';

/**
 * Puerto de lectura de Reportes (00 §11 `ReportingRepository`, 05 D.3): **filas**
 * paginadas de los cinco reportes y opciones de filtro. Los conteos y agregados salen de
 * `CommercialMetricsReadModel` con los **mismos** criterios (RN-05.9); el adaptador usa
 * los mismos predicados SQL (`prisma-commercial-metrics.repository.ts`).
 *
 * Orden: el campo pedido (lista blanca por reporte, E.2–E.6) y, como desempate, `id`
 * (RN-05.14). La exportación (F-39) reutilizará estos criterios y este orden.
 */
export const REPORTING_REPOSITORY = Symbol('REPORTING_REPOSITORY');

export type SortOrder = 'asc' | 'desc';

export interface ReportPageRequest<TSort extends string> {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy: TSort;
  readonly sortOrder: SortOrder;
}

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface LabelRef {
  readonly id: string;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// F-34 Proyectos
// ---------------------------------------------------------------------------

export const PROJECT_REPORT_SORT_FIELDS = [
  'code',
  'name',
  'customerName',
  'countryName',
  'ownerName',
  'phaseOrder',
  'phaseProgress',
  'estimatedDecisionDate',
  'lastActivityAt',
] as const;
export type ProjectReportSortField = (typeof PROJECT_REPORT_SORT_FIELDS)[number];

export interface ProjectReportRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customer: NamedRef;
  readonly country: NamedRef;
  readonly city: string | null;
  readonly owner: UserRef;
  readonly projectType: LabelRef | null;
  readonly phase: LabelRef;
  /** 2 decimales (`'45.00'`). */
  readonly phaseProgress: DecimalString;
  /** Agregado por proyecto de DEF-B (subconsulta de Proyectos). */
  readonly commercial: CommercialStatusAggregate;
  readonly estimatedDecisionDate: CalendarDate | null;
  readonly lastActivityAt: Date;
}

// ---------------------------------------------------------------------------
// F-35 Oportunidades
// ---------------------------------------------------------------------------

export const OPPORTUNITY_REPORT_SORT_FIELDS = [
  'code',
  'projectName',
  'customerName',
  'ownerName',
  'stageOrder',
  'estimatedAmountUsd',
  'decisionDate',
  'updatedAt',
] as const;
export type OpportunityReportSortField = (typeof OPPORTUNITY_REPORT_SORT_FIELDS)[number];

export interface OpportunityRowsRequest extends ReportPageRequest<OpportunityReportSortField> {
  /** Etapas por `metadata.order` (y `code`), para `stageOrder`. */
  readonly stageRanking: readonly string[];
}

export interface OpportunityReportRecord {
  readonly id: string;
  readonly code: string;
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly customer: NamedRef;
  readonly owner: UserRef;
  readonly stage: LabelRef;
  readonly result: {
    readonly outcome: OpportunityOutcomeCode;
    readonly reason: LabelRef | null;
    /** 2 decimales; solo en `PARTIAL`. */
    readonly awardedPercent: DecimalString | null;
    readonly decisionDate: CalendarDate;
  } | null;
  /** RN-05.29 (DM-1, DM-36): foto de la estimación tal como se guardó. */
  readonly estimate: {
    readonly amount: DecimalString | null;
    readonly currencyCode: string | null;
    readonly exchangeRate: DecimalString | null;
    readonly exchangeRateDate: CalendarDate | null;
    readonly amountUsd: DecimalString | null;
    readonly tonnage: DecimalString | null;
  };
  /** `projects.estimated_decision_date` (RN-05.28, cuando no hay resultado). */
  readonly projectEstimatedDecisionDate: CalendarDate | null;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// F-36 Forecast (detalle)
// ---------------------------------------------------------------------------

/** `period` = año y mes de la línea (E.4 "`year,month`"). */
export const FORECAST_REPORT_SORT_FIELDS = ['period', 'projectName', 'productSku', 'familyName', 'ownerName', 'tonnage', 'updatedAt'] as const;
export type ForecastReportSortField = (typeof FORECAST_REPORT_SORT_FIELDS)[number];

export interface ForecastReportRecord {
  readonly id: string;
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly customer: NamedRef;
  readonly product: { readonly id: string; readonly sku: string; readonly description: string };
  readonly family: NamedRef;
  readonly year: number;
  readonly month: number;
  readonly quantity: DecimalString;
  readonly unit: UnitRef;
  /** `null` = "sin conversión" (DM-24). */
  readonly tonnage: DecimalString | null;
  readonly owner: UserRef;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// F-37 Visitas
// ---------------------------------------------------------------------------

export const VISIT_REPORT_SORT_FIELDS = ['scheduledStartAt', 'actualStartAt', 'confirmedAt', 'customerName', 'ownerName', 'statusOrder'] as const;
export type VisitReportSortField = (typeof VISIT_REPORT_SORT_FIELDS)[number];

export interface VisitReportRecord {
  readonly id: string;
  readonly code: string;
  readonly customer: NamedRef;
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly owner: UserRef;
  readonly scheduledStartAt: Date;
  readonly originalScheduledAt: Date;
  readonly rescheduleCount: number;
  readonly actualStartAt: Date | null;
  readonly status: LabelRef;
  readonly result: LabelRef | null;
  readonly resultSummary: string | null;
  readonly confirmedAt: Date | null;
}

// ---------------------------------------------------------------------------
// F-38 Actividades
// ---------------------------------------------------------------------------

export const ACTIVITY_REPORT_SORT_FIELDS = ['activityDate', 'dueAt', 'priorityWeight', 'customerName', 'ownerName', 'typeName'] as const;
export type ActivityReportSortField = (typeof ACTIVITY_REPORT_SORT_FIELDS)[number];

export interface ActivityReportRecord {
  readonly id: string;
  readonly code: string;
  readonly type: LabelRef;
  readonly subject: string;
  readonly customer: NamedRef;
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly owner: UserRef;
  /** `COALESCE(scheduled_at, due_at)`. */
  readonly activityDate: Date | null;
  readonly dueAt: Date | null;
  readonly priority: LabelRef & { readonly weight: number };
  readonly status: LabelRef;
  readonly result: LabelRef | null;
  readonly resultNotes: string | null;
}

// ---------------------------------------------------------------------------
// Opciones de filtro
// ---------------------------------------------------------------------------

export interface CountryOptionRecord extends NamedRef {
  /** `countries.currency_code` (moneda local de referencia, RN-05.58). */
  readonly currencyCode: string;
}

// ---------------------------------------------------------------------------
// Exportación (F-39, RN-05.44–RN-05.46)
// ---------------------------------------------------------------------------

/** Orden del volcado: el mismo de la pantalla (RN-05.14, RN-05.44), sin paginación. */
export interface ReportSortRequest<TSort extends string> {
  readonly sortBy: TSort;
  readonly sortOrder: SortOrder;
}

export interface OpportunityExportRequest extends ReportSortRequest<OpportunityReportSortField> {
  readonly stageRanking: readonly string[];
}

/**
 * Destino del volcado. El adaptador cuenta el conjunto y llama a `begin(rowCount)`
 * **antes** de leer filas (ahí se aplica el tope, RN-05.45: si lanza, no se lee ni se
 * escribe nada); después entrega las filas por lotes, en orden. Conteo y lotes van en
 * **una** transacción `REPEATABLE READ READ ONLY` (RN-05.46): el archivo contiene
 * exactamente las filas contadas.
 */
export interface ReportExportSink<TRecord> {
  begin(rowCount: number): Promise<void> | void;
  write(rows: readonly TRecord[]): Promise<void> | void;
}

export interface ReportingRepository {
  projectRows(criteria: ProjectCriteria, page: ReportPageRequest<ProjectReportSortField>): Promise<Page<ProjectReportRecord>>;
  opportunityRows(criteria: OpportunityCriteria, page: OpportunityRowsRequest): Promise<Page<OpportunityReportRecord>>;
  forecastRows(criteria: ForecastCriteria, page: ReportPageRequest<ForecastReportSortField>): Promise<Page<ForecastReportRecord>>;
  visitRows(criteria: VisitCriteria, page: ReportPageRequest<VisitReportSortField>): Promise<Page<VisitReportRecord>>;
  activityRows(criteria: ActivityCriteria, page: ReportPageRequest<ActivityReportSortField>): Promise<Page<ActivityReportRecord>>;
  /**
   * Volcado completo con los **mismos** criterios, columnas y orden que la lista
   * (RN-05.44), por lotes *keyset* (orden + `id`) y con el `statement_timeout` de
   * exportación (D.3). Devuelve las filas entregadas.
   */
  exportProjectRows(criteria: ProjectCriteria, sort: ReportSortRequest<ProjectReportSortField>, sink: ReportExportSink<ProjectReportRecord>): Promise<number>;
  exportOpportunityRows(criteria: OpportunityCriteria, sort: OpportunityExportRequest, sink: ReportExportSink<OpportunityReportRecord>): Promise<number>;
  exportForecastRows(criteria: ForecastCriteria, sort: ReportSortRequest<ForecastReportSortField>, sink: ReportExportSink<ForecastReportRecord>): Promise<number>;
  exportVisitRows(criteria: VisitCriteria, sort: ReportSortRequest<VisitReportSortField>, sink: ReportExportSink<VisitReportRecord>): Promise<number>;
  exportActivityRows(criteria: ActivityCriteria, sort: ReportSortRequest<ActivityReportSortField>, sink: ReportExportSink<ActivityReportRecord>): Promise<number>;
  /**
   * Responsables de algún registro comercial **visible** con `scope` (proyectos,
   * oportunidades, líneas de forecast, visitas y actividades vigentes), por nombre.
   */
  visibleOwners(scope: VisibilityScope): Promise<UserRef[]>;
  /** Países de los registros visibles (proyectos y clientes de visitas/actividades) ∪ países del alcance, por nombre. */
  visibleCountries(scope: VisibilityScope): Promise<CountryOptionRecord[]>;
  /** Familias de producto activas, por `sortOrder` y nombre. */
  productFamilies(): Promise<NamedRef[]>;
  /** Moneda de cada país pedido (los inexistentes no aparecen). */
  countryCurrencies(countryIds: readonly string[]): Promise<CountryOptionRecord[]>;
  /** Zona horaria del perfil del usuario (`users.time_zone`, DM-2), o `null` si no existe. */
  userTimeZone(userId: string): Promise<string | null>;
}
