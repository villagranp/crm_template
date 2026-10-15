import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';
import { auditContextFrom } from '@/modules/audit/audit.service';

import {
  CreateExchangeRateDto,
  CurrencyListResponseDto,
  ExchangeRateResponseDto,
  ExchangeRatesQueryDto,
  PaginatedExchangeRatesDto,
  UpdateExchangeRateDto,
} from './dto/exchange-rate.dto';
import { ExchangeRatesService, type MaintenanceActor } from './exchange-rates.service';
import type { ExchangeRateDetailRecord } from './ports/exchange-rate.repository.port';

/** Consultar tipos de cambio y monedas (07 E.5, H.1). */
export const EXCHANGE_RATE_VIEW_PERMISSION = 'parametros.ver';
/** Registrar y corregir tipos de cambio (07 RN-07.44). */
export const EXCHANGE_RATE_CONFIGURE_PERMISSION = 'parametros.configurar';

const INVALID_RATE_422 =
  'INVALID_EXCHANGE_RATE: `details[0].issue` ∈ `base_currency` (USD), `unknown_currency`, `inactive_currency`, `non_positive_rate`';

export function toExchangeRateDto(record: ExchangeRateDetailRecord): ExchangeRateResponseDto {
  return {
    id: record.id,
    currencyCode: record.currencyCode,
    effectiveDate: record.effectiveDate,
    ratePerUsd: record.ratePerUsd,
    source: record.source,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy ? { id: record.updatedBy.id, displayName: record.updatedBy.displayName } : null,
  };
}

/**
 * Tipos de cambio (07 F.7, RN-07.44; extensión de alcance aprobada de F-46, DM-36 /
 * ADR-024). Sin `DELETE` ni `isActive`: una tasa se corrige o se añade otra fecha.
 * Las lecturas que necesitan otros módulos van por `ExchangeRateReader`, no por aquí.
 */
@ApiTags('Administración · Tipos de cambio')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller()
export class ExchangeRatesController {
  constructor(
    private readonly exchangeRates: ExchangeRatesService,
    private readonly access: AccessService,
  ) {}

  @Get('exchange-rates')
  @RequirePermission(EXCHANGE_RATE_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'F-46 · Lista paginada de tipos de cambio',
    description:
      'Filtros `currencyCode` (ISO 4217) y rango `from`/`to` sobre `effectiveDate` (incluidos, `from` ≤ `to`). ' +
      'Orden por `sortBy` (lista blanca; defecto `effectiveDate` descendente).',
  })
  @ApiOkResponse({ type: PaginatedExchangeRatesDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (filtros, `from` > `to`, `pageSize` > 100, `sortBy` no admitido)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta parametros.ver' })
  async search(@Query() query: ExchangeRatesQueryDto): Promise<PaginatedResponseDto<ExchangeRateResponseDto>> {
    const page = await this.exchangeRates.search({
      page: query.page,
      pageSize: query.pageSize,
      currencyCode: query.currencyCode,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return PaginatedResponseDto.of(page.items.map(toExchangeRateDto), page.page, page.pageSize, page.totalItems);
  }

  @Post('exchange-rates')
  @RequirePermission(EXCHANGE_RATE_CONFIGURE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'F-46 · Registra un tipo de cambio para una fecha de vigencia',
    description:
      'Una tasa por (moneda, fecha). No recalcula oportunidades ya guardadas (guardan la foto de la tasa). Audita `crm.exchange_rate.created`.',
  })
  @ApiCreatedResponse({ type: ExchangeRateResponseDto, description: 'El tipo de cambio creado, con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (formato, `ratePerUsd` no es cadena decimal, campos extra)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta parametros.configurar' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'EXCHANGE_RATE_DUPLICATE: ya hay una tasa para esa moneda y fecha' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: INVALID_RATE_422 })
  async create(
    @Body() dto: CreateExchangeRateDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ExchangeRateResponseDto> {
    const record = await this.exchangeRates.create(
      { currencyCode: dto.currencyCode, effectiveDate: dto.effectiveDate, ratePerUsd: dto.ratePerUsd, source: dto.source, notes: dto.notes },
      await this.actorOf(request),
    );
    response.setHeader('Location', `/api/v1/exchange-rates/${record.id}`);
    return toExchangeRateDto(record);
  }

  @Patch('exchange-rates/:id')
  @RequirePermission(EXCHANGE_RATE_CONFIGURE_PERMISSION)
  @ApiOperation({
    summary: 'F-46 · Corrige tasa, fuente o notas',
    description:
      '`currencyCode` y `effectiveDate` son inmutables: enviarlos es `400` (para otra fecha se registra una fila nueva). ' +
      'No recalcula oportunidades. Audita `crm.exchange_rate.updated` con antes/después; sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: ExchangeRateResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'BAD_REQUEST: id no UUID · VALIDATION_FAILED: campo no admitido (`effectiveDate`, `currencyCode`) o formato' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta parametros.configurar' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_EXCHANGE_RATE (`non_positive_rate`)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExchangeRateDto,
    @Req() request: AppRequest,
  ): Promise<ExchangeRateResponseDto> {
    const record = await this.exchangeRates.update(
      id,
      { ratePerUsd: dto.ratePerUsd, source: dto.source, notes: dto.notes },
      await this.actorOf(request),
    );
    return toExchangeRateDto(record);
  }

  @Get('currencies')
  @RequirePermission(EXCHANGE_RATE_VIEW_PERMISSION)
  @ApiOperation({ summary: 'F-46 · Monedas (solo lectura)', description: 'Sembradas (D-07.13); no hay escritura. Todas, por código, sin paginar.' })
  @ApiOkResponse({ type: CurrencyListResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta parametros.ver' })
  async currencies(): Promise<CurrencyListResponseDto> {
    const currencies = await this.exchangeRates.listCurrencies();
    return {
      data: currencies.map((currency) => ({
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        decimals: currency.decimals,
        isActive: currency.isActive,
      })),
    };
  }

  private async actorOf(request: AppRequest): Promise<MaintenanceActor> {
    return {
      userId: request.principal ? await this.access.findUserIdForPrincipal(request.principal) : null,
      audit: auditContextFrom(request),
    };
  }
}
