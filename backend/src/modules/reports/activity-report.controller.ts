import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { ActivityReportService } from './activity-report.service';
import { ActivityReportExportQueryDto, ActivityReportFilterDto, ActivityReportQueryDto } from './dto/report-query.dto';
import { type ActivityReportRowDto, ActivityReportSummaryDto, PaginatedActivityReportDto } from './dto/report-response.dto';
import { ReportEndpoint, ReportExportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { streamReportExport } from './report-download';
import { ReportExportService } from './report-export.service';
import { toActivityReportRowDto, toActivityReportSummaryDto } from './report.mapper';

const PERIOD_ERRORS = '`from`/`to` sueltos, `from > to`';

/** Reporte de actividades (05 F-38). */
@ReportsController()
@Controller('reports/activities')
export class ActivityReportController {
  constructor(
    private readonly reports: ActivityReportService,
    private readonly contexts: ReportContextResolver,
    private readonly exports: ReportExportService,
    private readonly logger: AppLogger,
  ) {}

  @Get('export')
  @ReportExportEndpoint({
    summary: 'Exportación XLSX del reporte de actividades (F-38/F-39)',
    description: 'Columnas de la pantalla (E.6). "Resumen": pendientes, vencidas, realizadas, canceladas, total y próximas a vencer.',
    badRequest: PERIOD_ERRORS,
  })
  async export(@Query() query: ActivityReportExportQueryDto, @Req() request: AppRequest, @Res() response: Response): Promise<void> {
    const ctx = await this.contexts.fromRequest(request);
    await streamReportExport(response, this.logger, ctx.correlationId, (download) => this.exports.exportActivities(ctx, query, download));
  }

  @Get('summary')
  @ReportEndpoint({
    summary: 'Resumen del reporte de actividades (F-38)',
    description:
      'Mismo conjunto que la lista. Categorías disjuntas (D-05.5): pendientes (abiertas no vencidas), vencidas (abiertas con vencimiento ' +
      'pasado), realizadas y canceladas; suman `total`. Informativo: próximas a vencer en `[ahora, ahora + crm.alertas.actividad_por_vencer_horas]`.',
    ok: ActivityReportSummaryDto,
    badRequest: PERIOD_ERRORS,
  })
  async summary(@Query() query: ActivityReportFilterDto, @Req() request: AppRequest): Promise<ActivityReportSummaryDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toActivityReportSummaryDto(await this.reports.summary(ctx, query));
  }

  @Get()
  @ReportEndpoint({
    summary: 'Reporte de actividades (F-38)',
    description:
      'Una fila por actividad no eliminada: tipo, asunto, cliente, proyecto, responsable, fecha, vencimiento, prioridad, estado con su ' +
      'categoría (`isOverdue` si está vencida) y resultado. `dateBasis` por defecto `ACTIVITY_DATE`; el país es el del cliente. Orden por ' +
      'defecto `activityDate` descendente; desempate por `id`.',
    ok: PaginatedActivityReportDto,
    badRequest: PERIOD_ERRORS,
  })
  async list(@Query() query: ActivityReportQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<ActivityReportRowDto>> {
    const ctx = await this.contexts.fromRequest(request);
    const page = await this.reports.list(ctx, query);
    return PaginatedResponseDto.of(page.items.map(toActivityReportRowDto), page.page, page.pageSize, page.totalItems);
  }
}
