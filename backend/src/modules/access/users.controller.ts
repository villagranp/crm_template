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
import { ADMIN_ONLY_FORBIDDEN_DOC } from './admin-only';
import { ReplaceAssignmentsDto, ReplaceIdsDto } from './dto/assignment.dto';
import {
  CreateUserDto,
  ExportUsersQueryDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UserAccessResponseDto,
  UserDetailResponseDto,
  UserListItemDto,
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
  @ApiOperation({
    summary: 'Lista de usuarios con filtros, orden y paginación',
    description:
      '`search` busca en nombre, correo y código de colaborador. Filtros: `status`, `roleCode`, `teamId`, `countryId`, `pendingAccess` (`true`: solo cuentas `ACTIVE` sin ningún rol vigente, p. ej. las dadas de alta automáticamente con Entra ID, ADR-027). Cada fila trae `employeeCode`, `country` (`null` si no tiene) y `pendingAccess` (calculado en el servidor).',
  })
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
      employeeCode: item.employeeCode,
      country: item.country,
      lastLoginAt: item.lastLoginAt,
      createdAt: item.createdAt,
      pendingAccess: item.pendingAccess,
    }));

    return PaginatedResponseDto.of(items, query.page, query.pageSize, result.totalItems);
  }

  // Declarada antes de `:id` para que "export" no se interprete como id.
  @Get('export')
  @RequirePermission('usuarios.exportar')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporta los usuarios filtrados a CSV (D13)',
    description: `Mismos filtros que la lista (incluidos \`countryId\` y \`pendingAccess\`). Columnas: Código de colaborador, Correo, Nombre, País, Puesto, Estado, Roles, Equipos, Último acceso, Alta. Como mucho ${MAX_EXPORT_ROWS} filas; si se alcanza el tope responde ${EXPORT_TRUNCATED_HEADER}: true. Cada exportación queda en la bitácora como \`user.exported\`.`,
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
  @ApiOperation({ summary: 'Detalle del usuario con código de colaborador, país, roles, equipos y asignaciones directas' })
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
      'Nace INVITED. Si AUTH_DEFAULT_PASSWORD está configurada, recibe esa contraseña con cambio obligatorio en el primer acceso; si no, nace sin credencial. ' +
      'Enviar `teamIds` no vacío exige además el permiso `equipos.editar` (el mismo que asignar miembros a un equipo); sin él responde 403 `PERMISSION_DENIED` con `details[].requiredPermission = "equipos.editar"`. ' +
      'El primer equipo de la lista queda como equipo principal. ' +
      'ADR-020 y su addendum de 2026-10-10: un actor sin el rol `administrador` sólo puede asignar roles que no conceden ningún permiso (hoy, `usuario`), sin `countryId` y sin `teamIds`; en otro caso responde 403 `ADMIN_ONLY`. ' +
      '`employeeCode` se guarda recortado y en mayúsculas y es único (409). Con un rol comercial (concede algún permiso del CRM; no cuenta `administrador`) son obligatorios `employeeCode` y `countryId`: 422 `CRM_PROFILE_INCOMPLETE` (D-07.3).',
  })
  @ApiCreatedResponse({
    type: UserListItemDto,
    description: 'El usuario creado, con la misma forma que un elemento de `GET /users` (incluye `employeeCode`, `country`, `lastLoginAt`, `createdAt` y `pendingAccess`).',
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'PERMISSION_DENIED: falta `usuarios.crear`, o `equipos.editar` cuando se envían `teamIds` · ADMIN_ONLY: un no administrador asigna un rol que concede permisos, fija `countryId` o envía `teamIds` (ADR-020, RN-07.5, RN-07.10)',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'RESOURCE_CONFLICT: correo ya registrado, o código de colaborador repetido (`details[].field = "employeeCode"`)',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'UNKNOWN_REFERENCE: rol inexistente o inactivo, equipo inexistente o eliminado, o país inexistente (`issue: "not_found"`) o inactivo (`issue: "inactive"`) · CRM_PROFILE_INCOMPLETE: rol comercial sin código o sin país (`details[].field`)',
  })
  async create(
    @Body() dto: CreateUserDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserListItemDto> {
    const user = await this.usersService.create(dto, await this.accessService.resolveActor(request));
    const access = await this.accessService.getEffectiveAccess(user.id);

    response.setHeader('Location', `/api/v1/users/${user.id}`);
    // Mapeo explícito, con la misma forma que un elemento de `GET /users`.
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      jobTitle: user.jobTitle,
      status: user.status,
      roles: access.roles,
      teams: user.teams,
      employeeCode: user.employeeCode,
      country: user.country,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      pendingAccess: user.pendingAccess,
    };
  }

  @Patch(':id')
  @RequirePermission('usuarios.editar')
  @ApiOperation({
    summary: 'Actualiza los datos de un usuario',
    description:
      'El estado no se cambia aquí: usa /suspend y /reactivate. Enviar `status` responde 400. Si el usuario tiene el rol `administrador`, sólo otro administrador puede editarlo (ADR-020): 403 ADMIN_ONLY. ' +
      'Cambiar `countryId` (fijarlo, cambiarlo o quitarlo) también es exclusivo del administrador (RN-07.5); enviar el país actual no es un cambio. ' +
      '`employeeCode` lo puede editar quien tenga `usuarios.editar`. A un usuario con rol comercial no se le pueden vaciar `employeeCode` ni `countryId` (422 `CRM_PROFILE_INCOMPLETE`).',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: `${ADMIN_ONLY_FORBIDDEN_DOC} · ADMIN_ONLY también si un no administrador cambia \`countryId\` (RN-07.5)`,
  })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'RESOURCE_CONFLICT: código de colaborador repetido (`details[].field = "employeeCode"`)',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'UNKNOWN_REFERENCE: país inexistente o inactivo · CRM_PROFILE_INCOMPLETE: vaciaría el código o el país de un usuario comercial',
  })
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
    description:
      'Nadie se suspende a sí mismo y siempre queda un administrador activo con `usuarios.editar` y `roles.editar` efectivos. La comprobación y el cambio son atómicos. Suspender a un administrador es exclusivo de otro administrador (ADR-020): 403 ADMIN_ONLY.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
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
  @ApiOperation({
    summary: 'Reactiva al usuario: ACTIVE, o INVITED si nunca fijó su contraseña (D4)',
    description:
      'Si estaba LOCKED, además limpia el bloqueo de su credencial (intentos fallidos y bloqueo temporal). Reactivar a un administrador es exclusivo de otro administrador (ADR-020): 403 ADMIN_ONLY.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INVALID_STATUS_TRANSITION: no está suspendido ni bloqueado' })
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
  @ApiOperation({
    summary: 'Reemplaza los roles del usuario (D3)',
    description:
      'Exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso. SELF_LOCKOUT si el actor se quita su rol de administrador o su `usuarios.editar` efectivo; LAST_ADMIN si no quedaría ningún administrador activo con `usuarios.editar` y `roles.editar` efectivos. ' +
      'Si algún rol resultante es comercial (concede algún permiso del CRM; no cuenta `administrador`) y al usuario le falta el código de colaborador o el país: 422 CRM_PROFILE_INCOMPLETE (D-07.3).',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Lista vacía o inválida' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SELF_LOCKOUT o LAST_ADMIN' })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'UNKNOWN_REFERENCE · CRM_PROFILE_INCOMPLETE (`details[].field`: `employeeCode`, `countryId`)',
  })
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
  @ApiOperation({
    summary: 'Reemplaza las excepciones directas de permisos (GRANT/DENY, razón ≥ 10)',
    description:
      'Exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso. DENY gana sobre los roles, así que también aplica D3: SELF_LOCKOUT si el actor se deniega `usuarios.editar`; LAST_ADMIN si no quedaría ningún administrador activo con `usuarios.editar` y `roles.editar` efectivos.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Datos inválidos, `targetId` repetido o más de 200 asignaciones' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SELF_LOCKOUT o LAST_ADMIN' })
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
  @ApiOperation({
    summary: 'Reemplaza las opciones de menú asignadas directamente al usuario (razón ≥ 10)',
    description: 'Exclusivo del administrador (ADR-020): 403 ADMIN_ONLY en otro caso.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ADMIN_ONLY_FORBIDDEN_DOC })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Datos inválidos, `targetId` repetido o más de 200 asignaciones' })
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
    employeeCode: user.employeeCode,
    country: user.country,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    teams: user.teams,
    roles: user.roles.map(({ id, code, name, isSystem, expiresAt }) => ({ id, code, name, isSystem, expiresAt })),
    pendingAccess: user.pendingAccess,
    directPermissions: user.directPermissions,
    directMenuOptions: user.directMenuOptions,
  };
}
