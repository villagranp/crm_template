import { Controller, Get, Query, Req } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';

import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/report-query.dto';
import { CommercialDashboardDto, CommercialTrendsDto } from './dto/report-response.dto';
import { ReportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { toCommercialDashboardDto, toCommercialTrendsDto } from './report.mapper';

const PERIOD_ERRORS = '`from`/`to` sueltos, `from > to`';
const PERIOD_NOTE =
  'Período por defecto: los 12 meses cerrados anteriores + el mes en curso (zona del negocio); máximo 24 meses de calendario ' +
  '(`422 PERIOD_TOO_LONG` con `maxMonths`). `countryId` y `ownerId` se aplican a todos los paneles, dentro del alcance.';

/** Dashboard comercial (05 F-40, E.7). `/trends` se declara antes de cualquier ruta con parámetro. */
@ReportsController()
@Controller('reports/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboards: DashboardService,
    private readonly contexts: ReportContextResolver,
  ) {}

  @Get('trends')
  @ReportEndpoint({
    summary: 'Tendencias del dashboard comercial (F-40)',
    description:
      'Series mensuales (RN-05.52) de: oportunidades identificadas (`opportunity_date`), ganadas (WON + PARTIAL) y perdidas ' +
      '(`decision_date`), actividades realizadas (`completed_at`) y visitas realizadas (`actual_start_at`, realizadas + confirmadas), ' +
      `con **todos** los meses del período (también en 0). "Proyectos activos" no tiene tendencia (D-05.13). ${PERIOD_NOTE}`,
    ok: CommercialTrendsDto,
    badRequest: PERIOD_ERRORS,
  })
  async trends(@Query() query: DashboardQueryDto, @Req() request: AppRequest): Promise<CommercialTrendsDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toCommercialTrendsDto(await this.dashboards.trends(ctx, query));
  }

  @Get()
  @ReportEndpoint({
    summary: 'Dashboard comercial (F-40)',
    description:
      'Paneles de E.7 con las definiciones compartidas con Inicio y los reportes (G.3): proyectos activos por fase (estado actual), ' +
      'oportunidades identificadas en el período por etapa vigente, ganadas/parciales/perdidas por mes de decisión, forecast por mes ' +
      '(meses del período ∪ M+1…M+6) con acumulado, distribución por asesor (top 10 + "Otros") y actividades/visitas por mes. ' +
      `Analítico: sin alertas ni pendientes personales (RN-05.51). ${PERIOD_NOTE}`,
    ok: CommercialDashboardDto,
    badRequest: PERIOD_ERRORS,
  })
  async dashboard(@Query() query: DashboardQueryDto, @Req() request: AppRequest): Promise<CommercialDashboardDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toCommercialDashboardDto(await this.dashboards.dashboard(ctx, query));
  }
}
