import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '@/infrastructure/database/ports/pagination';
import { CommercialMetricsService, type ForecastGroup, type ForecastTotals } from '@/modules/commercial-metrics/commercial-metrics.service';
import type { ForecastGroupBy } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { type ForecastReportRecord, type ForecastReportSortField, REPORTING_REPOSITORY, type ReportingRepository } from './ports/reporting.repository.port';
import { REPORT_PARAMETERS, type ReportContext } from './report-context';
import { forecastCriteria, type ForecastReportFilter } from './report-criteria';
import { reportValidationError } from './report-errors';
import { reportPage, type ReportPageQuery } from './report-paging';

export type ForecastReportQuery = ForecastReportFilter & ReportPageQuery<ForecastReportSortField>;

export interface ForecastConsolidatedQuery extends ForecastReportFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly groupBy?: ForecastGroupBy;
  readonly thenBy?: ForecastGroupBy;
}

export interface ForecastReportSummary extends ForecastTotals {
  /** `crm.forecast.unidad_tonelaje`. */
  readonly tonnageUnit: string;
}

export const FORECAST_REPORT_DEFAULT_SORT = { sortBy: 'period', sortOrder: 'asc' } as const;

/**
 * Reporte de forecast (05 F-36, E.4, AC-05.12–AC-05.16): detalle por línea, consolidación
 * por uno o dos niveles y resumen mensual con acumulados. Rango por defecto M+1…M+H en la
 * zona del negocio; la ventana móvil no borra historia (un rango pasado se consulta igual).
 */
@Injectable()
export class ForecastReportService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
    private readonly parameters: ParameterReader,
  ) {}

  async list(ctx: ReportContext, query: ForecastReportQuery): Promise<Page<ForecastReportRecord>> {
    const criteria = forecastCriteria(query, ctx, await this.horizon());
    return this.reporting.forecastRows(criteria, reportPage(query, FORECAST_REPORT_DEFAULT_SORT));
  }

  async consolidated(ctx: ReportContext, query: ForecastConsolidatedQuery): Promise<Page<ForecastGroup>> {
    const groupBy = query.groupBy ?? 'MONTH';
    if (query.thenBy !== undefined && query.thenBy === groupBy) throw reportValidationError('thenBy', 'thenBy must be different from groupBy');
    const criteria = forecastCriteria(query, ctx, await this.horizon());
    return this.metrics.forecastConsolidation(criteria, { groupBy, thenBy: query.thenBy ?? null }, { page: query.page, pageSize: query.pageSize });
  }

  async summary(ctx: ReportContext, filter: ForecastReportFilter): Promise<ForecastReportSummary> {
    const [horizon, tonnageUnit] = await Promise.all([this.horizon(), this.parameters.get<string>(REPORT_PARAMETERS.tonnageUnit)]);
    const totals = await this.metrics.forecastTotals(forecastCriteria(filter, ctx, horizon));
    return { ...totals, tonnageUnit };
  }

  private horizon(): Promise<number> {
    return this.parameters.get<number>(REPORT_PARAMETERS.forecastHorizon);
  }
}
