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
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import {
  CreateProjectDto,
  PaginatedProjectsDto,
  PaginatedTeamProjectsDto,
  ProjectDetailDto,
  type ProjectListItemDto,
  type TeamProjectItemDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectHistoryQueryDto, ProjectQueryDto, TeamViewQueryDto } from './dto/project-query.dto';
import { DuplicateProjectDto, PaginatedProjectHistoryDto, type ProjectHistoryEntryDto } from './dto/project-subresources.dto';
import { parseCommercialStatusFilter } from './project-commercial-status';
import { PROJECT_PERMISSIONS } from './project-constants';
import { ProjectDuplicationService } from './project-duplication.service';
import { ProjectHistoryService } from './project-history.service';
import { toProjectDetailDto, toProjectHistoryEntryDto, toProjectListItemDto, toTeamProjectItemDto } from './project.mapper';
import { ProjectsService } from './projects.service';

export const PROJECT_NOT_FOUND = 'RESOURCE_NOT_FOUND: proyecto inexistente, eliminado o fuera del alcance de `proyectos.ver` (mismo cuerpo en los tres casos)';
export const PROJECT_UUID_400 =
  'BAD_REQUEST: algún id de la ruta no es UUID (`ParseUUIDPipe`) · VALIDATION_FAILED: el cuerpo o la consulta no cumplen el DTO (campos extra incluidos)';
const CREATE_422 =
  'CUSTOMER_INACTIVE · REQUIRED_FIELD_MISSING (`crm.campos_obligatorios.project`) · INVALID_DATE_RANGE · INVALID_OWNER · UNKNOWN_REFERENCE (país). ' +
  '`details[]` trae todas las incidencias del mismo paso (`field`, `code`, `message`); el `code` de la respuesta es el de la primera.';

/**
 * Proyectos (03 F.1: F-10, F-11, F-12, F-13, F-14). Sin lógica: valida la forma,
 * resuelve el actor, delega y traduce a DTO. Cada handler declara su permiso base; la
 * propiedad, el alcance de cada permiso y los campos reservados los decide el
 * servicio (`project-access-policy.ts`): fuera del alcance → `404`, dentro sin permiso → `403`.
 */
