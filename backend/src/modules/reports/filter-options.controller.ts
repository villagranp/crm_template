import { Controller, Get, Req } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';

import { ReportFilterOptionsDto } from './dto/report-response.dto';
import { FilterOptionsService } from './filter-options.service';
import { ReportEndpoint, ReportsController } from './report-api.decorators';
import { ReportContextResolver } from './report-context';
import { toReportFilterOptionsDto } from './report.mapper';

/** Opciones de filtro autorizadas de los reportes (05 F.1, E.1). */
@ReportsController()
@Controller('reports/filter-options')
export class FilterOptionsController {
  constructor(
    private readonly options: FilterOptionsService,
    private readonly contexts: ReportContextResolver,
  ) {}

  @Get()
  @ReportEndpoint({
    summary: 'Opciones de filtro de los reportes',
    description:
      'Asesores responsables de algún registro comercial visible, países de los registros visibles (y el del alcance `COUNTRY`), valores ' +
      'de los catálogos con su semántica (etapas, fases, tipos de proyecto, estados de visita y actividad, tipos de actividad, prioridades, ' +
      'tipos de empresa; activos e inactivos) y familias de producto activas. `scope` = alcance de `reportes.ver`. Zonas horarias de ' +
      'presentación (aditivo): `businessTimeZone` (`crm.zona_horaria_negocio`) y `timeZone` (perfil del usuario; sin ella, la del negocio). ' +
      'Sin parámetros.',
    ok: ReportFilterOptionsDto,
    withQuery: false,
  })
  async get(@Req() request: AppRequest): Promise<ReportFilterOptionsDto> {
    const ctx = await this.contexts.fromRequest(request);
    return toReportFilterOptionsDto(await this.options.get(ctx));
  }
}
