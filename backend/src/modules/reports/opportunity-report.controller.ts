import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { OpportunityReportExportQueryDto, OpportunityReportFilterDto, OpportunityReportQueryDto } from './dto/report-query.dto';
import { type OpportunityReportRowDto, OpportunityReportSummaryDto, PaginatedOpportunityReportDto } from './dto/report-response.dto';
import { OpportunityReportService } from './opportunity-report.service';
import { ReportEndpoint, ReportExportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { streamReportExport } from './report-download';
import { ReportExportService } from './report-export.service';
import { toOpportunityReportRowDto, toOpportunityReportSummaryDto } from './report.mapper';

const PERIOD_ERRORS = '`from`/`to` sueltos, `from > to`';

/** Reporte de oportunidades (05 F-35). `/summary` se declara antes de cualquier ruta con parámetro. */
@ReportsController()
@Controller('reports/opportunities')
export class OpportunityReportController {
  constructor(
    private readonly reports: OpportunityReportService,
    private readonly contexts: ReportContextResolver,
    private readonly exports: ReportExportService,
    private readonly logger: AppLogger,
  ) {}

  @Get('export')
  @ReportExportEndpoint({
    summary: 'Exportación XLSX del reporte de oportunidades (F-39)',
    description: 'Columnas de la pantalla (E.3) con la estimación desglosada según RN-05.59: monto original, moneda, tipo de cambio, fecha del tipo de cambio (vacía en USD), monto en USD y toneladas. "Resumen" con los conteos, distribuciones y el total **solo en USD** (más la fila referencial separada si aplica RN-05.58).',
    badRequest: PERIOD_ERRORS,
  })
  async export(@Query() query: OpportunityReportExportQueryDto, @Req() request: AppRequest, @Res() response: Response): Promise<void> {
    const ctx = await this.contexts.fromRequest(request);
    await streamReportExport(response, this.logger, ctx.correlationId, (download) => this.exports.exportOpportunities(ctx, query, download));
  }

  @Get('summary')
  @ReportEndpoint({
    summary: 'Resumen del reporte de oportunidades (F-35)',
    description:
      'Mismos filtros y **mismo conjunto** que la lista. Conteos disjuntos: `open + won + lost + closedWithoutResult = total`; ' +
      '`won` = WON + PARTIAL (DM-15) con `wonFull` y `partial` desglosados. Distribución por etapa (todas las activas en `metadata.order`, ' +
      'también con 0) y por asesor. Estimación: **un único total en USD** = Σ `estimated_amount_usd` (RN-05.13) y Σ toneladas; con un ' +
      'único país efectivo de moneda distinta de USD, su equivalente **referencial** (RN-05.58) o el motivo por el que no aplica.',
    ok: OpportunityReportSummaryDto,
    badRequest: PERIOD_ERRORS,
  })
  async summary(@Query() query: OpportunityReportFilterDto, @Req() request: AppRequest): Promise<OpportunityReportSummaryDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toOpportunityReportSummaryDto(await this.reports.summary(ctx, query));
  }

  @Get()
  @ReportEndpoint({
    summary: 'Reporte de oportunidades (F-35)',
    description:
      'Una fila por oportunidad (los filtros por producto o familia usan `EXISTS`: nunca se duplica, D-05.10). Estimación con monto ' +
      'original, moneda, tipo de cambio y su fecha, equivalente en USD y toneladas (RN-05.29). Fecha de decisión real o, sin resultado, ' +
      'la estimada del proyecto (`decisionDateKind = ESTIMATED`). `dateBasis` por defecto `IDENTIFIED`; con `DECIDED` solo entran las que ' +
      'tienen resultado. Orden por defecto `updatedAt` descendente; desempate por `id`.',
    ok: PaginatedOpportunityReportDto,
    badRequest: PERIOD_ERRORS,
  })
  async list(@Query() query: OpportunityReportQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<OpportunityReportRowDto>> {
    const ctx = await this.contexts.fromRequest(request);
    const page = await this.reports.list(ctx, query);
    return PaginatedResponseDto.of(page.items.map(toOpportunityReportRowDto), page.page, page.pageSize, page.totalItems);
  }
}
