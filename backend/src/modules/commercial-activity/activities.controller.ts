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
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { ActivitiesService } from './activities.service';
import { ACTIVITY_PERMISSIONS } from './activity-access-policy';
import { toActivityDetailDto, toActivityFormOptionsDto, toActivityListItemDto, toPendingActivityDto } from './activity.mapper';
import { CommercialActorResolver } from './commercial-actor.resolver';
import { CommercialActivityOptionsService, toCommercialFormContextDto } from './commercial-activity-options.service';
import {
  ActivityCancellationDto,
  ActivityCompletionDto,
  ActivityDetailDto,
  ActivityFormOptionsDto,
  type ActivityListItemDto,
  CreateActivityDto,
  ListActivitiesQueryDto,
  ListPendingActivitiesQueryDto,
  PaginatedActivitiesDto,
  PendingActivitiesResponseDto,
  UpdateActivityDto,
} from './dto/activity.dto';

const BAD_UUID = 'VALIDATION_FAILED: `id` no es UUID';
const NOT_FOUND = 'RESOURCE_NOT_FOUND: inexistente, eliminada o fuera del alcance (no se distingue, ADR-008)';
const WRITE_422 =
  'REQUIRED_FIELD_MISSING (base + `crm.campos_obligatorios.activity`, `details[]` con todos) · FIELD_NOT_APPLICABLE (`details[]` con todos) · ' +
  'INVALID_CATALOG_VALUE · CUSTOMER_INACTIVE · INVALID_CONTACT · CONTACT_INACTIVE · UNKNOWN_REFERENCE · INACTIVE_REFERENCE · ' +
  'PROJECT_CUSTOMER_MISMATCH · OPPORTUNITY_PROJECT_MISMATCH · OPPORTUNITY_REQUIRES_PROJECT · OWNER_NOT_ELIGIBLE · USE_LIFECYCLE_OPERATION';

/**
 * Actividades (04 F.2: llamadas, reuniones, correos y tareas). Sin lógica: valida la
 * forma, resuelve el actor, delega en `ActivitiesService` y traduce a DTO. El guard
 * exige el permiso mínimo de cada operación; la propiedad (propia con `editar`, ajena
 * con `administrar`), el alcance y el estado los decide el servicio con la política
 * de acceso: fuera del alcance → `404`, dentro sin permiso → `403`.
 *
 * `pending` y `form-options` se declaran **antes** de `:id` (que además usa `ParseUUIDPipe`).
 * El tipo correo solo **registra** un correo gestionado fuera del CRM: no se envía ni
 * se recibe nada (RN-04.26).
 */
