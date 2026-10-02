import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

import { AccessService } from './access.service';
import { PermissionResponseDto, RoleResponseDto } from './dto/role.dto';
import { ReplaceIdsDto } from './dto/assignment.dto';
import { RolesService } from './roles.service';

@ApiTags('Administración · Roles')
@Controller()
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly accessService: AccessService,
  ) {}

  @Get('roles')
  @RequirePermission('roles.ver')
  @ApiOperation({ summary: 'Roles con sus permisos y opciones asignadas' })
  @ApiOkResponse({ type: [RoleResponseDto] })
  list(): Promise<RoleResponseDto[]> {
    return this.rolesService.list();
  }

  @Get('roles/:id')
  @RequirePermission('roles.ver')
  @ApiOkResponse({ type: RoleResponseDto })
  findById(@Param('id', ParseUUIDPipe) roleId: string): Promise<RoleResponseDto> {
    return this.rolesService.findById(roleId);
  }

  @Put('roles/:id/permissions')
  @RequirePermission('roles.editar')
  @ApiOperation({ summary: 'Reemplaza el conjunto de permisos del rol' })
  async replacePermissions(
    @Param('id', ParseUUIDPipe) roleId: string,
    @Body() dto: ReplaceIdsDto,
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
  ): Promise<RoleResponseDto> {
    const actorId = principal ? await this.accessService.findUserIdForPrincipal(principal) : null;
    return this.rolesService.replacePermissions(roleId, dto.ids, actorId);
  }

  @Put('roles/:id/menu-options')
  @RequirePermission('opciones.configurar')
  @ApiOperation({ summary: 'Reemplaza las opciones de menú que concede el rol' })
  async replaceMenuOptions(
    @Param('id', ParseUUIDPipe) roleId: string,
    @Body() dto: ReplaceIdsDto,
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
  ): Promise<RoleResponseDto> {
    const actorId = principal ? await this.accessService.findUserIdForPrincipal(principal) : null;
    return this.rolesService.replaceMenuOptions(roleId, dto.ids, actorId);
  }

  @Get('permissions')
  @RequirePermission('permisos.ver')
  @ApiOperation({ summary: 'Catálogo completo de permisos del sistema' })
  @ApiOkResponse({ type: [PermissionResponseDto] })
  listPermissions(): Promise<PermissionResponseDto[]> {
    return this.rolesService.listPermissions();
  }
}
