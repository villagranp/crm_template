import type { Writable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';

import { calendarDateIn } from '@/common/calendar-date';
import { XLSX_FORMATS, type XlsxCell, xlsxCell, XlsxStreamWriter } from '@/common/xlsx';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CommercialMetricsService, type ForecastGroup } from '@/modules/commercial-metrics/commercial-metrics.service';
import { formatYearMonth } from '@/modules/commercial-metrics/commercial-period';
import type { ForecastGroupBy } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import { CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { activityView, ACTIVITY_REPORT_DEFAULT_SORT, ActivityReportService } from './activity-report.service';
import { FilterOptionsService, type ReportFilterOptions } from './filter-options.service';
import { FORECAST_REPORT_DEFAULT_SORT, ForecastReportService } from './forecast-report.service';
import { OPPORTUNITY_REPORT_DEFAULT_SORT, OpportunityReportService, opportunityView } from './opportunity-report.service';
import {
  type ActivityReportRecord,
  type ActivityReportSortField,
  type ForecastReportRecord,
  type ForecastReportSortField,
  type OpportunityReportRecord,
  type OpportunityReportSortField,
  type ProjectReportRecord,
  type ProjectReportSortField,
  REPORTING_REPOSITORY,
  type ReportExportSink,
  type ReportingRepository,
  type SortOrder,
  type VisitReportRecord,
  type VisitReportSortField,
} from './ports/reporting.repository.port';
import { PROJECT_REPORT_DEFAULT_SORT, projectView } from './project-report.service';
import {
  ACTIVITY_EXPORT_COLUMNS,
  cellsOf,
  FORECAST_EXPORT_COLUMNS,
  headersOf,
  opportunityExportColumns,
  PROJECT_EXPORT_COLUMNS,
  type ReportColumn,
  VISIT_EXPORT_COLUMNS,
} from './report-columns';
import { REPORT_PARAMETERS, type ReportContext } from './report-context';
import {
  activityCriteria,
  type ActivityReportFilter,
  forecastCriteria,
  type ForecastReportFilter,
  opportunityCriteria,
  type OpportunityReportFilter,
  projectCriteria,
  type ProjectReportFilter,
  visitCriteria,
  type VisitReportFilter,
} from './report-criteria';
import { exportTooLargeError, reportValidationError } from './report-errors';
import { reportSort } from './report-paging';
import { VISIT_REPORT_DEFAULT_SORT, VisitReportService, visitView } from './visit-report.service';

/** Destino HTTP de la descarga: fija las cabeceras seguras y devuelve el flujo de salida. */
export interface ReportDownload {
  open(file: { readonly fileName: string; readonly rows: number }): Writable;
}

export const REPORT_EXPORT_KINDS = ['projects', 'opportunities', 'forecast', 'visits', 'activities'] as const;
export type ReportExportKind = (typeof REPORT_EXPORT_KINDS)[number];

/** Nombre del archivo (F.4): `reporte-<slug>-YYYYMMDD-HHmm.xlsx`. */
const FILE_SLUGS: Record<ReportExportKind, string> = {
  projects: 'proyectos',
  opportunities: 'oportunidades',
  forecast: 'forecast',
  visits: 'visitas',
  activities: 'actividades',
};

const REPORT_TITLES: Record<ReportExportKind, string> = {
  projects: 'Reporte de proyectos',
  opportunities: 'Reporte de oportunidades',
  forecast: 'Reporte de forecast',
  visits: 'Reporte de visitas',
  activities: 'Reporte de actividades',
};

const SCOPE_LABELS = { OWN: 'Propios', TEAM: 'Equipo', COUNTRY: 'País', ORGANIZATION: 'Organización' } as const;

/** Etiquetas legibles de los parámetros de filtro (hoja "Filtros", RN-05.48). */
const FILTER_LABELS: Readonly<Record<string, string>> = {
  search: 'Búsqueda',
  from: 'Desde',
  to: 'Hasta',
  dateBasis: 'Base de fecha',
  countryId: 'País',
  city: 'Ubicación (ciudad)',
  ownerId: 'Asesor',
  customerId: 'Cliente',
  projectTypeId: 'Tipo de proyecto',
  phaseId: 'Fase',
  commercialStatus: 'Estado comercial',
  situation: 'Situación',
  status: 'Estado',
  stageId: 'Etapa',
  productId: 'Producto',
  productFamilyId: 'Familia',
  fromMonth: 'Mes inicial',
  toMonth: 'Mes final',
  projectId: 'Proyecto',
  statusCategory: 'Categoría de estado',
  statusId: 'Estado (catálogo)',
  typeId: 'Tipo de actividad',
  priorityId: 'Prioridad',
  groupBy: 'Agrupar por',
  thenBy: 'Segundo nivel',
  sortBy: 'Ordenar por',
  sortOrder: 'Sentido del orden',
};

/**
 * Valores enumerados de los filtros en texto legible (RN-05.48), por parámetro: el mismo
 * código significa cosas distintas según el filtro (`COMPLETED` como base de fecha o como
 * categoría). Un valor sin etiqueta se muestra tal cual.
 */
const FILTER_VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  dateBasis: {
    DECISION_ESTIMATED: 'Fecha estimada de decisión',
    UPDATED: 'Fecha de actualización',
    CREATED: 'Fecha de creación',
    IDENTIFIED: 'Fecha de identificación',
    DECIDED: 'Fecha de decisión',
    SCHEDULED: 'Fecha planificada',
    ACTUAL: 'Fecha real',
    CONFIRMED: 'Fecha de confirmación',
    ACTIVITY_DATE: 'Fecha de la actividad',
    DUE: 'Fecha de vencimiento',
    COMPLETED: 'Fecha de realización',
  },
  situation: { ACTIVE: 'Activos', FINISHED: 'Finalizados', ALL: 'Todos' },
  status: {
    OPEN: 'Abiertas',
    CLOSED: 'Cerradas',
    WON: 'Ganadas',
    PARTIAL: 'Parciales',
    LOST: 'Perdidas',
    CLOSED_NO_RESULT: 'Cerradas sin resultado',
  },
  commercialStatus: { OPEN_STAGE: 'Con oportunidades abiertas', WON: 'Ganado', LOST: 'Perdido', NO_OPPORTUNITIES: 'Sin oportunidades' },
  groupBy: { MONTH: 'Mes', PRODUCT: 'Producto', FAMILY: 'Familia', PROJECT: 'Proyecto', CUSTOMER: 'Cliente', OWNER: 'Asesor' },
  thenBy: { MONTH: 'Mes', PRODUCT: 'Producto', FAMILY: 'Familia', PROJECT: 'Proyecto', CUSTOMER: 'Cliente', OWNER: 'Asesor' },
  sortOrder: { asc: 'Ascendente', desc: 'Descendente' },
  sortBy: {
    code: 'Código',
    name: 'Nombre',
    customerName: 'Cliente',
    countryName: 'País',
    ownerName: 'Asesor',
    phaseOrder: 'Fase',
    phaseProgress: '% avance',
    estimatedDecisionDate: 'Fecha estimada de decisión',
    lastActivityAt: 'Última actualización',
    projectName: 'Proyecto',
    stageOrder: 'Etapa',
    estimatedAmountUsd: 'Monto estimado (USD)',
    decisionDate: 'Fecha de decisión',
    updatedAt: 'Fecha de actualización',
    period: 'Año y mes',
    productSku: 'SKU',
    familyName: 'Familia',
    tonnage: 'Tonelaje',
    scheduledStartAt: 'Fecha planificada',
    actualStartAt: 'Fecha real',
    confirmedAt: 'Fecha de confirmación',
    statusOrder: 'Estado',
    activityDate: 'Fecha',
    dueAt: 'Vencimiento',
    priorityWeight: 'Prioridad',
    typeName: 'Tipo',
  },
};

