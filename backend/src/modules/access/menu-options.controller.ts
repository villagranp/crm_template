import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { AccessService } from './access.service';
import {
  CreateMenuOptionDto,
  MenuOptionAdminResponseDto,
  ModuleResponseDto,
  RegisteredRouteDto,
  ReorderMenuOptionsDto,
  UpdateMenuOptionDto,
} from './dto/menu-option.dto';
import { MenuOptionsService } from './menu-options.service';
import type { MenuOptionRecord } from './ports/access.repository.port';

const SHAPE_ERRORS =
  'ROUTE_NOT_REGISTERED · MENU_CYCLE · INVALID_MENU_STRUCTURE (también: ruta con parámetro `:`, D-02.12) · UNKNOWN_REFERENCE';

/**
 * Catálogo de opciones de menú y módulos (PLAN-ADMIN D6, D7).
 *
 * Es la lista completa, sin filtrar por el usuario que consulta e incluidas
 * las inactivas: la usa la pantalla de administración. No se pagina porque es
 * un árbol pequeño que la pantalla pinta entero. El menú propio de cada
 * usuario es `GET /me/menu`.
 */
@ApiTags('Administración · Opciones de menú')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso del endpoint' })
@Controller()
export class MenuOptionsController {
  constructor(
    private readonly menuOptionsService: MenuOptionsService,
    private readonly accessService: AccessService,
  ) {}

  @Get('menu-options')
  @RequirePermission('opciones.ver')
  @ApiOperation({ summary: 'Catálogo completo de opciones (activas e inactivas), por módulo y orden' })
  @ApiOkResponse({ type: [MenuOptionAdminResponseDto] })
  async list(): Promise<MenuOptionAdminResponseDto[]> {
    return (await this.menuOptionsService.list()).map(toDto);
  }

  // Antes de cualquier ruta con parámetro.
  @Get('menu-options/routes')
  @RequirePermission('opciones.ver')
  @ApiOperation({ summary: 'Rutas registradas a las que puede apuntar una opción LINK (D6); sin rutas con parámetro (D-02.12)' })
  @ApiOkResponse({ type: [RegisteredRouteDto] })
  listRoutes(): RegisteredRouteDto[] {
    return this.menuOptionsService.listRoutes().map((route) => ({ path: route.path, label: route.label }));
  }

  @Put('menu-options/order')
  @RequirePermission('opciones.editar')
  @ApiOperation({ summary: 'Cambia orden y padre de varias opciones en bloque, sin ciclos' })
  @ApiOkResponse({ type: [MenuOptionAdminResponseDto], description: 'Catálogo completo tras el cambio' })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SYSTEM_RESOURCE_READ_ONLY: mover una opción de sistema' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: SHAPE_ERRORS })
  async reorder(@Body() dto: ReorderMenuOptionsDto, @Req() request: AppRequest): Promise<MenuOptionAdminResponseDto[]> {
    const options = await this.menuOptionsService.reorder(dto, await this.accessService.resolveActor(request));
    return options.map(toDto);
  }

  @Get('menu-options/:id')
  @RequirePermission('opciones.ver')
  @ApiOkResponse({ type: MenuOptionAdminResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async findById(@Param('id', ParseUUIDPipe) menuOptionId: string): Promise<MenuOptionAdminResponseDto> {
    return toDto(await this.menuOptionsService.findById(menuOptionId));
  }

  @Post('menu-options')
  @RequirePermission('opciones.crear')
  @ApiOperation({ summary: 'Crea una opción de menú (LINK con ruta registrada, o GROUP sin ruta)' })
  @ApiCreatedResponse({ type: MenuOptionAdminResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: clave en uso' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: SHAPE_ERRORS })
  async create(
    @Body() dto: CreateMenuOptionDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MenuOptionAdminResponseDto> {
    const option = await this.menuOptionsService.create(dto, await this.accessService.resolveActor(request));
    response.setHeader('Location', `/api/v1/menu-options/${option.id}`);
    return toDto(option);
  }

  @Patch('menu-options/:id')
  @RequirePermission('opciones.editar')
  @ApiOperation({
    summary: 'Edita una opción. `key` y módulo son inmutables',
    description: 'Las de sistema sólo admiten etiqueta, descripción, icono, orden y activación (D7).',
  })
  @ApiOkResponse({ type: MenuOptionAdminResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SYSTEM_RESOURCE_READ_ONLY · HAS_CHILDREN' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: SHAPE_ERRORS })
  async update(
    @Param('id', ParseUUIDPipe) menuOptionId: string,
    @Body() dto: UpdateMenuOptionDto,
    @Req() request: AppRequest,
  ): Promise<MenuOptionAdminResponseDto> {
    return toDto(await this.menuOptionsService.update(menuOptionId, dto, await this.accessService.resolveActor(request)));
  }

  @Delete('menu-options/:id')
  @RequirePermission('opciones.eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina (borrado lógico) una opción propia sin hijas (D7)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SYSTEM_RESOURCE_READ_ONLY · HAS_CHILDREN' })
  async delete(@Param('id', ParseUUIDPipe) menuOptionId: string, @Req() request: AppRequest): Promise<void> {
    await this.menuOptionsService.delete(menuOptionId, await this.accessService.resolveActor(request));
  }

  @Get('modules')
  @RequirePermission('opciones.ver')
  @ApiOperation({ summary: 'Módulos del menú (primer nivel). Sólo lectura: llegan con su funcionalidad' })
  @ApiOkResponse({ type: [ModuleResponseDto] })
  listModules(): Promise<ModuleResponseDto[]> {
    return this.menuOptionsService.listModules();
  }
}

function toDto(option: MenuOptionRecord): MenuOptionAdminResponseDto {
  return {
    id: option.id,
    key: option.key,
    parentId: option.parentId,
    label: option.label,
    description: option.description,
    icon: option.icon,
    kind: option.kind,
    path: option.path,
    sortOrder: option.sortOrder,
    requiredPermissionId: option.requiredPermissionId,
    requiredPermissionCode: option.requiredPermissionCode,
    isPublic: option.isPublic,
    isSystem: option.isSystem,
    isActive: option.isActive,
    module: { id: option.module.id, key: option.module.key, name: option.module.name },
  };
}
