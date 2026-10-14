import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '@/infrastructure/database/ports/pagination';
import { CommercialMetricsService } from '@/modules/commercial-metrics/commercial-metrics.service';
import { visitCategory, type VisitCategory } from '@/modules/commercial-metrics/metric-definitions';
import type { VisitCountsRecord } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import { REPORTING_REPOSITORY, type ReportingRepository, type VisitReportRecord, type VisitReportSortField } from './ports/reporting.repository.port';
import type { ReportContext } from './report-context';
import { visitCriteria, type VisitReportFilter } from './report-criteria';
import { reportPage, type ReportPageQuery } from './report-paging';

export type VisitReportQuery = VisitReportFilter & ReportPageQuery<VisitReportSortField>;

export interface VisitReportView extends Omit<VisitReportRecord, 'status'> {
  readonly status: { readonly id: string; readonly label: string; readonly category: VisitCategory };
}

/** Resumen (RN-05.38, RN-05.39): categorías disjuntas + informativos no aditivos. */
export interface VisitReportSummary extends Omit<VisitCountsRecord, 'upcoming'> {
  /** Realizadas en total = realizadas sin confirmar + confirmadas. */
  readonly completedTotal: number;
}

export const VISIT_REPORT_DEFAULT_SORT = { sortBy: 'scheduledStartAt', sortOrder: 'desc' } as const;

/**
 * Reporte de visitas (05 F-37, E.5, AC-05.17–AC-05.19). Una fila por visita: una
 * reprogramada aparece una vez, en el período de su fecha **vigente** (RN-05.39).
 */
@Injectable()
export class VisitReportService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
  ) {}

  async list(ctx: ReportContext, query: VisitReportQuery): Promise<Page<VisitReportView>> {
    const semantics = await this.metrics.semantics();
    const page = await this.reporting.visitRows(visitCriteria(query, ctx, semantics), reportPage(query, VISIT_REPORT_DEFAULT_SORT));
    const statuses = new Map(semantics.visitStatuses.map((status) => [status.id, status]));
    return {
      ...page,
      items: page.items.map((row) => {
        const semantic = statuses.get(row.status.id);
        return { ...row, status: { ...row.status, category: semantic ? visitCategory(semantic) : 'CANCELLED' } };
      }),
    };
  }

  async summary(ctx: ReportContext, filter: VisitReportFilter): Promise<VisitReportSummary> {
    const semantics = await this.metrics.semantics();
    const counts = await this.metrics.countVisitCategories(visitCriteria(filter, ctx, semantics), ctx.now, null);
    return {
      total: counts.total,
      scheduled: counts.scheduled,
      completed: counts.completed,
      confirmed: counts.confirmed,
      cancelled: counts.cancelled,
      completedTotal: counts.completed + counts.confirmed,
      rescheduledVisits: counts.rescheduledVisits,
      rescheduleEvents: counts.rescheduleEvents,
      overduePending: counts.overduePending,
    };
  }
}