/** Categorías de estado de visitas y actividades (`COMPLETED` y `CANCELLED` se rotulan igual en ambas). */
const STATUS_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  SCHEDULED: 'Programadas',
  COMPLETED: 'Realizadas',
  CONFIRMED: 'Confirmadas',
  CANCELLED: 'Canceladas',
  PENDING: 'Pendientes',
  OVERDUE: 'Vencidas',
};

/** Hojas del libro (RN-05.48). */
export const EXPORT_SHEETS = { data: 'Datos', consolidated: 'Consolidado', summary: 'Resumen', filters: 'Filtros' } as const;

const SUMMARY_HEADERS = ['Indicador', 'Valor', 'Unidad'];
const FILTER_HEADERS = ['Concepto', 'Valor'];
/** Límite de caracteres de la descripción de filtros en la auditoría. */
const AUDIT_FILTERS_MAX_LENGTH = 4_000;

type SortQuery<TSort extends string> = { readonly sortBy?: TSort; readonly sortOrder?: SortOrder };
export type ProjectReportExportQuery = ProjectReportFilter & SortQuery<ProjectReportSortField>;
export type OpportunityReportExportQuery = OpportunityReportFilter & SortQuery<OpportunityReportSortField>;
export type ForecastReportExportQuery = ForecastReportFilter &
  SortQuery<ForecastReportSortField> & { readonly groupBy?: ForecastGroupBy; readonly thenBy?: ForecastGroupBy };
