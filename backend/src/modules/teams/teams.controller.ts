import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';

import {
  CreateTeamDto,
  ListTeamsQueryDto,
  PaginatedTeamsResponseDto,
  ReplaceTeamMembersDto,
  TeamDetailResponseDto,
  TeamResponseDto,
  UpdateTeamDto,
} from './dto/team.dto';
import type { TeamDetailRecord, TeamRecord } from './ports/teams.repository.port';
import { TeamsService } from './teams.service';

/** Texto de Swagger del 403 en las operaciones que cambian la composición de un equipo (RN-07.45). */
const TEAM_ADMIN_ONLY_DOC =
  'PERMISSION_DENIED: falta el permiso del endpoint · ADMIN_ONLY: la operación cambia la composición del equipo (miembros, responsable, jerarquía) y es exclusiva de un usuario con el rol `administrador` vigente (addendum de 2026-10-10 a ADR-020)';

function toResponse(team: TeamRecord): TeamResponseDto {
  return {
    id: team.id,
    code: team.code,
    name: team.name,
    description: team.description,
    parentId: team.parentId,
    parentName: team.parentName,
    manager: team.manager,
    isActive: team.isActive,
    memberCount: team.memberCount,
    childCount: team.childCount,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
  };
}

function toDetailResponse(team: TeamDetailRecord): TeamDetailResponseDto {
  return {
    ...toResponse(team),
    members: team.members.map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      email: member.email,
      isPrimary: member.isPrimary,
    })),
  };
}

/**
 * Administración de equipos (PLAN-ADMIN §3, D8). Sin lógica: valida, delega
 * en `TeamsService` y traduce a DTO.
 */
@ApiTags('Administración · Equipos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly accessService: AccessService,
  ) {}

  @Get()
  @RequirePermission('equipos.ver')
  @ApiOperation({
    summary: 'Lista paginada de equipos',
    description: '`search` busca en código y nombre. Orden por defecto: `name` ascendente. Excluye los eliminados.',
  })
  @ApiOkResponse({ type: PaginatedTeamsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: parámetros de consulta inválidos' })
  async list(@Query() query: ListTeamsQueryDto): Promise<PaginatedResponseDto<TeamResponseDto>> {
    const page = await this.teamsService.list({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
      search: query.search?.trim() || undefined,
      parentId: query.parentId,
      isActive: query.isActive,
    });
    return PaginatedResponseDto.of(page.items.map(toResponse), page.page, page.pageSize, page.totalItems);
  }

  @Get(':id')
  @RequirePermission('equipos.ver')
  @ApiOperation({ summary: 'Detalle de un equipo con sus miembros' })
  @ApiOkResponse({ type: TeamDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async findById(@Param('id', ParseUUIDPipe) teamId: string): Promise<TeamDetailResponseDto> {
    return toDetailResponse(await this.teamsService.findById(teamId));
  }

  @Post()
  @RequirePermission('equipos.crear')
  @ApiOperation({
    summary: 'Alta de equipo',
    description:
      'Audita `team.created`. Fijar `managerId` o `parentId` (no nulos) es asignación de acceso y exige ser administrador (RN-07.45, addendum de ADR-020): 403 ADMIN_ONLY. Sin ellos basta `equipos.crear`.',
  })
  @ApiCreatedResponse({ type: TeamDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: TEAM_ADMIN_ONLY_DOC })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el padre o el responsable no existen' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: el código ya existe' })
  async create(@Body() dto: CreateTeamDto, @Req() request: AppRequest): Promise<TeamDetailResponseDto> {
    const team = await this.teamsService.create(
      {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        managerId: dto.managerId ?? null,
        isActive: dto.isActive ?? true,
      },
      await this.accessService.resolveActor(request),
    );
    return toDetailResponse(team);
  }

  @Patch(':id')
  @RequirePermission('equipos.editar')
  @ApiOperation({
    summary: 'Actualiza un equipo',
    description:
      'Campo omitido = sin cambio; `null` quita el valor. `code` es inmutable. Audita `team.updated`. Cambiar `managerId` o `parentId` exige ser administrador (RN-07.45): 403 ADMIN_ONLY; enviar el valor actual no es un cambio. Cambiar `isActive` de un equipo con miembros o subequipos también exige ser administrador (403 ADMIN_ONLY, mismo criterio que DELETE); en un equipo vacío basta `equipos.editar`, igual que `name` y `description`.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: TEAM_ADMIN_ONLY_DOC })
  @ApiOkResponse({ type: TeamDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incluye enviar `code`)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el equipo, el padre o el responsable' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'TEAM_CYCLE: el padre es el propio equipo o un descendiente' })
  async update(
    @Param('id', ParseUUIDPipe) teamId: string,
    @Body() dto: UpdateTeamDto,
    @Req() request: AppRequest,
  ): Promise<TeamDetailResponseDto> {
    return toDetailResponse(await this.teamsService.update(teamId, dto, await this.accessService.resolveActor(request)));
  }

  @Delete(':id')
  @RequirePermission('equipos.eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Elimina un equipo (borrado lógico)',
    description:
      'Audita `team.deleted`. Si el equipo tiene miembros o subequipos, un no administrador recibe 403 ADMIN_ONLY (RN-07.45) y el administrador 409 HAS_CHILDREN.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: TEAM_ADMIN_ONLY_DOC })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'HAS_CHILDREN: el equipo tiene miembros o subequipos (sólo lo ve el administrador)' })
  async remove(@Param('id', ParseUUIDPipe) teamId: string, @Req() request: AppRequest): Promise<void> {
    await this.teamsService.remove(teamId, await this.accessService.resolveActor(request));
  }

  @Put(':id/members')
  @RequirePermission('equipos.editar')
  @ApiOperation({
    summary: 'Reemplaza los miembros del equipo',
    description:
      'Conjunto completo. Marcar `isPrimary` desmarca el equipo principal del usuario en sus otros equipos, en la misma transacción. Audita `team.members_replaced`. Exclusivo del administrador (RN-07.45, addendum de ADR-020): 403 ADMIN_ONLY en otro caso.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: TEAM_ADMIN_ONLY_DOC })
  @ApiOkResponse({ type: TeamDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incluye `userId` repetido)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el equipo o algún usuario' })
  async replaceMembers(
    @Param('id', ParseUUIDPipe) teamId: string,
    @Body() dto: ReplaceTeamMembersDto,
    @Req() request: AppRequest,
  ): Promise<TeamDetailResponseDto> {
    const team = await this.teamsService.replaceMembers(
      teamId,
      dto.members.map((member) => ({ userId: member.userId, isPrimary: member.isPrimary })),
      await this.accessService.resolveActor(request),
    );
    return toDetailResponse(team);
  }
}
