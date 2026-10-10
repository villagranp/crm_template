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
import { auditContextFrom } from '@/modules/audit/audit.service';

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
  constructor(private readonly teamsService: TeamsService) {}

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
  @ApiOperation({ summary: 'Alta de equipo', description: 'Audita `team.created`.' })
  @ApiCreatedResponse({ type: TeamDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
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
      auditContextFrom(request),
    );
    return toDetailResponse(team);
  }

  @Patch(':id')
  @RequirePermission('equipos.editar')
  @ApiOperation({
    summary: 'Actualiza un equipo',
    description: 'Campo omitido = sin cambio; `null` quita el valor. `code` es inmutable. Audita `team.updated`.',
  })
  @ApiOkResponse({ type: TeamDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incluye enviar `code`)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el equipo, el padre o el responsable' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'TEAM_CYCLE: el padre es el propio equipo o un descendiente' })
  async update(
    @Param('id', ParseUUIDPipe) teamId: string,
    @Body() dto: UpdateTeamDto,
    @Req() request: AppRequest,
  ): Promise<TeamDetailResponseDto> {
    return toDetailResponse(await this.teamsService.update(teamId, dto, auditContextFrom(request)));
  }

  @Delete(':id')
  @RequirePermission('equipos.eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un equipo (borrado lógico)', description: 'Audita `team.deleted`.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'HAS_CHILDREN: el equipo tiene miembros o subequipos' })
  async remove(@Param('id', ParseUUIDPipe) teamId: string, @Req() request: AppRequest): Promise<void> {
    await this.teamsService.remove(teamId, auditContextFrom(request));
  }

  @Put(':id/members')
  @RequirePermission('equipos.editar')
  @ApiOperation({
    summary: 'Reemplaza los miembros del equipo',
    description:
      'Conjunto completo. Marcar `isPrimary` desmarca el equipo principal del usuario en sus otros equipos, en la misma transacción. Audita `team.members_replaced`.',
  })
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
      auditContextFrom(request),
    );
    return toDetailResponse(team);
  }
}
