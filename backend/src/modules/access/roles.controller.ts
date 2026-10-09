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
  Query,
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
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { AccessService } from './access.service';
import { ADMIN_ONLY_FORBIDDEN_DOC } from './admin-only';
import { ReplaceIdsDto } from './dto/assignment.dto';
import {
  CreateRoleDto,
  DuplicateRoleDto,
  ListRolesQueryDto,
  PermissionResponseDto,
  RoleResponseDto,
  UpdateRoleDto,
} from './dto/role.dto';
import { RolesService } from './roles.service';

const SYSTEM_READ_ONLY = 'SYSTEM_RESOURCE_READ_ONLY: el rol es de sistema (D1)';

@ApiTags('Administración · Roles')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso del endpoint' })
@Controller()
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly accessService: AccessService,
  ) {}

  @Get('roles')
  @RequirePermission('roles.ver')
  @ApiOperation({ summary: 'Roles con sus permisos y opciones asignadas, paginados' })
  @ApiOkResponse({ description: '`{ data: RoleResponseDto[], pagination }`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async list(@Query() query: ListRolesQueryDto): Promise<PaginatedResponseDto<RoleResponseDto>> {
    const result = await this.rolesService.list(query);
    return PaginatedResponseDto.of(result.items, query.page, query.pageSize, result.totalItems);
  }

  @Get('roles/:id')
  @RequirePermission('roles.ver')
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findById(@Param('id', ParseUUIDPipe) roleId: string): Promise<RoleResponseDto> {
    return this.rolesService.findById(roleId);
  }

  @Post('roles')
  @RequirePermission('roles.crear')
  @ApiOperation({ summary: 'Crea un rol propio (D2)', description: 'Exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso.' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: código en uso' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE' })
  async create(
    @Body() dto: CreateRoleDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RoleResponseDto> {
    const role = await this.rolesService.create(dto, await this.accessService.resolveActor(request));
    response.setHeader('Location', `/api/v1/roles/${role.id}`);
    return role;
  }

  @Post('roles/:id/duplicate')
  @RequirePermission('roles.crear')
  @ApiOperation({
    summary: 'Crea una copia editable del rol, también de uno de sistema (D1)',
    description: 'Exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: código en uso' })
  async duplicate(
    @Param('id', ParseUUIDPipe) roleId: string,
    @Body() dto: DuplicateRoleDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RoleResponseDto> {
    const role = await this.rolesService.duplicate(roleId, dto, await this.accessService.resolveActor(request));
    response.setHeader('Location', `/api/v1/roles/${role.id}`);
    return role;
  }

  @Patch('roles/:id')
  @RequirePermission('roles.editar')
  @ApiOperation({
    summary: 'Edita nombre, descripción, alcance o estado de un rol propio',
    description:
      'Cambiar `dataScope` o `isActive` (activar o desactivar el rol cambia lo que concede) es exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso. Nombre y descripción no.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: SYSTEM_READ_ONLY })
  async update(
    @Param('id', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: AppRequest,
  ): Promise<RoleResponseDto> {
    return this.rolesService.update(roleId, dto, await this.accessService.resolveActor(request));
  }

  @Delete('roles/:id')
  @RequirePermission('roles.eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina (borrado lógico) un rol propio sin usuarios (D2)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: `${SYSTEM_READ_ONLY} · ROLE_IN_USE` })
  async delete(@Param('id', ParseUUIDPipe) roleId: string, @Req() request: AppRequest): Promise<void> {
    await this.rolesService.delete(roleId, await this.accessService.resolveActor(request));
  }

  @Put('roles/:id/permissions')
  @RequirePermission('roles.editar')
  @ApiOperation({
    summary: 'Reemplaza el conjunto de permisos del rol',
    description: 'Exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: SYSTEM_READ_ONLY })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE' })
  async replacePermissions(
    @Param('id', ParseUUIDPipe) roleId: string,
    @Body() dto: ReplaceIdsDto,
    @Req() request: AppRequest,
  ): Promise<RoleResponseDto> {
    return this.rolesService.replacePermissions(roleId, dto.ids, await this.accessService.resolveActor(request));
  }

  @Put('roles/:id/menu-options')
  @RequirePermission('opciones.configurar')
  @ApiOperation({
    summary: 'Reemplaza las opciones de menú que concede el rol',
    description: 'Exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: SYSTEM_READ_ONLY })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE' })
  async replaceMenuOptions(
    @Param('id', ParseUUIDPipe) roleId: string,
    @Body() dto: ReplaceIdsDto,
    @Req() request: AppRequest,
  ): Promise<RoleResponseDto> {
    return this.rolesService.replaceMenuOptions(roleId, dto.ids, await this.accessService.resolveActor(request));
  }

  @Get('permissions')
  @RequirePermission('permisos.ver')
  @ApiOperation({ summary: 'Catálogo completo de permisos del sistema (no paginado: es un catálogo cerrado)' })
  @ApiOkResponse({ type: [PermissionResponseDto] })
  listPermissions(): Promise<PermissionResponseDto[]> {
    return this.rolesService.listPermissions();
  }
}
