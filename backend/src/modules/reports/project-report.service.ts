import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '@/infrastructure/database/ports/pagination';
import { CommercialMetricsService } from '@/modules/commercial-metrics/commercial-metrics.service';
import { type CommercialStatus, isFinalPhase } from '@/modules/commercial-metrics/metric-definitions';
import { commercialStatusFromAggregate } from '@/modules/projects/project-commercial-status';

import { type ProjectReportRecord, type ProjectReportSortField, REPORTING_REPOSITORY, type ReportingRepository } from './ports/reporting.repository.port';
import type { ReportContext } from './report-context';
import { projectCriteria, type ProjectReportFilter } from './report-criteria';
import { reportPage, type ReportPageQuery } from './report-paging';

export type ProjectReportQuery = ProjectReportFilter & ReportPageQuery<ProjectReportSortField>;

/** Fila del reporte de proyectos (F-34): registro + fase con su semántica + estado comercial (DEF-B). */
export interface ProjectReportView extends Omit<ProjectReportRecord, 'phase' | 'commercial'> {
  readonly phase: { readonly id: string; readonly label: string; readonly isFinal: boolean };
  readonly commercialStatus: CommercialStatus;
}

export const PROJECT_REPORT_DEFAULT_SORT = { sortBy: 'lastActivityAt', sortOrder: 'desc' } as const;

/**
 * Reporte de proyectos (05 F-34, E.2, AC-05.1–AC-05.3). Una fila por proyecto: el estado
 * comercial sale del agregado por proyecto (RN-05.17), nunca de un `JOIN` que multiplique.
 */
@Injectable()
export class ProjectReportService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
  ) {}

  async list(ctx: ReportContext, query: ProjectReportQuery): Promise<Page<ProjectReportView>> {
    const semantics = await this.metrics.semantics();
    const criteria = projectCriteria(query, ctx, semantics);
    const page = await this.reporting.projectRows(criteria, reportPage(query, PROJECT_REPORT_DEFAULT_SORT));
    const phases = new Map(semantics.phases.map((phase) => [phase.id, phase]));
    return {
      ...page,
      items: page.items.map(({ commercial, phase, ...row }) => {
        const semantic = phases.get(phase.id);
        return {
          ...row,
          phase: { ...phase, isFinal: semantic ? isFinalPhase(semantic) : false },
          commercialStatus: commercialStatusFromAggregate(commercial),
        };
      }),
    };
  }
}
