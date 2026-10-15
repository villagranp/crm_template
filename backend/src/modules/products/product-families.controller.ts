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

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';

import {
  CreateProductFamilyDto,
  PaginatedProductFamiliesDto,
  ProductFamiliesQueryDto,
  ProductFamilyDetailDto,
  UpdateProductFamilyDto,
} from './dto/product-masters.dto';
import { MASTER_UUID_400, masterActorFrom, PRODUCT_CONFIGURE_PERMISSION, PRODUCT_VIEW_PERMISSION, toFamilyDto } from './product-masters.mappers';
import { ProductMastersService } from './product-masters.service';

/**
 * Familias de producto (03 F.4 lectura; 07 F.7 mantenimiento, D-07.9). Sin `DELETE`:
 * se desactiva con `PATCH isActive`. `code` es inmutable.
 */
@ApiTags('Maestros comerciales · Familias de producto')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('product-families')
export class ProductFamiliesController {
  constructor(
    private readonly masters: ProductMastersService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'F-19 / F-46 · Familias de producto',
    description:
      'Paginada (`pageSize` por defecto 100). `isActive` por defecto `true` (los formularios), `all` = todas; `search` en código o nombre. ' +
      'Sin `sortBy`: `sortOrder` y nombre.',
  })
  @ApiOkResponse({ type: PaginatedProductFamiliesDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (filtros, `pageSize` > 100, `sortBy` no admitido)' })
  async search(@Query() query: ProductFamiliesQueryDto): Promise<PaginatedResponseDto<ProductFamilyDetailDto>> {
    const page = await this.masters.searchFamilies(query);
    return PaginatedResponseDto.of(page.items.map(toFamilyDto), page.page, page.pageSize, page.totalItems);
  }

  @Get(':id')
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({ summary: 'F-46 · Detalle de una familia (activa o no)' })
  @ApiOkResponse({ type: ProductFamilyDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ProductFamilyDetailDto> {
    return toFamilyDto(await this.masters.findFamily(id));
  }

  @Post()
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'F-46 · Alta de familia', description: '`code` único (en mayúsculas). Audita `crm.product_family.created`.' })
  @ApiCreatedResponse({ type: ProductFamilyDetailDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: `details[0].field = "code"`' })
  async create(
    @Body() dto: CreateProductFamilyDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductFamilyDetailDto> {
    const record = await this.masters.createFamily(dto, await masterActorFrom(request, this.access));
    response.setHeader('Location', `/api/v1/product-families/${record.id}`);
    return toFamilyDto(record);
  }

  @Patch(':id')
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @ApiOperation({
    summary: 'F-46 · Edición, activación y desactivación de familia',
    description: '`code` no es editable (`400`). Audita `crm.product_family.updated` con antes/después; sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: ProductFamilyDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductFamilyDto, @Req() request: AppRequest): Promise<ProductFamilyDetailDto> {
    return toFamilyDto(await this.masters.updateFamily(id, dto, await masterActorFrom(request, this.access)));
  }
}
