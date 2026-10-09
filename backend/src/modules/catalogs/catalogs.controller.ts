import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { auditContextFrom } from '@/modules/audit/audit.service';

import { CatalogsService } from './catalogs.service';
import {
  CatalogDetailResponseDto,
  CatalogItemResponseDto,
  CatalogResponseDto,
  CreateCatalogDto,
  CreateCatalogItemDto,
  ListCatalogsQueryDto,
  PaginatedCatalogsResponseDto,
  UpdateCatalogDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';
import type { CatalogDetailRecord, CatalogItemRecord, CatalogRecord } from './ports/catalogs.repository.port';

function toResponse(catalog: CatalogRecord): CatalogResponseDto {
  return {
    id: catalog.id,
    key: catalog.key,
    name: catalog.name,
    description: catalog.description,
    isSystem: catalog.isSystem,
    itemCount: catalog.itemCount,
    activeItemCount: catalog.activeItemCount,
    createdAt: catalog.createdAt.toISOString(),
    updatedAt: catalog.updatedAt.toISOString(),
  };
}

function toItemResponse(item: CatalogItemRecord): CatalogItemResponseDto {
  return {
    id: item.id,
    catalogId: item.catalogId,
    code: item.code,
    label: item.label,
    metadata: item.metadata,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toDetailResponse(catalog: CatalogDetailRecord): CatalogDetailResponseDto {
  return { ...toResponse(catalog), items: catalog.items.map(toItemResponse) };
}

/**
 * Administración de catálogos (PLAN-ADMIN §3, D9). Sin lógica: valida, delega
 * en `CatalogsService` y traduce a DTO.
 */
@ApiTags('Administración · Catálogos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Get()
  @RequirePermission('catalogos.ver')
  @ApiOperation({
    summary: 'Lista paginada de catálogos',
    description: '`search` busca en clave y nombre. Orden por defecto: `name` ascendente.',
  })
  @ApiOkResponse({ type: PaginatedCatalogsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: parámetros de consulta inválidos' })
  async list(@Query() query: ListCatalogsQueryDto): Promise<PaginatedResponseDto<CatalogResponseDto>> {
    const page = await this.catalogsService.list({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
      search: query.search?.trim() || undefined,
      isSystem: query.isSystem,
    });
    return PaginatedResponseDto.of(page.items.map(toResponse), page.page, page.pageSize, page.totalItems);
  }

  @Get(':id')
  @RequirePermission('catalogos.ver')
  @ApiOperation({ summary: 'Detalle de un catálogo con todos sus elementos' })
  @ApiOkResponse({ type: CatalogDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async findById(@Param('id', ParseUUIDPipe) catalogId: string): Promise<CatalogDetailResponseDto> {
    return toDetailResponse(await this.catalogsService.findById(catalogId));
  }

  @Post()
  @RequirePermission('catalogos.crear')
  @ApiOperation({ summary: 'Alta de catálogo (nunca de sistema)', description: 'Audita `catalog.created`.' })
  @ApiCreatedResponse({ type: CatalogDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: la clave ya existe' })
  async create(@Body() dto: CreateCatalogDto, @Req() request: AppRequest): Promise<CatalogDetailResponseDto> {
    const catalog = await this.catalogsService.create(
      { key: dto.key, name: dto.name, description: dto.description ?? null },
      auditContextFrom(request),
    );
    return toDetailResponse(catalog);
  }

  @Patch(':id')
  @RequirePermission('catalogos.editar')
  @ApiOperation({
    summary: 'Actualiza un catálogo',
    description: 'Campo omitido = sin cambio. Audita `catalog.updated`.',
  })
  @ApiOkResponse({ type: CatalogDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'SYSTEM_RESOURCE_READ_ONLY: cambiar la clave de un catálogo de sistema; RESOURCE_CONFLICT: la clave ya existe',
  })
  async update(
    @Param('id', ParseUUIDPipe) catalogId: string,
    @Body() dto: UpdateCatalogDto,
    @Req() request: AppRequest,
  ): Promise<CatalogDetailResponseDto> {
    return toDetailResponse(await this.catalogsService.update(catalogId, dto, auditContextFrom(request)));
  }

  @Delete(':id')
  @RequirePermission('catalogos.eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un catálogo vacío que no sea de sistema', description: 'Audita `catalog.deleted`.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'SYSTEM_RESOURCE_READ_ONLY: es de sistema; CATALOG_NOT_EMPTY: tiene elementos (activos o no)',
  })
  async remove(@Param('id', ParseUUIDPipe) catalogId: string, @Req() request: AppRequest): Promise<void> {
    await this.catalogsService.remove(catalogId, auditContextFrom(request));
  }

  @Post(':id/items')
  @RequirePermission('catalogos.editar')
  @ApiOperation({ summary: 'Añade un elemento al catálogo', description: 'Audita `catalog_item.created`.' })
  @ApiCreatedResponse({ type: CatalogItemResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incluye `metadata` inválido)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el catálogo' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: el código ya existe en el catálogo' })
  async createItem(
    @Param('id', ParseUUIDPipe) catalogId: string,
    @Body() dto: CreateCatalogItemDto,
    @Req() request: AppRequest,
  ): Promise<CatalogItemResponseDto> {
    const item = await this.catalogsService.createItem(
      catalogId,
      {
        code: dto.code,
        label: dto.label,
        metadata: dto.metadata ?? null,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive ?? true,
      },
      auditContextFrom(request),
    );
    return toItemResponse(item);
  }

  @Patch(':id/items/:itemId')
  @RequirePermission('catalogos.editar')
  @ApiOperation({
    summary: 'Edita, reordena, activa o desactiva un elemento',
    description: '`code` es inmutable. Los elementos no se borran: se desactivan. Audita `catalog_item.updated`.',
  })
  @ApiOkResponse({ type: CatalogItemResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incluye enviar `code`)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el elemento no existe en ese catálogo' })
  async updateItem(
    @Param('id', ParseUUIDPipe) catalogId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCatalogItemDto,
    @Req() request: AppRequest,
  ): Promise<CatalogItemResponseDto> {
    return toItemResponse(await this.catalogsService.updateItem(catalogId, itemId, dto, auditContextFrom(request)));
  }
}
