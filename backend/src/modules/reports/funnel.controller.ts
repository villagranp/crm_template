import { Controller, Get, Query, Req } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';

import { FunnelQueryDto } from './dto/report-query.dto';
import { SalesFunnelDto } from './dto/report-response.dto';
import { FunnelService } from './funnel.service';
import { ReportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { toSalesFunnelDto } from './report.mapper';

/** Embudo comercial (05 F-41, E.8). */
@ReportsController()
@Controller('reports/funnel')
export class FunnelController {
  constructor(
    private readonly funnels: FunnelService,
    private readonly contexts: ReportContextResolver,
  ) {}

  @Get()
  @ReportEndpoint({
    summary: 'Embudo comercial (F-41)',
    description:
      'Etapas activas con `metadata.inFunnel` en `metadata.order` (RN-05.53) con la cantidad de oportunidades cuya etapa **vigente** es ' +
      'esa; % de participación sobre el total del embudo (RN-05.54) y conversión acumulada por historial de etapas (RN-05.55), solo ' +
      'si todas las oportunidades del conjunto tienen historial y la muestra ≥ `sampleMinimum`; si no, `null` con ' +
      '`unavailableReason` (`NO_DATA`, `INSUFFICIENT_HISTORY`, `INSUFFICIENT_SAMPLE`), nunca 0 %. `stageId` solo limita las barras: ' +
      'los porcentajes son siempre los del embudo completo del resto de filtros (RN-05.56). Período opcional por `opportunity_date`.',
    ok: SalesFunnelDto,
    badRequest: '`from`/`to` sueltos, `from > to`',
  })
  async funnel(@Query() query: FunnelQueryDto, @Req() request: AppRequest): Promise<SalesFunnelDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toSalesFunnelDto(await this.funnels.funnel(ctx, query));
  }
}
