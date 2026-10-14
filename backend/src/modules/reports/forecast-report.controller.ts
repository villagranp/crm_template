import { Controller, Get, Query, Req } from '@nestjs/common';

import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { ForecastConsolidatedQueryDto, ForecastReportQueryDto, ForecastSummaryQueryDto } from './dto/report-query.dto';
import {
  type ForecastGroupDto,
  type ForecastReportRowDto,
  ForecastReportSummaryDto,
  PaginatedForecastGroupDto,
  PaginatedForecastReportDto,
} from './dto/report-response.dto';
import { ForecastReportService } from './forecast-report.service';
import { ReportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { toForecastGroupDto, toForecastReportRowDto, toForecastReportSummaryDto } from './report.mapper';

const RANGE_ERRORS = '`fromMonth`/`toMonth` sueltos o mal formados, `fromMonth > toMonth`';
const RANGE_NOTE =
  'Rango `fromMonth`…`toMonth` (por defecto M+1…M+6 en `crm.zona_horaria_negocio`; máximo 24 meses). Solo líneas con cantidad > 0 ' +
  '(RN-05.33); las líneas sin conversión no entran en las toneladas (DM-24) y las cantidades nunca se suman entre unidades.';

/** Reporte de forecast (05 F-36). `/consolidated` y `/summary` antes de cualquier ruta con parámetro. */
@ReportsController()
@Controller('reports/forecast')
export class ForecastReportController {
  constructor(
    private readonly reports: ForecastReportService,
    private readonly contexts: ReportContextResolver,
  ) {}

  @Get('summary')
  @ReportEndpoint({
    summary: 'Resumen del reporte de forecast (F-36)',
    description: `Totales de **cada** mes del rango en toneladas con su acumulado, cantidades por unidad con su acumulado, líneas sin conversión y última actualización del conjunto (RN-05.34–RN-05.37). ${RANGE_NOTE}`,
    ok: ForecastReportSummaryDto,
    badRequest: RANGE_ERRORS,
  })
  async summary(@Query() query: ForecastSummaryQueryDto, @Req() request: AppRequest): Promise<ForecastReportSummaryDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toForecastReportSummaryDto(await this.reports.summary(ctx, query));
  }

  @Get('consolidated')
  @ReportEndpoint({
    summary: 'Consolidación del forecast (F-36)',
    description: `Grupos del primer nivel (\`groupBy\`, por defecto \`MONTH\`) paginados; con \`thenBy\`, sus subgrupos. Cada grupo trae las toneladas de cada mes del rango, su total, cantidades por unidad y líneas sin conversión; la suma de los grupos coincide con el resumen (AC-05.14). ${RANGE_NOTE}`,
    ok: PaginatedForecastGroupDto,
    badRequest: `${RANGE_ERRORS}, \`thenBy = groupBy\``,
  })
  async consolidated(@Query() query: ForecastConsolidatedQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<ForecastGroupDto>> {
    const ctx = await this.contexts.fromRequest(request);
    const page = await this.reports.consolidated(ctx, query);
    return PaginatedResponseDto.of(page.items.map(toForecastGroupDto), page.page, page.pageSize, page.totalItems);
  }

  @Get()
  @ReportEndpoint({
    summary: 'Reporte de forecast: detalle por línea (F-36)',
    description: `Una fila por línea: proyecto, cliente, producto, familia, año, mes, cantidad, unidad, toneladas, asesor y fecha de actualización. Orden por defecto \`period\` (año y mes) ascendente; desempate por \`id\`. ${RANGE_NOTE}`,
    ok: PaginatedForecastReportDto,
    badRequest: RANGE_ERRORS,
  })
  async list(@Query() query: ForecastReportQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<ForecastReportRowDto>> {
    const ctx = await this.contexts.fromRequest(request);
    const page = await this.reports.list(ctx, query);
    return PaginatedResponseDto.of(page.items.map(toForecastReportRowDto), page.page, page.pageSize, page.totalItems);
  }
}
