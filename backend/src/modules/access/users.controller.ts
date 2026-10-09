import {
  Body,
  Controller,
  Get,
  Header,
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
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { EXPORT_TRUNCATED_HEADER, MAX_EXPORT_ROWS } from '@/common/csv';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { AccessService, type MenuModuleView } from './access.service';
import { ReplaceAssignmentsDto, ReplaceIdsDto } from './dto/assignment.dto';
import {
  CreateUserDto,
  ExportUsersQueryDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UserAccessResponseDto,
  UserDetailResponseDto,
  UserListItemDto,
  UserResponseDto,
  UserStatusChangeDto,
} from './dto/user.dto';
import { MenuModuleDto } from './dto/menu.dto';
import type { UserDetailRecord } from './ports/access.repository.port';
import { UsersService } from './users.service';

/** Cabecera que avisa de que la exportación se truncó (misma que la de auditoría). */

/**
 * Administración de usuarios y de sus asignaciones.
 *
 * Todo endpoint declara su permiso. Las asignaciones (roles, permisos directos
 * y opciones directas) se reemplazan en bloque con PUT: es idempotente y evita
 * el estado intermedio de un "quitar" y un "poner" separados. El estado sólo
 * cambia con suspend/reactivate (D3, D4).
 */
@ApiTags('Administración · Usuarios')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso del endpoint' })
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accessService: AccessService,
  ) {}

  @Get()
  @RequirePermission('usuarios.ver')
  @ApiOperation({ summary: 'Lista de usuarios con filtros, orden y paginación' })
  @ApiOkResponse({ description: '`{ data: UserListItemDto[], pagination }`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async list(@Query() query: ListUsersQueryDto): Promise<PaginatedResponseDto<UserListItemDto>> {
    const result = await this.usersService.list(query);

    const items: UserListItemDto[] = result.items.map((item) => ({
      id: item.id,
      email: item.email,
      displayName: item.displayName,
      jobTitle: item.jobTitle,
      status: item.status,
      roles: item.roles,
      teams: item.teams,
      lastLoginAt: item.lastLoginAt,
      createdAt: item.createdAt,
    }));

    return PaginatedResponseDto.of(items, query.page, query.pageSize, result.totalItems);
  }

  // Declarada antes de `:id` para que "export" no se interprete como id.
  @Get('export')
  @RequirePermission('usuarios.exportar')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporta los usuarios filtrados a CSV (D13)',
    description: `Mismos filtros que la lista. Como mucho ${MAX_EXPORT_ROWS} filas; si se alcanza el tope responde ${EXPORT_TRUNCATED_HEADER}: true. Cada exportación queda en la bitácora como \`user.exported\`.`,
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV (UTF-8 con BOM)', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async export(
    @Query() query: ExportUsersQueryDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const result = await this.usersService.export(query, await this.accessService.resolveActor(request));

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.setHeader(EXPORT_TRUNCATED_HEADER, String(result.truncated));
    return result.csv;
  }

  @Get(':id')
  @RequirePermission('usuarios.ver')
  @ApiOperation({ summary: 'Detalle del usuario con roles, equipos y asignaciones directas' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async findById(@Param('id', ParseUUIDPipe) userId: string): Promise<UserDetailResponseDto> {
    return toDetailDto(await this.usersService.getDetail(userId));
  }

  @Post()
  @RequirePermission('usuarios.crear')
  @ApiOperation({
    summary: 'Alta de usuario',
    description:
      'Nace INVITED. Si AUTH_DEFAULT_PASSWORD está configurada, recibe esa contraseña con cambio obligatorio en el primer acceso; si no, nace sin credencial.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: correo ya registrado' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE: rol inexistente' })
  async create(
    @Body() dto: CreateUserDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.create(dto, await this.accessService.resolveActor(request));
    const access = await this.accessService.getEffectiveAccess(user.id);

    response.setHeader('Location', `/api/v1/users/${user.id}`);
    return { ...user, roles: access.roles };
  }

  @Patch(':id')
  @RequirePermission('usuarios.editar')
  @ApiOperation({
    summary: 'Actualiza los datos de un usuario',
    description: 'El estado no se cambia aquí: usa /suspend y /reactivate. Enviar `status` responde 400.',
  })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AppRequest,
  ): Promise<UserDetailResponseDto> {
    return toDetailDto(await this.usersService.update(userId, dto, await this.accessService.resolveActor(request)));
  }

  @Post(':id/suspend')
  @RequirePermission('usuarios.editar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspende al usuario y cierra todas sus sesiones (D3, D4)',
    description: 'Nadie se suspende a sí mismo y siempre queda un administrador activo.',
  })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'SELF_LOCKOUT, LAST_ADMIN o INVALID_STATUS_TRANSITION (ya suspendido)',
  })
  async suspend(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UserStatusChangeDto,
    @Req() request: AppRequest,
  ): Promise<UserDetailResponseDto> {
    const actor = await this.accessService.resolveActor(request);
    return toDetailDto(await this.usersService.suspend(userId, dto.reason, actor));
  }

  @Post(':id/reactivate')
  @RequirePermission('usuarios.editar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactiva al usuario: ACTIVE, o INVITED si nunca fijó su contraseña (D4)' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INVALID_STATUS_TRANSITION: no está suspendido' })
  async reactivate(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UserStatusChangeDto,
    @Req() request: AppRequest,
  ): Promise<UserDetailResponseDto> {
    const actor = await this.accessService.resolveActor(request);
    return toDetailDto(await this.usersService.reactivate(userId, dto.reason, actor));
  }

  @Get(':id/access')
  @RequirePermission('usuarios.ver')
  @ApiOperation({ summary: 'Acceso efectivo de un usuario con el origen de cada permiso (D5)' })
  @ApiOkResponse({ type: UserAccessResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getAccess(@Param('id', ParseUUIDPipe) userId: string): Promise<UserAccessResponseDto> {
    return this.accessService.getEffectiveAccessWithOrigins(userId);
  }

  @Get(':id/menu')
  @RequirePermission('usuarios.ver')
  @ApiOperation({ summary: 'Menú que verá un usuario. Útil para depurar una asignación' })
  @ApiOkResponse({ type: [MenuModuleDto] })
  getMenu(@Param('id', ParseUUIDPipe) userId: string): Promise<MenuModuleView[]> {
    return this.accessService.getMenu(userId);
  }

  @Put(':id/roles')
  @RequirePermission('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplaza los roles del usuario (D3)' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Lista vacía o inválida' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SELF_LOCKOUT o LAST_ADMIN' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE' })
  async replaceRoles(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceIdsDto,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.usersService.replaceRoles(userId, dto.ids, await this.accessService.resolveActor(request));
  }

  @Put(':id/permissions')
  @RequirePermission('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplaza las excepciones directas de permisos (GRANT/DENY, razón ≥ 10)' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE' })
  async replacePermissions(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceAssignmentsDto,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.usersService.replacePermissions(userId, dto.assignments, await this.accessService.resolveActor(request));
  }

  @Put(':id/menu-options')
  @RequirePermission('opciones.configurar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplaza las opciones de menú asignadas directamente al usuario (razón ≥ 10)' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE' })
  async replaceMenuOptions(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceAssignmentsDto,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.usersService.replaceMenuOptions(userId, dto.assignments, await this.accessService.resolveActor(request));
  }
}

/** Mapeo explícito: el contrato no cambia porque cambie el registro del puerto. */
function toDetailDto(user: UserDetailRecord): UserDetailResponseDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    jobTitle: user.jobTitle,
    phone: user.phone,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    teams: user.teams,
    roles: user.roles,
    directPermissions: user.directPermissions,
    directMenuOptions: user.directMenuOptions,
  };
}
