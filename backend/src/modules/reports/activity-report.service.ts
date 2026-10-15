import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '@/infrastructure/database/ports/pagination';
import { CommercialMetricsService, type MetricCatalogItem } from '@/modules/commercial-metrics/commercial-metrics.service';
import { activityCategory, type ActivityCategory } from '@/modules/commercial-metrics/metric-definitions';
import type { ActivityCountsRecord } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { type ActivityReportRecord, type ActivityReportSortField, REPORTING_REPOSITORY, type ReportingRepository } from './ports/reporting.repository.port';
import { REPORT_PARAMETERS, type ReportContext } from './report-context';
import { activityCriteria, type ActivityReportFilter } from './report-criteria';
import { reportPage, type ReportPageQuery } from './report-paging';

export type ActivityReportQuery = ActivityReportFilter & ReportPageQuery<ActivityReportSortField>;

export interface ActivityReportView extends Omit<ActivityReportRecord, 'status'> {
  readonly status: { readonly id: string; readonly label: string; readonly category: ActivityCategory };
  readonly isOverdue: boolean;
}

export interface ActivityReportSummary extends ActivityCountsRecord {
  /** `crm.alertas.actividad_por_vencer_horas` (RN-05.42). */
  readonly dueSoonHours: number;
}

export const ACTIVITY_REPORT_DEFAULT_SORT = { sortBy: 'activityDate', sortOrder: 'desc' } as const;

/** Registro → fila del reporte (pantalla y exportación, RN-05.44); "ahora" = instante del servidor. */
export function activityView(row: ActivityReportRecord, statuses: ReadonlyMap<string, MetricCatalogItem>, now: Date): ActivityReportView {
  const semantic = statuses.get(row.status.id);
  const category = semantic ? activityCategory(semantic, row.dueAt, now) : 'CANCELLED';
  return { ...row, status: { ...row.status, category }, isOverdue: category === 'OVERDUE' };
}

/**
 * Reporte de actividades (05 F-38, E.6, AC-05.20–AC-05.22): pendientes y vencidas
 * disjuntas (D-05.5); "ahora" es el instante del servidor (RN-05.7).
 */
@Injectable()
export class ActivityReportService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
    private readonly parameters: ParameterReader,
  ) {}

  async list(ctx: ReportContext, query: ActivityReportQuery): Promise<Page<ActivityReportView>> {
    const semantics = await this.metrics.semantics();
    const page = await this.reporting.activityRows(activityCriteria(query, ctx, semantics), reportPage(query, ACTIVITY_REPORT_DEFAULT_SORT));
    const statuses = new Map(semantics.activityStatuses.map((status) => [status.id, status]));
    return {
      ...page,
      items: page.items.map((row) => activityView(row, statuses, ctx.now)),
    };
  }

  async summary(ctx: ReportContext, filter: ActivityReportFilter): Promise<ActivityReportSummary> {
    const semantics = await this.metrics.semantics();
    const dueSoonHours = await this.parameters.get<number>(REPORT_PARAMETERS.dueSoonHours);
    const counts = await this.metrics.countActivityCategories(activityCriteria(filter, ctx, semantics), dueSoonHours);
    return { ...counts, dueSoonHours };
  }
}
