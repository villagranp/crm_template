import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
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
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import { ProjectProductsQueryDto } from './dto/project-query.dto';
import { CreateProjectProductDto, ProjectProductDto, ProjectProductsDto, UpdateProjectProductDto } from './dto/project-subresources.dto';
import { PROJECT_PERMISSIONS } from './project-constants';
import { ProjectProductsService } from './project-products.service';
import { toProjectProductDto, toProjectProductsDto } from './project.mapper';
import { PROJECT_NOT_FOUND, PROJECT_UUID_400 } from './projects.controller';

const EDIT_403 = 'PERMISSION_DENIED: sin `proyectos.editar`, o proyecto ajeno fuera del alcance de `proyectos.administrar`';
const WRITE_422 =
  'PRODUCT_INACTIVE · UNKNOWN_REFERENCE (producto o unidad) · OPPORTUNITY_NOT_IN_PROJECT · INVALID_QUANTITY · INVALID_CATALOG_VALUE (estado). ' +
  '`details[]`: `{ field, code, message }`';
const DUPLICATE_409 = 'PROJECT_PRODUCT_DUPLICATE (`details[0]`: `{ field: "productId", projectProductId, productId, opportunityId }`)';
const CHILD_NOT_FOUND = `${PROJECT_NOT_FOUND}; o asociación inexistente, eliminada o de otro proyecto`;

/**
 * Productos asociados al proyecto (03 F-19). El tonelaje lo calcula el backend con la
 * regla vigente PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL (sin regla → "sin
 * conversión"); nunca hay tonelaje manual en una línea (DM-24).
 */
@ApiTags('Proyectos · Productos asociados')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@ApiBadRequestResponse({ type: ErrorResponseDto, description: PROJECT_UUID_400 })
@Controller('projects/:id/products')
export class ProjectProductsController {
  constructor(
    private readonly products: ProjectProductsService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get()
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-19 · Productos asociados y totales',
    description: '`totals` se calcula sobre todas las líneas no eliminadas: solo estados activos; toneladas y cantidades por unidad, nunca mezcladas (RN-03.31, RN-03.60).',
  })
  @ApiOkResponse({ type: ProjectProductsDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
  async list(@Param('id', ParseUUIDPipe) projectId: string, @Query() query: ProjectProductsQueryDto, @Req() request: AppRequest): Promise<ProjectProductsDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.products.list(actor, projectId, {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy ?? 'sku',
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
    });
    return toProjectProductsDto(view);
  }

  @Post()
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-19 · Asocia un producto',
    description:
      'Producto activo; oportunidad opcional del mismo proyecto; unidad por defecto la base del producto. Un producto no se repite activo en el mismo par ' +
      '(proyecto, oportunidad), también con oportunidad nula. Audita `crm.project_product.created` (`metadata.projectId`).',
  })
  @ApiCreatedResponse({ type: ProjectProductDto, description: 'Con cabecera `Location`' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: DUPLICATE_409 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: WRITE_422 })
  async create(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateProjectProductDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProjectProductDto> {
    const actor = await this.actors.fromRequest(request);
    const created = await this.products.create(actor, projectId, dto);
    response.setHeader('Location', `/api/v1/projects/${projectId}/products/${created.id}`);
    return toProjectProductDto(created);
  }

  @Patch(':projectProductId')
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-19 · Edita una asociación',
    description: 'Recalcula el tonelaje con la regla vigente, audita la diferencia (`crm.project_product.updated`) y actualiza `lastActivityAt`. El maestro no cambia.',
  })
  @ApiOkResponse({ type: ProjectProductDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: CHILD_NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: DUPLICATE_409 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: WRITE_422 })
  async update(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Param('projectProductId', ParseUUIDPipe) projectProductId: string,
    @Body() dto: UpdateProjectProductDto,
    @Req() request: AppRequest,
  ): Promise<ProjectProductDto> {
    const actor = await this.actors.fromRequest(request);
    return toProjectProductDto(await this.products.update(actor, projectId, projectProductId, dto));
  }

  @Delete(':projectProductId')
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'F-19 · Quita una asociación (lógico)', description: 'Audita `crm.project_product.deleted`.' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: CHILD_NOT_FOUND })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'PRODUCT_HAS_FORECAST: forecast > 0 en la ventana vigente y ninguna otra asociación activa del producto (`details[0]`: `{ productId, periods: ["AAAA-MM"] }`)',
  })
  async remove(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Param('projectProductId', ParseUUIDPipe) projectProductId: string,
    @Req() request: AppRequest,
  ): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.products.remove(actor, projectId, projectProductId);
  }
}
