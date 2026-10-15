import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { ProjectReportExportQueryDto, ProjectReportQueryDto } from './dto/report-query.dto';
import { PaginatedProjectReportDto, type ProjectReportRowDto } from './dto/report-response.dto';
import { ProjectReportService } from './project-report.service';
import { ReportEndpoint, ReportExportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { streamReportExport } from './report-download';
import { ReportExportService } from './report-export.service';
import { toProjectReportRowDto } from './report.mapper';

/** Reporte de proyectos (05 F-34). Sin lógica: forma, contexto, delega y mapea. */
@ReportsController()
@Controller('reports/projects')
export class ProjectReportController {
  constructor(
    private readonly reports: ProjectReportService,
    private readonly contexts: ReportContextResolver,
    private readonly exports: ReportExportService,
    private readonly logger: AppLogger,
  ) {}

  @Get('export')
  @ReportExportEndpoint({
    summary: 'Exportación XLSX del reporte de proyectos (F-39)',
    description: 'Columnas de la pantalla (E.2). "Resumen": proyectos, activos y finalizados del conjunto.',
    badRequest: '`from`/`to` sueltos, `from > to`, período sin `dateBasis`, `commercialStatus` mal formado',
  })
  async export(@Query() query: ProjectReportExportQueryDto, @Req() request: AppRequest, @Res() response: Response): Promise<void> {
    const ctx = await this.contexts.fromRequest(request);
    await streamReportExport(response, this.logger, ctx.correlationId, (download) => this.exports.exportProjects(ctx, query, download));
  }

  @Get()
  @ReportEndpoint({
    summary: 'Reporte de proyectos (F-34)',
    description:
      'Proyectos visibles con código, nombre, cliente, país, ubicación, asesor, tipo, fase, % de avance, estado comercial (DEF-B: ' +
      'etapa abierta de mayor orden, "Ganado", "Perdido" o "Sin oportunidades"; una fila por proyecto), fecha estimada de decisión y ' +
      'última actualización (`last_activity_at`). Período opcional con `dateBasis` obligatorio (`DECISION_ESTIMATED`, `UPDATED`, ' +
      '`CREATED`). Orden por defecto `lastActivityAt` descendente; desempate por `id`.',
    ok: PaginatedProjectReportDto,
    badRequest: '`from`/`to` sueltos, `from > to`, período sin `dateBasis`, `commercialStatus` inválido',
  })
  async list(@Query() query: ProjectReportQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<ProjectReportRowDto>> {
    const ctx = await this.contexts.fromRequest(request);
    const page = await this.reports.list(ctx, query);
    return PaginatedResponseDto.of(page.items.map(toProjectReportRowDto), page.page, page.pageSize, page.totalItems);
  }
}