@ApiTags('Proyectos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED: sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly duplication: ProjectDuplicationService,
    private readonly history: ProjectHistoryService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get()
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-13 · Búsqueda de proyectos visibles',
    description:
      'Filtros combinados con Y y siempre dentro del alcance de `proyectos.ver` (RN-03.18). Es también el contrato de Clientes F-08 ' +
      '(`?customerId=`). Orden por defecto `lastActivityAt desc`, desempate por `id`. Cada fila trae `commercialStatus` (DEF-B) y `capabilities`.',
  })
  @ApiOkResponse({ type: PaginatedProjectsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (filtro u orden inválido, `pageSize` > 100, `dateFrom` sin `dateField`)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_DATE_RANGE (`dateFrom > dateTo`; `details[0].field = "dateTo"`)' })
  async search(@Query() query: ProjectQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<ProjectListItemDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.projects.search(actor, {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'desc',
      search: query.search,
      code: query.code,
      customerIds: query.customerId,
      countryIds: query.countryId,
      city: query.city,
      ownerIds: query.ownerId,
      projectTypeIds: query.projectTypeId,
      phaseIds: query.phaseId,
      stageIds: query.stageId,
      commercialStatus: (query.commercialStatus ?? []).map((value) => {
        const filter = parseCommercialStatusFilter(value);
        if (!filter) throw new Error('commercialStatus validated by the DTO');
        return filter;
      }),
      active: query.active,
      dateField: query.dateField,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return PaginatedResponseDto.of(page.items.map(toProjectListItemDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('team-view')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-14 · Proyectos del equipo',
    description:
      'Según el alcance de `proyectos.ver` (OWN, TEAM con subequipos, COUNTRY, ORGANIZATION). `team` = equipo principal del responsable. ' +
      '`capabilities.canEdit = false` marca "Solo lectura". Orden por defecto `lastActivityAt desc`.',
  })
  @ApiOkResponse({ type: PaginatedTeamProjectsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_DATE_RANGE (`lastActivityFrom > lastActivityTo`)' })
  async teamView(@Query() query: TeamViewQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<TeamProjectItemDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.projects.teamView(actor, {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'desc',
      search: query.search,
      teamIds: query.teamId,
      ownerIds: query.ownerId,
      phaseIds: query.phaseId,
      countryIds: query.countryId,
      lastActivityFrom: query.lastActivityFrom,
      lastActivityTo: query.lastActivityTo,
    });
    return PaginatedResponseDto.of(page.items.map(toTeamProjectItemDto), page.page, page.pageSize, page.totalItems);
  }

  @Post()
  @RequirePermission(PROJECT_PERMISSIONS.create)
  @ApiOperation({
    summary: 'F-10 · Alta de proyecto',
    description:
      'Código `PRY-AAAA-nnnnn` con la secuencia `crm.proyecto` en la misma transacción (zona del negocio). Fase = `crm.valores_por_defecto["project.phaseId"]` ' +
      'con su porcentaje por defecto y primera fila de historial. Asesor por defecto: el usuario. Audita `crm.project.created`. ' +
      'Los adjuntos se suben después con `POST /projects/{id}/attachments`.',
  })
  @ApiCreatedResponse({ type: ProjectDetailDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (p. ej. nombre vacío, fecha inválida, campos no permitidos)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED · FIELD_NOT_EDITABLE (`ownerId` ajeno o `code` sin `proyectos.administrar`; `details[]`: `{ field, requiredPermission }`)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: cliente inexistente, eliminado o no visible (no se consume folio)' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'PROJECT_CODE_TAKEN (`details[0]`: `{ field: "code", code }`)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: CREATE_422 })
  async create(@Body() dto: CreateProjectDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response): Promise<ProjectDetailDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.projects.create(actor, dto);
    response.setHeader('Location', `/api/v1/projects/${view.record.id}`);
    return toProjectDetailDto(view);
  }

  @Get(':id')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-11 · Ficha del proyecto',
    description: 'Cabecera, general, clasificación, fase vigente, resúmenes y `capabilities` (misma política que hace cumplir las mutaciones).',
  })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: PROJECT_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
  async findById(@Param('id', ParseUUIDPipe) projectId: string, @Req() request: AppRequest): Promise<ProjectDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toProjectDetailDto(await this.projects.findById(actor, projectId));
  }

  @Patch(':id')
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-11 · Edición de datos generales',
    description:
      'Propio con `proyectos.editar`; ajeno con `proyectos.administrar` dentro de su alcance. `ownerId` y `code` exigen `administrar` si cambian. ' +
      'Actualiza `lastActivityAt` en la misma transacción. Audita `crm.project.updated` con la diferencia (dirección y descripción enmascaradas); sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: PROJECT_UUID_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (`details[0].requiredPermission`) · FIELD_NOT_EDITABLE' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: `${PROJECT_NOT_FOUND}; o cliente nuevo inexistente o no visible` })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'PROJECT_CODE_TAKEN · PROJECT_CUSTOMER_LOCKED (`details[]`: `{ field: "customerId", dependency: "visits"|"activities", count }`)',
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: CREATE_422 })
  async update(@Param('id', ParseUUIDPipe) projectId: string, @Body() dto: UpdateProjectDto, @Req() request: AppRequest): Promise<ProjectDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toProjectDetailDto(await this.projects.update(actor, projectId, dto));
  }

  @Delete(':id')
  @RequirePermission(PROJECT_PERMISSIONS.delete)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'F-11 · Eliminación lógica del proyecto',
    description:
      '`proyectos.eliminar` con el proyecto en su alcance y (propio, o `proyectos.administrar`). Conteo de bloqueos y borrado en una transacción con la fila bloqueada. ' +
      'Conserva toda la historia. Audita `crm.project.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: PROJECT_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      "PROJECT_HAS_ACTIVE_CHILDREN: `details[]` = `{ dependency: 'openOpportunities'|'productsWithForecast'|'nonCancelledVisits'|'openActivities', count }` (solo los > 0)",
  })
  async remove(@Param('id', ParseUUIDPipe) projectId: string, @Req() request: AppRequest): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.projects.remove(actor, projectId);
  }

  @Post(':id/duplicate')
  @RequirePermission(PROJECT_PERMISSIONS.create)
  @ApiOperation({
    summary: 'F-12 · Duplica un proyecto',
    description:
      'Exige el origen visible. Copia según `copy` (RN-03.21, RN-03.22) y nunca oportunidades, resultados, fase, forecast, adjuntos ni auditoría (RN-03.23). ' +
      'Código nuevo, `duplicatedFrom` = origen. Audita `crm.project.duplicated` (`metadata.sourceProjectId`).',
  })
  @ApiCreatedResponse({ type: ProjectDetailDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: `${PROJECT_UUID_400}; nombre vacío` })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED · FIELD_NOT_EDITABLE (`ownerId` ajeno o `code` sin `administrar`)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: `${PROJECT_NOT_FOUND} (origen); o cliente elegido inexistente o no visible` })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'PROJECT_CODE_TAKEN' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: CREATE_422 })
  async duplicate(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: DuplicateProjectDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProjectDetailDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.duplication.duplicate(actor, projectId, {
      name: dto.name,
      customerId: dto.customerId,
      ownerId: dto.ownerId,
      code: dto.code,
      estimatedStartDate: dto.estimatedStartDate,
      estimatedEndDate: dto.estimatedEndDate,
      estimatedDecisionDate: dto.estimatedDecisionDate,
      copy: {
        location: dto.copy.location,
        description: dto.copy.description,
        classification: dto.copy.classification,
        products: dto.copy.products,
      },
    });
    response.setHeader('Location', `/api/v1/projects/${view.record.id}`);
    return toProjectDetailDto(view);
  }

  @Get(':id/history')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-11 · Historial de cambios de la ficha',
    description:
      'Fase, etapas y resultados de sus oportunidades y auditoría del proyecto y de sus hijos (oportunidades, productos, forecast, adjuntos), ' +
      'más reciente primero y paginado en el servidor. La auditoría que repite un historial funcional no se muestra. Filtro `kind`.',
  })
  @ApiOkResponse({ type: PaginatedProjectHistoryDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: PROJECT_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
  async projectHistory(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectHistoryQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<ProjectHistoryEntryDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.history.list(actor, projectId, { page: query.page, pageSize: query.pageSize, kinds: query.kind ?? [] });
    return PaginatedResponseDto.of(page.items.map(toProjectHistoryEntryDto), page.page, page.pageSize, page.totalItems);
  }
}
