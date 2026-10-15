import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { VisitReportExportQueryDto, VisitReportFilterDto, VisitReportQueryDto } from './dto/report-query.dto';
import { PaginatedVisitReportDto, type VisitReportRowDto, VisitReportSummaryDto } from './dto/report-response.dto';
import { ReportEndpoint, ReportExportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { streamReportExport } from './report-download';
import { ReportExportService } from './report-export.service';
import { toVisitReportRowDto, toVisitReportSummaryDto } from './report.mapper';
import { VisitReportService } from './visit-report.service';

const PERIOD_ERRORS = '`from`/`to` sueltos, `from > to`';

/** Reporte de visitas (05 F-37). */
@ReportsController()
@Controller('reports/visits')
export class VisitReportController {
  constructor(
    private readonly reports: VisitReportService,
    private readonly contexts: ReportContextResolver,
    private readonly exports: ReportExportService,
    private readonly logger: AppLogger,
  ) {}

  @Get('export')
  @ReportExportEndpoint({
    summary: 'Exportación XLSX del reporte de visitas (F-37/F-39)',
    description: 'Columnas de la pantalla (E.5); una fila por visita (las reprogramadas, una vez). "Resumen": categorías e informativos.',
    badRequest: PERIOD_ERRORS,
  })
  async export(@Query() query: VisitReportExportQueryDto, @Req() request: AppRequest, @Res() response: Response): Promise<void> {
    const ctx = await this.contexts.fromRequest(request);
    await streamReportExport(response, this.logger, ctx.correlationId, (download) => this.exports.exportVisits(ctx, query, download));
  }

  @Get('summary')
  @ReportEndpoint({
    summary: 'Resumen del reporte de visitas (F-37)',
    description:
      'Mismo conjunto que la lista. Categorías disjuntas por el estado vigente: programadas (incluye REPROGRAMADA), realizadas sin confirmar, ' +
      'confirmadas y canceladas (suman `total`). Informativos no aditivos: visitas reprogramadas y total de reprogramaciones (una visita ' +
      'reprogramada cuenta una vez, RN-05.39) y programadas atrasadas.',
    ok: VisitReportSummaryDto,
    badRequest: PERIOD_ERRORS,
  })
  async summary(@Query() query: VisitReportFilterDto, @Req() request: AppRequest): Promise<VisitReportSummaryDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toVisitReportSummaryDto(await this.reports.summary(ctx, query));
  }

  @Get()
  @ReportEndpoint({
    summary: 'Reporte de visitas (F-37)',
    description:
      'Una fila por visita con cliente, proyecto, asesor, fecha planificada **vigente** (y la original y las reprogramaciones), fecha real, ' +
      'estado con su categoría, resultado y confirmación. `dateBasis` por defecto `SCHEDULED`; el país es el del cliente (AC-05.19). Orden ' +
      'por defecto `scheduledStartAt` descendente; desempate por `id`.',
    ok: PaginatedVisitReportDto,
    badRequest: PERIOD_ERRORS,
  })
  async list(@Query() query: VisitReportQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<VisitReportRowDto>> {
    const ctx = await this.contexts.fromRequest(request);
    const page = await this.reports.list(ctx, query);
    return PaginatedResponseDto.of(page.items.map(toVisitReportRowDto), page.page, page.pageSize, page.totalItems);
  }
}