@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly actors: CommercialActorResolver,
    private readonly options: CommercialActivityOptionsService,
  ) {}

  @Get()
  @RequirePermission(ACTIVITY_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Listado de actividades visibles',
    description:
      'Filtros combinables (AND) dentro del alcance (H.3: propio/equipo/país del cliente/organización, o proyecto vinculado visible). ' +
      'Sin eliminadas. `search`: prefijo del código o términos en asunto o razón social. Orden por defecto `dueAt` ascendente.',
  })
  @ApiOkResponse({ type: PaginatedActivitiesDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `sortBy` fuera de la lista blanca, `pageSize` > 100)' })
  async list(@Query() query: ListActivitiesQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<ActivityListItemDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.activities.list(actor, {
      ...query,
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
    });
    return PaginatedResponseDto.of(page.items.map(toActivityListItemDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('pending')
  @RequirePermission(ACTIVITY_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Bandeja de actividades pendientes (F-22)',
    description:
      'Solo abiertas, no eliminadas y visibles. `bucket` (RN-04.31): OVERDUE (`dueAt` < ahora), DUE_SOON (hasta ahora + ' +
      '`crm.alertas.actividad_por_vencer_horas`, límite incluido), PENDING (resto, incluidas sin vencimiento). ' +
      'Orden por defecto RN-04.32: peso de prioridad desc, vencimiento asc (nulos al final), programada asc, código. ' +
      '`counts` ignora `bucket` y respeta los demás filtros y el alcance.',
  })
  @ApiOkResponse({ type: PendingActivitiesResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async pending(@Query() query: ListPendingActivitiesQueryDto, @Req() request: AppRequest): Promise<PendingActivitiesResponseDto> {
    const actor = await this.actors.fromRequest(request);
    const { page, counts } = await this.activities.listPending(actor, {
      ...query,
      sortOrder: query.sortBy === 'dueAt' ? query.sortOrder : 'asc',
    });
    const paginated = PaginatedResponseDto.of(page.items.map(toPendingActivityDto), page.page, page.pageSize, page.totalItems);
    return { data: paginated.data, pagination: paginated.pagination, counts };
  }

  @Get('form-options')
  @RequirePermission(ACTIVITY_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Opciones del formulario de actividad (D-04.10)',
    description: 'Tipos (con `fields` e `isInteraction`), estados, prioridades y resultados **activos**; valores por defecto, obligatorios y umbral de "próxima a vencer"; zonas horarias del usuario y de negocio (RN-04.9) y límites de adjuntos.',
  })
  @ApiOkResponse({ type: ActivityFormOptionsDto })
  async formOptions(@Req() request: AppRequest): Promise<ActivityFormOptionsDto> {
    const actor = await this.actors.fromRequest(request);
    const [options, context] = await Promise.all([this.activities.formOptions(), this.options.formContext(actor)]);
    return { ...toActivityFormOptionsDto(options), ...toCommercialFormContextDto(context) };
  }

  @Get(':id')
  @RequirePermission(ACTIVITY_PERMISSIONS.view)
  @ApiOperation({ summary: 'Detalle de actividad', description: '`allowedActions` sale de la misma política que autoriza las operaciones.' })
  @ApiOkResponse({ type: ActivityDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  async findById(@Param('id', ParseUUIDPipe) activityId: string, @Req() request: AppRequest): Promise<ActivityDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toActivityDetailDto(await this.activities.findById(actor, activityId));
  }

  @Post()
  @RequirePermission(ACTIVITY_PERMISSIONS.create)
  @ApiOperation({
    summary: 'Crear actividad (F-31, F-32)',
    description:
      'Folio `ACT-AAAA-NNNNNN` (secuencia `crm.actividad`), estado abierto inicial y prioridad de `crm.valores_por_defecto` si se omite. ' +
      'Con `completion` se crea ya completada (D-04.14): exige además `actividades.cerrar`. `ownerId` ajeno exige `actividades.administrar`. ' +
      'Si tiene proyecto, actualiza `projects.last_activity_at` en la misma transacción. Audita `crm.activity.created`.',
  })
  @ApiCreatedResponse({ type: ActivityDetailDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (forma, campos no permitidos, participantes sin exactamente un sujeto o repetidos)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (`actividades.cerrar` con `completion`; `actividades.administrar` con `ownerId` ajeno)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el cliente no existe, está eliminado o no es visible (02 F.6.3)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: `${WRITE_422} · RESULT_REQUIRED · ACTUAL_DATE_IN_FUTURE (bloque \`completion\`)` })
  async create(
    @Body() dto: CreateActivityDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ActivityDetailDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.activities.create(actor, dto);
    response.setHeader('Location', `/api/v1/activities/${view.record.id}`);
    return toActivityDetailDto(view);
  }

  @Patch(':id')
  @RequirePermission(ACTIVITY_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'Editar actividad abierta (RN-04.27)',
    description:
      'Campo omitido = sin cambio; `null` = quitar. Propia con `actividades.editar`; ajena (alcance directo) con `actividades.administrar`; ' +
      'visible solo por su proyecto = solo lectura. Solo cambia entre estados abiertos. Cambiar el tipo revalida los campos guardados. ' +
      'Sin cambios no escribe ni audita. Audita `crm.activity.updated` con la diferencia (texto libre enmascarado).',
  })
  @ApiOkResponse({ type: ActivityDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: `${BAD_UUID} · forma del cuerpo` })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (`details[0].requiredPermission`: `actividades.editar` o `actividades.administrar`)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RECORD_READ_ONLY (completada o cancelada) · INVALID_STATUS_TRANSITION (cambio concurrente)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: WRITE_422 })
  async update(@Param('id', ParseUUIDPipe) activityId: string, @Body() dto: UpdateActivityDto, @Req() request: AppRequest): Promise<ActivityDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toActivityDetailDto(await this.activities.update(actor, activityId, dto));
  }

  @Post(':id/completion')
  @RequirePermission(ACTIVITY_PERMISSIONS.close)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Completar actividad (F-33, RN-04.28)',
    description:
      'Solo abiertas. Exige resultado (`resultId` y/o `resultNotes`); `completedAt` por defecto ahora y no futura. Propia con ' +
      '`actividades.cerrar`; ajena además con `actividades.administrar`. Sale de la bandeja. Audita `crm.activity.completed`.',
  })
  @ApiOkResponse({ type: ActivityDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INVALID_STATUS_TRANSITION (ya completada o cancelada, o cambio concurrente)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'RESULT_REQUIRED · ACTUAL_DATE_IN_FUTURE · INVALID_CATALOG_VALUE' })
  async complete(
    @Param('id', ParseUUIDPipe) activityId: string,
    @Body() dto: ActivityCompletionDto,
    @Req() request: AppRequest,
  ): Promise<ActivityDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toActivityDetailDto(await this.activities.complete(actor, activityId, dto));
  }

  @Post(':id/cancellation')
  @RequirePermission(ACTIVITY_PERMISSIONS.edit)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar actividad (RN-04.30)',
    description: 'Solo abiertas; definitiva (sin reabrir, D-04.6). El comentario queda en la auditoría (D-04.7). Audita `crm.activity.cancelled`.',
  })
  @ApiOkResponse({ type: ActivityDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INVALID_STATUS_TRANSITION' })
  async cancel(
    @Param('id', ParseUUIDPipe) activityId: string,
    @Body() dto: ActivityCancellationDto,
    @Req() request: AppRequest,
  ): Promise<ActivityDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toActivityDetailDto(await this.activities.cancel(actor, activityId, dto));
  }

  @Delete(':id')
  @RequirePermission(ACTIVITY_PERMISSIONS.delete)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar actividad (lógico, RN-04.30, DM-33)',
    description: 'Solo abiertas o canceladas, dentro del alcance de `actividades.eliminar`. Desaparece de listados, bandeja, agenda e historial. Audita `crm.activity.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RECORD_READ_ONLY (completada: es historia) · INVALID_STATUS_TRANSITION (cambio concurrente)' })
  async remove(@Param('id', ParseUUIDPipe) activityId: string, @Req() request: AppRequest): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.activities.remove(actor, activityId);
  }
}
