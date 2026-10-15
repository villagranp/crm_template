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
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequireAnyPermission } from '@/common/decorators/require-any-permission.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';

import {
  CreateUnitOfMeasureDto,
  PaginatedUnitsOfMeasureDto,
  UnitOfMeasureDetailDto,
  UnitsOfMeasureQueryDto,
  UpdateUnitOfMeasureDto,
} from './dto/product-masters.dto';
import {
  MASTER_UUID_400,
  masterActorFrom,
  PRODUCT_CONFIGURE_PERMISSION,
  PRODUCT_VIEW_PERMISSION,
  PROJECT_VIEW_PERMISSION,
  toUnitDto,
} from './product-masters.mappers';
import { ProductMastersService } from './product-masters.service';

/**
 * Unidades de medida (03 F-15 lectura; 07 F.7 mantenimiento, RN-07.37). Sin `DELETE`:
 * se desactiva con `PATCH isActive`. `code` es inmutable; `dimension`, una vez
 * referenciada.
 */
@ApiTags('Maestros comerciales · Unidades de medida')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('units-of-measure')
export class UnitsOfMeasureController {
  constructor(
    private readonly masters: ProductMastersService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @RequireAnyPermission(PRODUCT_VIEW_PERMISSION, PROJECT_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'F-15 / F-46 · Unidades de medida',
    description:
      'Exige `productos.ver` **o** `proyectos.ver` (`@RequireAnyPermission`): la leen Administración y los formularios de Proyectos y Forecast. ' +
      'Paginada (`pageSize` por defecto 100). `isActive` por defecto `true`, `all` = todas; `search` en código, nombre o símbolo. Sin `sortBy`: `sortOrder` y código.',
  })
  @ApiOkResponse({ type: PaginatedUnitsOfMeasureDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (filtros, `pageSize` > 100, `sortBy` no admitido)' })
  async search(@Query() query: UnitsOfMeasureQueryDto): Promise<PaginatedResponseDto<UnitOfMeasureDetailDto>> {
    const page = await this.masters.searchUnits(query);
    return PaginatedResponseDto.of(page.items.map(toUnitDto), page.page, page.pageSize, page.totalItems);
  }

  @Get(':id')
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({ summary: 'F-46 · Detalle de una unidad (activa o no)' })
  @ApiOkResponse({ type: UnitOfMeasureDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<UnitOfMeasureDetailDto> {
    return toUnitDto(await this.masters.findUnit(id));
  }

  @Post()
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'F-46 · Alta de unidad', description: '`code` único (en mayúsculas). Audita `crm.unit_of_measure.created`.' })
  @ApiCreatedResponse({ type: UnitOfMeasureDetailDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: `details[0].field = "code"`' })
  async create(
    @Body() dto: CreateUnitOfMeasureDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UnitOfMeasureDetailDto> {
    const record = await this.masters.createUnit(dto, await masterActorFrom(request, this.access));
    response.setHeader('Location', `/api/v1/units-of-measure/${record.id}`);
    return toUnitDto(record);
  }

  @Patch(':id')
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @ApiOperation({
    summary: 'F-46 · Edición, activación y desactivación de unidad',
    description:
      '`code` no es editable (`400`). `dimension` no cambia si la unidad ya la usa un producto, una regla o una línea. ' +
      'La unidad de tonelaje configurada no se desactiva. Audita `crm.unit_of_measure.updated`; sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: UnitOfMeasureDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'UNIT_DIMENSION_LOCKED (`field = dimension`) · CONVERSION_RULE_PROTECTED (`reason = tonnage_unit`: desactivar la unidad de tonelaje)',
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitOfMeasureDto, @Req() request: AppRequest): Promise<UnitOfMeasureDetailDto> {
    return toUnitDto(await this.masters.updateUnit(id, dto, await masterActorFrom(request, this.access)));
  }
}
