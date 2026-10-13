import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import {
  ForecastQueryDto,
  ForecastSaveResultDto,
  ForecastTotalsDto,
  ForecastWindowDto,
  PaginatedForecastRowsDto,
  SaveForecastLinesDto,
} from './dto/forecast.dto';
import { FORECAST_PERMISSIONS } from './forecast-access';
import { type ForecastQuery, ForecastService } from './forecast.service';
import { toForecastRowsDto, toForecastSaveResultDto, toForecastTotalsDto, toForecastWindowDto } from './forecast.mapper';

const QUERY_400 = 'VALIDATION_FAILED: forma de la consulta (`details[]`: `{ field, issue }`); `periods` con `HISTORY` o `from`/`to` con `WINDOW`';
const QUERY_422 =
  'FORECAST_PERIOD_OUT_OF_WINDOW (`details[]`: `{ field: "periods[i]", code, message, period: "YYYY-MM" }`) · ' +
  'INVALID_DATE_RANGE (`details[0]`: `{ field: "to", code, message, startField: "from" }`, con `maxMonths: 24` si el rango supera 24 meses)';

function toQuery(dto: ForecastQueryDto): ForecastQuery {
  return {
    mode: dto.mode,
    ...(dto.periods !== undefined ? { periods: dto.periods } : {}),
    ...(dto.from !== undefined ? { from: dto.from } : {}),
    ...(dto.to !== undefined ? { to: dto.to } : {}),
    projectIds: dto.projectId ?? [],
    productIds: dto.productId ?? [],
    ownerIds: dto.ownerId ?? [],
    search: dto.search ?? null,
  };
}

/**
 * Forecast comercial M+6 (03 F-20, F.3). Lectura con `forecast.ver` (visibilidad del
 * proyecto o línea propia, DM-13); guardado con `forecast.editar` y, en el caso de uso,
 * proyecto propio o `forecast.administrar` dentro de su alcance (RN-03.71).
 */
@ApiTags('Forecast')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('forecast')
export class ForecastController {
  constructor(
    private readonly forecast: ForecastService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get('window')
  @RequirePermission(FORECAST_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-20 · Ventana vigente del forecast',
    description: 'M = mes en curso en `crm.zona_horaria_negocio`; periodos M+1 … M+N (`crm.forecast.horizonte_meses`). Solo esos son editables (D-03.5).',
  })
  @ApiOkResponse({ type: ForecastWindowDto })
  async window(): Promise<ForecastWindowDto> {
    return toForecastWindowDto(await this.forecast.window());
  }

  @Get('rows')
  @RequirePermission(FORECAST_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-20 · Filas de la matriz (ventana o historial)',
    description:
      'Filas = pares (proyecto, producto) con asociación activa en un proyecto visible, más los pares con líneas visibles en los períodos consultados ' +
      '(línea visible = proyecto visible o línea propia del alcance). Una celda por período. `canEdit` y `editable` salen de la misma política que `PUT /forecast/lines`.',
  })
  @ApiOkResponse({ type: PaginatedForecastRowsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: QUERY_400 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: QUERY_422 })
  async rows(@Query() query: ForecastQueryDto, @Req() request: AppRequest): Promise<PaginatedForecastRowsDto> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.forecast.rows(actor, {
      ...toQuery(query),
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy ?? 'projectCode',
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
    });
    return toForecastRowsDto(page);
  }

  @Get('totals')
  @RequirePermission(FORECAST_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-20 · Totales por período y acumulados',
    description:
      'Mismos filtros que `/forecast/rows`, sobre todas las filas (no la página; `page`, `pageSize`, `sortBy` y `sortOrder` se ignoran). ' +
      'Solo toneladas; cantidades agrupadas por unidad; líneas sin conversión contadas aparte (RN-03.74, RN-03.31).',
  })
  @ApiOkResponse({ type: ForecastTotalsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: QUERY_400 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: QUERY_422 })
  async totals(@Query() query: ForecastQueryDto, @Req() request: AppRequest): Promise<ForecastTotalsDto> {
    const actor = await this.actors.fromRequest(request);
    return toForecastTotalsDto(await this.forecast.totals(actor, toQuery(query)));
  }

  @Put('lines')
  @RequirePermission(FORECAST_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-20 · Guarda celdas del forecast en lote (upsert)',
    description:
      'Todas las líneas o ninguna; *upsert* por (proyecto, producto, año, mes), nunca una segunda fila ni `DELETE` (cantidad 0 conserva la línea). ' +
      'Tonelaje con la regla vigente PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL (sin regla → "sin conversión"). Las líneas iguales a lo guardado cuentan como ' +
      '`unchanged` (repetir el cuerpo es idempotente). Audita `crm.forecast_line.created|updated` por línea cambiada y actualiza `lastActivityAt` de los proyectos con cambios.',
  })
  @ApiOkResponse({ type: ForecastSaveResultDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: forma del lote (1 … 500 líneas; `details[].field` = `lines.<i>.<campo>`)' })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'PERMISSION_DENIED: sin `forecast.editar`, o proyecto ajeno fuera del alcance de `forecast.administrar` · ' +
      'FIELD_NOT_EDITABLE: `ownerId` distinto del asesor del proyecto sin `forecast.administrar` (`details[]`: `{ field: "lines[i].ownerId", requiredPermission: "forecast.administrar" }`)',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: proyecto inexistente, eliminado o fuera del alcance de `forecast.ver`' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'FORECAST_LINE_STALE: `expectedUpdatedAt` distinto del actual; nada se guarda (`details[]`: `{ index, lineId, updatedAt }` de cada línea en conflicto)',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'INVALID_QUANTITY · FORECAST_PERIOD_OUT_OF_WINDOW (con `period`) · FORECAST_DUPLICATE_IN_BATCH (con `duplicateOfIndex`) · PRODUCT_NOT_ASSOCIATED · ' +
      'UNKNOWN_REFERENCE (unidad) · INVALID_OWNER. `details[]`: `{ field: "lines[i].<campo>", code, message, index }`, todas las incidencias del paso',
  })
  async save(@Body() dto: SaveForecastLinesDto, @Req() request: AppRequest): Promise<ForecastSaveResultDto> {
    const actor = await this.actors.fromRequest(request);
    const result = await this.forecast.save(
      actor,
      dto.lines.map((line) => ({
        projectId: line.projectId,
        productId: line.productId,
        year: line.year,
        month: line.month,
        quantity: line.quantity,
        ...(line.unitId !== undefined ? { unitId: line.unitId } : {}),
        ...(line.ownerId !== undefined ? { ownerId: line.ownerId } : {}),
        ...(line.notes !== undefined ? { notes: line.notes } : {}),
        ...(line.expectedUpdatedAt !== undefined ? { expectedUpdatedAt: line.expectedUpdatedAt } : {}),
      })),
    );
    return toForecastSaveResultDto(result);
  }
}