export type VisitReportExportQuery = VisitReportFilter & SortQuery<VisitReportSortField>;
export type ActivityReportExportQuery = ActivityReportFilter & SortQuery<ActivityReportSortField>;

/** Fila de la hoja "Resumen": indicador, valor tipado y unidad. */
export interface SummaryRow {
  readonly label: string;
  readonly value: XlsxCell;
  readonly unit?: string;
}

interface ExportPlan<TRecord> {
  readonly kind: ReportExportKind;
  /** Filtros tal como llegaron (más el orden y el rango efectivos), para "Filtros" y la auditoría. */
  readonly filters: Readonly<Record<string, unknown>>;
  readonly headers: readonly string[];
  readonly cells: (record: TRecord) => XlsxCell[];
  readonly summary: readonly SummaryRow[];
  readonly extraSheets?: (writer: XlsxStreamWriter) => void;
  readonly dump: (sink: ReportExportSink<TRecord>) => Promise<number>;
}

/** Valores de un filtro como lista. */
function valuesOf(value: unknown): unknown[] {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function count(label: string, value: number): SummaryRow {
  return { label, value: xlsxCell.integer(value) };
}

/**
 * Exportación XLSX de los cinco reportes (05 F-39, F.4, RN-05.43–RN-05.50). Reutiliza
 * **exactamente** la consulta de la pantalla (mismos criterios, alcance de `reportes.ver`
 * y orden; RN-05.44): cuenta, aplica el tope (`422 EXPORT_TOO_LARGE`, sin archivo
 * parcial), y vuelca por lotes al escritor en *streaming* (`common/xlsx.ts`, ADR-022).
 * Cada exportación correcta queda en `audit_logs` como `crm.report.exported` (sin los
 * datos exportados) y en el log estructurado (sin PII).
 */
@Injectable()
export class ReportExportService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
    private readonly currencies: CurrencyConversionService,
    private readonly filterOptions: FilterOptionsService,
    private readonly opportunities: OpportunityReportService,
    private readonly forecast: ForecastReportService,
    private readonly visits: VisitReportService,
    private readonly activities: ActivityReportService,
  ) {}

  async exportProjects(ctx: ReportContext, query: ProjectReportExportQuery, download: ReportDownload): Promise<void> {
    const semantics = await this.metrics.semantics();
    const criteria = projectCriteria(query, ctx, semantics);
    const sort = reportSort(query, PROJECT_REPORT_DEFAULT_SORT);
    const counts = await this.metrics.countProjects(criteria);
    const phases = new Map(semantics.phases.map((phase) => [phase.id, phase]));
    await this.run<ProjectReportRecord>(ctx, download, {
      kind: 'projects',
      filters: { ...query, ...sort },
      headers: headersOf(PROJECT_EXPORT_COLUMNS),
      cells: (record) => cellsOf(PROJECT_EXPORT_COLUMNS, projectView(record, phases)),
      summary: [count('Proyectos', counts.total), count('Activos', counts.active), count('Finalizados', counts.finished)],
      dump: (sink) => this.reporting.exportProjectRows(criteria, sort, sink),
    });
  }

  async exportOpportunities(ctx: ReportContext, query: OpportunityReportExportQuery, download: ReportDownload): Promise<void> {
    const semantics = await this.metrics.semantics();
    const criteria = opportunityCriteria(query, ctx, semantics);
    const sort = reportSort(query, OPPORTUNITY_REPORT_DEFAULT_SORT);
    const [summary, baseCurrency] = await Promise.all([this.opportunities.summary(ctx, query), this.currencies.baseCurrencyCode()]);
    const stages = new Map(semantics.stages.map((stage) => [stage.id, stage]));
    const columns: readonly ReportColumn<ReturnType<typeof opportunityView>>[] = opportunityExportColumns(baseCurrency);
    const rows: SummaryRow[] = [
      count('Total', summary.total),
      count('Abiertas', summary.open),
      count('Ganadas', summary.won),
      count('de las cuales parciales', summary.partial),
      count('Ganadas totales', summary.wonFull),
      count('Perdidas', summary.lost),
      count('Resultados parciales', summary.partial),
      count('Cerradas sin resultado', summary.closedWithoutResult),
      { label: `Estimación total (${summary.estimateTotals.currencyCode})`, value: xlsxCell.number(summary.estimateTotals.amountUsd, XLSX_FORMATS.amount), unit: summary.estimateTotals.currencyCode },
      { label: 'Toneladas estimadas', value: xlsxCell.number(summary.estimateTotals.tonnage, XLSX_FORMATS.tonnage), unit: 't' },
      ...summary.byStage.map((stage) => count(`Etapa: ${stage.label}`, stage.count)),
      ...summary.byOwner.map((owner) => count(`Asesor: ${owner.owner.displayName}`, owner.total)),
    ];
    const local = summary.estimateTotals.local.reference;
    if (local) {
      // RN-05.59: fila referencial claramente separada; nunca sustituye al total en USD.
      rows.push({ label: '', value: xlsxCell.text(null) });
      rows.push({
        label: `Equivalente referencial en ${local.currencyCode} (tasa del ${local.exchangeRateDate})`,
        value: xlsxCell.number(local.amount, XLSX_FORMATS.amount),
        unit: local.currencyCode,
      });
    }
    await this.run<OpportunityReportRecord>(ctx, download, {
      kind: 'opportunities',
      filters: { ...query, ...sort },
      headers: headersOf(columns),
      cells: (record) => cellsOf(columns, opportunityView(record, stages)),
      summary: rows,
      dump: (sink) => this.reporting.exportOpportunityRows(criteria, { ...sort, stageRanking: semantics.stages.map((stage) => stage.id) }, sink),
    });
  }

  async exportForecast(ctx: ReportContext, query: ForecastReportExportQuery, download: ReportDownload): Promise<void> {
    if (query.thenBy !== undefined && query.groupBy === undefined) throw reportValidationError('thenBy', 'thenBy requires groupBy');
    if (query.thenBy !== undefined && query.thenBy === query.groupBy) throw reportValidationError('thenBy', 'thenBy must be different from groupBy');
    const horizon = await this.parameters.get<number>(REPORT_PARAMETERS.forecastHorizon);
    const criteria = forecastCriteria(query, ctx, horizon);
    const sort = reportSort(query, FORECAST_REPORT_DEFAULT_SORT);
    const maxRows = await this.maxRows();
    const [summary, groups] = await Promise.all([
      this.forecast.summary(ctx, query),
      query.groupBy
        ? this.metrics.forecastConsolidation(criteria, { groupBy: query.groupBy, thenBy: query.thenBy ?? null }, { page: 1, pageSize: maxRows })
        : Promise.resolve(null),
    ]);
    const unit = summary.tonnageUnit === 'TON' ? 't' : summary.tonnageUnit;
    const rows: SummaryRow[] = [];
    for (const month of summary.months) {
      const label = formatYearMonth(month);
      rows.push({ label: `${label} · Toneladas`, value: xlsxCell.number(month.tonnage, XLSX_FORMATS.tonnage), unit });
      rows.push({ label: `${label} · Acumulado`, value: xlsxCell.number(month.cumulativeTonnage, XLSX_FORMATS.tonnage), unit });
      for (const quantity of month.quantities) {
        rows.push({ label: `${label} · Cantidad`, value: xlsxCell.number(quantity.quantity, XLSX_FORMATS.quantity), unit: quantity.unit.code });
      }
      rows.push(count(`${label} · Líneas sin conversión`, month.linesWithoutConversion));
    }
    rows.push({ label: 'Total · Toneladas', value: xlsxCell.number(summary.totals.tonnage, XLSX_FORMATS.tonnage), unit });
    for (const quantity of summary.totals.quantities) {
      rows.push({ label: 'Total · Cantidad', value: xlsxCell.number(quantity.quantity, XLSX_FORMATS.quantity), unit: quantity.unit.code });
    }
    rows.push(count('Total · Líneas sin conversión', summary.totals.linesWithoutConversion));
    rows.push(count('Líneas', summary.lineCount));
    rows.push({ label: 'Última actualización', value: xlsxCell.dateTime(summary.lastUpdatedAt) });

    const range = { fromMonth: formatYearMonth(criteria.fromMonth), toMonth: formatYearMonth(criteria.toMonth) };
    await this.run<ForecastReportRecord>(ctx, download, {
      kind: 'forecast',
      filters: { ...query, ...range, ...sort },
      headers: headersOf(FORECAST_EXPORT_COLUMNS),
      cells: (record) => cellsOf(FORECAST_EXPORT_COLUMNS, record),
      summary: rows,
      extraSheets: groups ? (writer) => this.writeConsolidated(writer, groups.items, summary.months) : undefined,
      dump: (sink) => this.reporting.exportForecastRows(criteria, sort, sink),
    });
  }

  async exportVisits(ctx: ReportContext, query: VisitReportExportQuery, download: ReportDownload): Promise<void> {
    const semantics = await this.metrics.semantics();
    const criteria = visitCriteria(query, ctx, semantics);
    const sort = reportSort(query, VISIT_REPORT_DEFAULT_SORT);
    const summary = await this.visits.summary(ctx, query);
    const statuses = new Map(semantics.visitStatuses.map((status) => [status.id, status]));
    await this.run<VisitReportRecord>(ctx, download, {
      kind: 'visits',
      filters: { ...query, ...sort },
      headers: headersOf(VISIT_EXPORT_COLUMNS),
      cells: (record) => cellsOf(VISIT_EXPORT_COLUMNS, visitView(record, statuses)),
      summary: [
        count('Programadas', summary.scheduled),
        count('Realizadas (sin confirmar)', summary.completed),
        count('Confirmadas', summary.confirmed),
        count('Canceladas', summary.cancelled),
        count('Total', summary.total),
        count('Realizadas en total', summary.completedTotal),
        count('Visitas reprogramadas', summary.rescheduledVisits),
        count('Reprogramaciones', summary.rescheduleEvents),
        count('Pendientes atrasadas', summary.overduePending),
      ],
      dump: (sink) => this.reporting.exportVisitRows(criteria, sort, sink),
    });
  }

  async exportActivities(ctx: ReportContext, query: ActivityReportExportQuery, download: ReportDownload): Promise<void> {
    const semantics = await this.metrics.semantics();
    const criteria = activityCriteria(query, ctx, semantics);
    const sort = reportSort(query, ACTIVITY_REPORT_DEFAULT_SORT);
    const summary = await this.activities.summary(ctx, query);
    const statuses = new Map(semantics.activityStatuses.map((status) => [status.id, status]));
    await this.run<ActivityReportRecord>(ctx, download, {
      kind: 'activities',
      filters: { ...query, ...sort },
      headers: headersOf(ACTIVITY_EXPORT_COLUMNS),
      cells: (record) => cellsOf(ACTIVITY_EXPORT_COLUMNS, activityView(record, statuses, ctx.now)),
      summary: [
        count('Pendientes', summary.pending),
        count('Vencidas', summary.overdue),
        count('Realizadas', summary.completed),
        count('Canceladas', summary.cancelled),
        count('Total', summary.total),
        { label: 'Próximas a vencer', value: xlsxCell.integer(summary.dueSoon), unit: `${summary.dueSoonHours} h` },
      ],
      dump: (sink) => this.reporting.exportActivityRows(criteria, sort, sink),
    });
  }

  private maxRows(): Promise<number> {
    return this.parameters.get<number>(REPORT_PARAMETERS.maxExportRows);
  }

  /**
   * Conteo + tope (antes de escribir nada) → hoja de datos por lotes → hojas adicionales →
   * "Resumen" → "Filtros" → auditoría → cierre del archivo. La auditoría se registra al
   * completar el volcado, antes de cerrar el ZIP: toda extracción completa queda registrada.
   */
  private async run<TRecord>(ctx: ReportContext, download: ReportDownload, plan: ExportPlan<TRecord>): Promise<void> {
    const startedAt = Date.now();
    const [maxRows, options] = await Promise.all([this.maxRows(), this.filterOptions.get(ctx)]);
    let writer: XlsxStreamWriter | null = null;
    let sheet: ReturnType<XlsxStreamWriter['addSheet']> | null = null;
    let expected = 0;

    const rows = await plan.dump({
      begin: (rowCount) => {
        if (rowCount > maxRows) throw exportTooLargeError(rowCount, maxRows);
        expected = rowCount;
        writer = new XlsxStreamWriter(download.open({ fileName: this.fileName(plan.kind, ctx), rows: rowCount }), ctx.businessTimeZone);
        sheet = writer.addSheet(EXPORT_SHEETS.data, plan.headers);
      },
      write: (records) => {
        for (const record of records) sheet?.addRow(plan.cells(record));
      },
    });
    // `begin` siempre se llama antes de volver del volcado.
    const book = writer as XlsxStreamWriter | null;
    if (!book || !sheet) throw new Error('The export did not start');
    if (rows !== expected) throw new Error('The export wrote a different number of rows than it counted');
    (sheet as ReturnType<XlsxStreamWriter['addSheet']>).commit();

    plan.extraSheets?.(book);
    const summary = book.addSheet(EXPORT_SHEETS.summary, SUMMARY_HEADERS, { widths: [48, 18, 10] });
    for (const row of plan.summary) summary.addRow([xlsxCell.text(row.label), row.value, xlsxCell.text(row.unit ?? null)]);
    summary.commit();

    const filters = book.addSheet(EXPORT_SHEETS.filters, FILTER_HEADERS, { widths: [40, 80] });
    filters.addRow([xlsxCell.text('Reporte'), xlsxCell.text(REPORT_TITLES[plan.kind])]);
    filters.addRow([xlsxCell.text('Generado'), xlsxCell.dateTime(ctx.now)]);
    filters.addRow([xlsxCell.text('Zona horaria'), xlsxCell.text(ctx.businessTimeZone)]);
    filters.addRow([xlsxCell.text('Alcance'), xlsxCell.text(SCOPE_LABELS[ctx.dataScope])]);
    filters.addRow([xlsxCell.text('Filas'), xlsxCell.integer(rows)]);
    for (const [name, text] of this.describeFilters(plan.filters, options)) filters.addRow([xlsxCell.text(name), xlsxCell.text(text)]);
    filters.addRow([xlsxCell.text('Números escritos como texto (más de 15 dígitos)'), xlsxCell.integer(book.textFallbacks)]);
    filters.commit();

    const durationMs = Date.now() - startedAt;
    await this.audit.record('crm.report.exported', ctx.audit, {
      resourceType: 'crm.report',
      resourceId: plan.kind,
      metadata: {
        report: plan.kind,
        format: 'xlsx',
        filters: this.auditFilters(plan.filters),
        scope: ctx.dataScope,
        rows,
        durationMs,
      },
    });
    this.logger.info('report_exported', { correlationId: ctx.correlationId, report: plan.kind, format: 'xlsx', scope: ctx.dataScope, rows, durationMs });
    await book.finish();
  }

  /** `reporte-<slug>-YYYYMMDD-HHmm.xlsx` en la hora del negocio. */
  private fileName(kind: ReportExportKind, ctx: ReportContext): string {
    const date = calendarDateIn(ctx.now, ctx.businessTimeZone).replace(/-/g, '');
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.businessTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(ctx.now)
      .replace(':', '');
    return `reporte-${FILE_SLUGS[kind]}-${date}-${time}.xlsx`;
  }

  /**
   * Filtros en texto legible (RN-05.48): etiquetas de asesores, países, catálogos y
   * familias **dentro del alcance** (las mismas opciones de filtro autorizadas). Clientes,
   * proyectos y productos se muestran por su identificador: resolver su nombre revelaría
   * registros fuera del alcance (RN-05.4).
   */
  private describeFilters(filters: Readonly<Record<string, unknown>>, options: ReportFilterOptions): [string, string][] {
    const labels = new Map<string, string>();
    for (const owner of options.owners) labels.set(owner.id, owner.displayName);
    for (const country of options.countries) labels.set(country.id, country.name);
    for (const family of options.productFamilies) labels.set(family.id, family.name);
    for (const items of Object.values(options.catalogs)) for (const item of items) labels.set(item.id, item.label);
    const described: [string, string][] = [];
    for (const [name, value] of Object.entries(filters)) {
      const label = FILTER_LABELS[name];
      const values = valuesOf(value);
      if (!label || values.length === 0) continue;
      described.push([label, values.map((entry) => this.describeValue(name, String(entry), labels)).join(', ')]);
    }
    return described;
  }

  /** Un valor de filtro: enumerado → etiqueta; id autorizado → su nombre; si no, tal cual (ids fuera del alcance nunca se resuelven). */
  private describeValue(name: string, value: string, labels: ReadonlyMap<string, string>): string {
    if (name === 'statusCategory') return STATUS_CATEGORY_LABELS[value] ?? value;
    if (name === 'commercialStatus' && value.startsWith('OPEN_STAGE:')) {
      const stageId = value.slice('OPEN_STAGE:'.length);
      return `Etapa abierta líder: ${labels.get(stageId) ?? stageId}`;
    }
    const enumerated = FILTER_VALUE_LABELS[name]?.[value];
    if (enumerated !== undefined) return enumerated;
    return labels.get(value) ?? value;
  }

  /** RN-05.43: ids, fechas y enumerados; la búsqueda libre ya llega acotada a 100 caracteres por el DTO. */
  private auditFilters(filters: Readonly<Record<string, unknown>>): string {
    const known = Object.fromEntries(Object.entries(filters).filter(([name, value]) => FILTER_LABELS[name] !== undefined && valuesOf(value).length > 0));
    const text = JSON.stringify(known);
    return text.length > AUDIT_FILTERS_MAX_LENGTH ? `${text.slice(0, AUDIT_FILTERS_MAX_LENGTH)}…` : text;
  }

  /** Hoja "Consolidado" (F.1: forecast con `groupBy`): grupo, subgrupo, toneladas por mes, total y cantidades por unidad. */
  private writeConsolidated(writer: XlsxStreamWriter, groups: readonly ForecastGroup[], months: readonly { year: number; month: number }[]): void {
    const units = [...new Map(groups.flatMap((group) => group.total.quantities.map((entry) => [entry.unit.id, entry.unit] as const))).values()].sort((a, b) =>
      a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
    );
    const headers = [
      'Grupo',
      'Subgrupo',
      ...months.map((month) => `${formatYearMonth(month)} (t)`),
      'Total (t)',
      'Líneas sin conversión',
      ...units.flatMap(() => ['Cantidad total', 'Unidad']),
    ];
    const sheet = writer.addSheet(EXPORT_SHEETS.consolidated, headers);
    const line = (group: ForecastGroup, parent: ForecastGroup | null): XlsxCell[] => [
      xlsxCell.text(parent ? parent.key.label : group.key.label),
      xlsxCell.text(parent ? group.key.label : null),
      ...months.map((month) =>
        xlsxCell.number(group.months.find((entry) => entry.year === month.year && entry.month === month.month)?.tonnage ?? '0', XLSX_FORMATS.tonnage),
      ),
      xlsxCell.number(group.total.tonnage, XLSX_FORMATS.tonnage),
      xlsxCell.integer(group.total.linesWithoutConversion),
      ...units.flatMap((unit) => [
        xlsxCell.number(group.total.quantities.find((entry) => entry.unit.id === unit.id)?.quantity ?? '0', XLSX_FORMATS.quantity),
        xlsxCell.text(unit.code),
      ]),
    ];
    for (const group of groups) {
      sheet.addRow(line(group, null));
      for (const subgroup of group.subgroups ?? []) sheet.addRow(line(subgroup, group));
    }
    sheet.commit();
  }
}
