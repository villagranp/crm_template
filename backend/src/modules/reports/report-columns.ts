import { XLSX_FORMATS, type XlsxCell, xlsxCell } from '@/common/xlsx';
import type { CommercialStatus } from '@/modules/commercial-metrics/metric-definitions';

import type { ActivityReportView } from './activity-report.service';
import type { OpportunityReportView } from './opportunity-report.service';
import type { ForecastReportRecord } from './ports/reporting.repository.port';
import type { ProjectReportView } from './project-report.service';
import type { VisitReportView } from './visit-report.service';

/**
 * Columnas de la exportación de cada reporte (05 E.2–E.6, RN-05.47, RN-05.59): las de
 * la pantalla, en su orden, con tipo y formato; cada cantidad lleva su unidad al lado y
 * cada monto su moneda. **No** se exportan columnas que la pantalla no muestra ni texto
 * libre de resultados (`resultSummary`, `resultNotes`, RN-05.50).
 */
export interface ReportColumn<TRow> {
  readonly header: string;
  readonly cell: (row: TRow) => XlsxCell;
}

const OUTCOME_LABELS = { WON: 'Ganado', PARTIAL: 'Parcial', LOST: 'Perdido' } as const;
const DECISION_DATE_KIND_LABELS = { ACTUAL: 'Real', ESTIMATED: 'Estimada' } as const;

function commercialStatusText(status: CommercialStatus): string {
  return status.label;
}

export const PROJECT_EXPORT_COLUMNS: readonly ReportColumn<ProjectReportView>[] = [
  { header: 'Código', cell: (row) => xlsxCell.text(row.code) },
  { header: 'Nombre', cell: (row) => xlsxCell.text(row.name) },
  { header: 'Cliente', cell: (row) => xlsxCell.text(row.customer.name) },
  { header: 'País', cell: (row) => xlsxCell.text(row.country.name) },
  { header: 'Ubicación (ciudad)', cell: (row) => xlsxCell.text(row.city) },
  { header: 'Asesor', cell: (row) => xlsxCell.text(row.owner.displayName) },
  { header: 'Tipo', cell: (row) => xlsxCell.text(row.projectType?.label) },
  { header: 'Fase', cell: (row) => xlsxCell.text(row.phase.label) },
  { header: '% avance', cell: (row) => xlsxCell.percent(row.phaseProgress) },
  { header: 'Estado comercial', cell: (row) => xlsxCell.text(commercialStatusText(row.commercialStatus)) },
  { header: 'Fecha estimada de decisión', cell: (row) => xlsxCell.date(row.estimatedDecisionDate) },
  { header: 'Última actualización', cell: (row) => xlsxCell.dateTime(row.lastActivityAt) },
];

/**
 * RN-05.59: monto original, moneda, tipo de cambio (1 en la moneda base), fecha del tipo
 * de cambio (vacía en la moneda base), monto USD y tonelaje, en ese orden.
 */
export function opportunityExportColumns(baseCurrencyCode: string): readonly ReportColumn<OpportunityReportView>[] {
  return [
    { header: 'Código', cell: (row) => xlsxCell.text(row.code) },
    { header: 'Código de proyecto', cell: (row) => xlsxCell.text(row.project.code) },
    { header: 'Proyecto', cell: (row) => xlsxCell.text(row.project.name) },
    { header: 'Cliente', cell: (row) => xlsxCell.text(row.customer.name) },
    { header: 'Asesor', cell: (row) => xlsxCell.text(row.owner.displayName) },
    { header: 'Etapa', cell: (row) => xlsxCell.text(row.stage.label) },
    { header: 'Resultado', cell: (row) => xlsxCell.text(row.result ? OUTCOME_LABELS[row.result.outcome] : null) },
    { header: '% adjudicado', cell: (row) => xlsxCell.percent(row.result?.awardedPercent) },
    { header: 'Motivo', cell: (row) => xlsxCell.text(row.result?.reason?.label) },
    { header: 'Monto estimado (original)', cell: (row) => xlsxCell.number(row.estimate.amount, XLSX_FORMATS.amount) },
    { header: 'Moneda', cell: (row) => xlsxCell.text(row.estimate.currencyCode) },
    {
      header: 'Tipo de cambio',
      cell: (row) =>
        xlsxCell.number(row.estimate.exchangeRate ?? (row.estimate.currencyCode === baseCurrencyCode ? '1' : null), XLSX_FORMATS.exchangeRate),
    },
    {
      header: 'Fecha del tipo de cambio',
      cell: (row) => xlsxCell.date(row.estimate.currencyCode === baseCurrencyCode ? null : row.estimate.exchangeRateDate),
    },
    { header: `Monto estimado (${baseCurrencyCode})`, cell: (row) => xlsxCell.number(row.estimate.amountUsd, XLSX_FORMATS.amount) },
    { header: 'Tonelaje estimado (t)', cell: (row) => xlsxCell.number(row.estimate.tonnage, XLSX_FORMATS.tonnage) },
    { header: 'Fecha de decisión', cell: (row) => xlsxCell.date(row.decisionDate) },
    { header: 'Tipo de fecha de decisión', cell: (row) => xlsxCell.text(row.decisionDateKind ? DECISION_DATE_KIND_LABELS[row.decisionDateKind] : null) },
    { header: 'Fecha de actualización', cell: (row) => xlsxCell.dateTime(row.updatedAt) },
  ];
}

