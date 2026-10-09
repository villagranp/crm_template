import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

import { AccessService, type EffectiveAccess, type MenuModuleView } from './access.service';
import { ReplaceAssignmentsDto, ReplaceIdsDto } from './dto/assignment.dto';
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { UsersService } from './users.service';

/**
 * Administración de usuarios y de sus asignaciones.
 *
 * Todo endpoint declara su permiso. Las asignaciones (roles, permisos directos
 * y opciones directas) se reemplazan en bloque con PUT: es idempotente y evita
 * el estado intermedio de un "quitar" y un "poner" separados.
 */
@ApiTags('Administración · Usuarios')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accessService: AccessService,
  ) {}

  @Get()
  @RequirePermission('usuarios.ver')
  @ApiOperation({ summary: 'Lista de usuarios con filtros y paginación' })
  async list(@Query() query: ListUsersQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const result = await this.usersService.list(query);

    const items: UserResponseDto[] = result.items.map((item) => ({
      id: item.id,
      email: item.email,
      displayName: item.displayName,
      jobTitle: item.jobTitle,
      status: item.status,
      roles: item.roles,
      teams: item.teams,
    }));

    return PaginatedResponseDto.of(items, query.page, query.pageSize, result.totalItems);
  }

  @Post()
  @RequirePermission('usuarios.crear')
  @ApiOperation({
    summary: 'Alta de usuario',
    description:
      'Nace INVITED. Si AUTH_DEFAULT_PASSWORD está configurada, recibe esa contraseña con cambio obligatorio en el primer acceso; si no, nace sin credencial.',
  })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
  ): Promise<UserResponseDto> {
    const actorId = await this.resolveActorId(principal);
    const user = await this.usersService.create(dto, actorId);

    return { ...user, roles: [] };
  }

  @Patch(':id')
  @RequirePermission('usuarios.editar')
  @ApiOperation({ summary: 'Actualiza los datos de un usuario' })
  async update(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
  ): Promise<UserResponseDto> {
    const actorId = await this.resolveActorId(principal);
    const user = await this.usersService.update(userId, dto, actorId);

    return { ...user, roles: [] };
  }

  @Get(':id/access')
  @RequirePermission('usuarios.ver')
  @ApiOperation({ summary: 'Acceso efectivo de un usuario: roles, permisos y alcance' })
  @ApiOkResponse({ description: 'Permisos ya resueltos, con las excepciones directas aplicadas' })
  getAccess(@Param('id', ParseUUIDPipe) userId: string): Promise<EffectiveAccess> {
    return this.accessService.getEffectiveAccess(userId);
  }

  @Get(':id/menu')
  @RequirePermission('usuarios.ver')
  @ApiOperation({ summary: 'Menú que verá un usuario. Útil para depurar una asignación' })
  getMenu(@Param('id', ParseUUIDPipe) userId: string): Promise<MenuModuleView[]> {
    return this.accessService.getMenu(userId);
  }

  @Put(':id/roles')
  @RequirePermission('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplaza los roles del usuario' })
  async replaceRoles(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceIdsDto,
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
  ): Promise<void> {
    await this.usersService.replaceRoles(userId, dto.ids, await this.resolveActorId(principal));
  }

  @Put(':id/permissions')
  @RequirePermission('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplaza las excepciones directas de permisos (GRANT/DENY)' })
  async replacePermissions(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceAssignmentsDto,
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
  ): Promise<void> {
    await this.usersService.replacePermissions(userId, dto.assignments, await this.resolveActorId(principal));
  }

  @Put(':id/menu-options')
  @RequirePermission('opciones.configurar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplaza las opciones de menú asignadas directamente al usuario' })
  async replaceMenuOptions(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceAssignmentsDto,
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
  ): Promise<void> {
    await this.usersService.replaceMenuOptions(userId, dto.assignments, await this.resolveActorId(principal));
  }

  /** Identificador local de quien ejecuta la acción, para la trazabilidad. */
  private async resolveActorId(principal: AuthenticatedPrincipal | undefined): Promise<string | null> {
    return principal ? this.accessService.findUserIdForPrincipal(principal) : null;
  }
}