export const FORECAST_EXPORT_COLUMNS: readonly ReportColumn<ForecastReportRecord>[] = [
  { header: 'Código de proyecto', cell: (row) => xlsxCell.text(row.project.code) },
  { header: 'Proyecto', cell: (row) => xlsxCell.text(row.project.name) },
  { header: 'Cliente', cell: (row) => xlsxCell.text(row.customer.name) },
  { header: 'SKU', cell: (row) => xlsxCell.text(row.product.sku) },
  { header: 'Producto', cell: (row) => xlsxCell.text(row.product.description) },
  { header: 'Familia', cell: (row) => xlsxCell.text(row.family.name) },
  { header: 'Año', cell: (row) => xlsxCell.integer(row.year) },
  { header: 'Mes', cell: (row) => xlsxCell.integer(row.month) },
  { header: 'Cantidad', cell: (row) => xlsxCell.number(row.quantity, XLSX_FORMATS.quantity) },
  { header: 'Unidad', cell: (row) => xlsxCell.text(row.unit.code) },
  // Vacía = "sin conversión" (DM-24); el conteo está en la hoja "Resumen".
  { header: 'Tonelaje (t)', cell: (row) => xlsxCell.number(row.tonnage, XLSX_FORMATS.tonnage) },
  { header: 'Asesor', cell: (row) => xlsxCell.text(row.owner.displayName) },
  { header: 'Fecha de actualización', cell: (row) => xlsxCell.dateTime(row.updatedAt) },
];

export const VISIT_EXPORT_COLUMNS: readonly ReportColumn<VisitReportView>[] = [
  { header: 'Código', cell: (row) => xlsxCell.text(row.code) },
  { header: 'Cliente', cell: (row) => xlsxCell.text(row.customer.name) },
  { header: 'Código de proyecto', cell: (row) => xlsxCell.text(row.project?.code) },
  { header: 'Proyecto', cell: (row) => xlsxCell.text(row.project?.name) },
  { header: 'Asesor', cell: (row) => xlsxCell.text(row.owner.displayName) },
  { header: 'Fecha planificada', cell: (row) => xlsxCell.dateTime(row.scheduledStartAt) },
  { header: 'Fecha planificada original', cell: (row) => xlsxCell.dateTime(row.originalScheduledAt) },
  { header: 'Reprogramaciones', cell: (row) => xlsxCell.integer(row.rescheduleCount) },
  { header: 'Fecha real', cell: (row) => xlsxCell.dateTime(row.actualStartAt) },
  { header: 'Estado', cell: (row) => xlsxCell.text(row.status.label) },
  { header: 'Resultado', cell: (row) => xlsxCell.text(row.result?.label) },
  { header: 'Fecha de confirmación', cell: (row) => xlsxCell.dateTime(row.confirmedAt) },
];

export const ACTIVITY_EXPORT_COLUMNS: readonly ReportColumn<ActivityReportView>[] = [
  { header: 'Código', cell: (row) => xlsxCell.text(row.code) },
  { header: 'Tipo', cell: (row) => xlsxCell.text(row.type.label) },
  { header: 'Asunto', cell: (row) => xlsxCell.text(row.subject) },
  { header: 'Cliente', cell: (row) => xlsxCell.text(row.customer.name) },
  { header: 'Código de proyecto', cell: (row) => xlsxCell.text(row.project?.code) },
  { header: 'Proyecto', cell: (row) => xlsxCell.text(row.project?.name) },
  { header: 'Responsable', cell: (row) => xlsxCell.text(row.owner.displayName) },
  { header: 'Fecha', cell: (row) => xlsxCell.dateTime(row.activityDate) },
  { header: 'Vencimiento', cell: (row) => xlsxCell.dateTime(row.dueAt) },
  { header: 'Vencida', cell: (row) => xlsxCell.text(row.isOverdue ? 'Sí' : 'No') },
  { header: 'Prioridad', cell: (row) => xlsxCell.text(row.priority.label) },
  { header: 'Estado', cell: (row) => xlsxCell.text(row.status.label) },
  { header: 'Resultado', cell: (row) => xlsxCell.text(row.result?.label) },
];

export function headersOf<TRow>(columns: readonly ReportColumn<TRow>[]): string[] {
  return columns.map((column) => column.header);
}

export function cellsOf<TRow>(columns: readonly ReportColumn<TRow>[], row: TRow): XlsxCell[] {
  return columns.map((column) => column.cell(row));
}
