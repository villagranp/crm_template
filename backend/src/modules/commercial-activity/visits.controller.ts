import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequireAnyPermission } from '@/common/decorators/require-any-permission.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { CommercialActorResolver } from './commercial-actor.resolver';
import {
  CreateVisitDto,
  ListVisitsQueryDto,
  PaginatedVisitsDto,
  ScheduleConflictsQueryDto,
  ScheduleConflictsResponseDto,
  UpdateVisitDto,
  VisitCancellationDto,
  VisitCompletionDto,
  VisitConfirmationDto,
  VisitDetailDto,
  VisitEventDto,
  VisitFormOptionsDto,
  type VisitListItemDto,
  VisitReschedulingDto,
} from './dto/visit.dto';
import { VISIT_PERMISSIONS } from './visit-access-policy';
import { toScheduleConflictDto, toVisitDetailDto, toVisitEventDto, toVisitFormOptionsDto, toVisitListItemDto } from './visit.mapper';
import { VisitsService } from './visits.service';

const BAD_UUID = 'VALIDATION_FAILED: `id` no es UUID, o forma del cuerpo';
const NOT_FOUND = 'RESOURCE_NOT_FOUND: inexistente o fuera del alcance (no se distingue, ADR-008)';
const EDIT_403 = 'PERMISSION_DENIED: sin `visitas.editar`, o visita ajena sin `visitas.administrar` en su alcance, o visible solo por su proyecto (`details[0].requiredPermission`)';
const RACE_409 = 'INVALID_STATUS_TRANSITION: operación no permitida desde el estado actual, o cambio concurrente (`details[0].reason = CONCURRENT_CHANGE`)';
const PLANNING_422 =
  'REQUIRED_FIELD_MISSING (base + `crm.campos_obligatorios.visit`, `details[]` con todos) · INVALID_DATE_RANGE · INVALID_CONTACT · CONTACT_INACTIVE · ' +
  'UNKNOWN_REFERENCE · INACTIVE_REFERENCE · PROJECT_CUSTOMER_MISMATCH · OWNER_NOT_ELIGIBLE';

/**
 * Visitas comerciales (04 F.1, F-25…F-29). Sin lógica: valida la forma, resuelve el
 * actor, delega en `VisitsService` y traduce a DTO. El guard exige el permiso mínimo;
 * la propiedad (propia con `editar`, ajena con `administrar`; confirmar solo el
 * dueño, DM-20), el alcance y el estado los decide el servicio.
 *
 * `form-options` y `schedule-conflicts` se declaran **antes** de `:id` (que además usa
 * `ParseUUIDPipe`). No existe `DELETE /visits/:id` (RN-04.20): la ruta no se declara.
 */
@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@Controller('visits')
export class VisitsController {
  constructor(
    private readonly visits: VisitsService,
    private readonly actors: CommercialActorResolver,
  ) {}

  @Get()
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Listado de visitas visibles (F-25)',
    description:
      'Filtros combinables (AND) dentro del alcance (H.3: propio/equipo/país del cliente/organización, o proyecto vinculado visible). ' +
      '`from`/`to` sobre la fecha de agenda (RN-04.36). `search`: prefijo del código o términos en objetivo o razón social. ' +
      'Orden por defecto `scheduledStartAt` ascendente.',
  })
  @ApiOkResponse({ type: PaginatedVisitsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `sortBy` fuera de la lista blanca, `pageSize` > 100)' })
  async list(@Query() query: ListVisitsQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<VisitListItemDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.visits.list(actor, { ...query, sortOrder: query.sortBy ? query.sortOrder : 'asc' });
    return PaginatedResponseDto.of(page.items.map(toVisitListItemDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('form-options')
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Opciones de los formularios de visita (D-04.10)',
    description: 'Estados, motivos de reprogramación y cancelación y resultados **activos**; modo de conflicto, duración por defecto y obligatorios.',
  })
  @ApiOkResponse({ type: VisitFormOptionsDto })
  async formOptions(): Promise<VisitFormOptionsDto> {
    return toVisitFormOptionsDto(await this.visits.formOptions());
  }

  @Get('schedule-conflicts')
  @RequireAnyPermission(VISIT_PERMISSIONS.create, VISIT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'Conflictos horarios del responsable (RN-04.14)',
    description:
      'Exige `visitas.crear` **o** `visitas.editar`. Visitas no canceladas del responsable cuyo intervalo `[inicio, fin efectivo)` se cruza. ' +
      'Con `mode = NO` la lista va vacía. Una visita fuera del alcance se informa sin id, código ni cliente. Otro responsable exige ' +
      '`visitas.administrar` y que sea asignable por el usuario.',
  })
  @ApiOkResponse({ type: ScheduleConflictsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (sin ninguno de los dos permisos; `ownerId` ajeno sin `visitas.administrar`)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_DATE_RANGE · OWNER_NOT_ELIGIBLE' })
  async scheduleConflicts(@Query() query: ScheduleConflictsQueryDto, @Req() request: AppRequest): Promise<ScheduleConflictsResponseDto> {
    const actor = await this.actors.fromRequest(request);
    const result = await this.visits.scheduleConflicts(actor, query);
    return { mode: result.mode, conflicts: result.conflicts.map(toScheduleConflictDto) };
  }

  @Get(':id')
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiOperation({ summary: 'Detalle de visita', description: '`allowedActions` sale de la misma política que autoriza las operaciones.' })
  @ApiOkResponse({ type: VisitDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  async findById(@Param('id', ParseUUIDPipe) visitId: string, @Req() request: AppRequest): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitDetailDto(await this.visits.findById(actor, visitId));
  }

  @Get(':id/events')
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiOperation({ summary: 'Historial de eventos de la visita', description: 'Sin paginar, en orden cronológico (AC-04.20).' })
  @ApiOkResponse({ type: [VisitEventDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  async events(@Param('id', ParseUUIDPipe) visitId: string, @Req() request: AppRequest): Promise<VisitEventDto[]> {
    const actor = await this.actors.fromRequest(request);
    return (await this.visits.listEvents(actor, visitId)).map(toVisitEventDto);
  }

  @Post()
  @RequirePermission(VISIT_PERMISSIONS.create)
  @ApiOperation({
    summary: 'Planificar visita (F-26, RN-04.13)',
    description:
      'Folio `VIS-AAAA-NNNNN` (secuencia `crm.visita`), estado pendiente inicial y evento `PLANNED`. `ownerId` ajeno exige ' +
      '`visitas.administrar`. Conflictos (RN-04.14): con `AVISAR` guarda y devuelve `scheduleConflicts`; con `BLOQUEAR`, `409`. ' +
      'El recordatorio solo se guarda (DM-27). Si tiene proyecto, actualiza `projects.last_activity_at`. Audita `crm.visit.created`.',
  })
  @ApiCreatedResponse({ type: VisitDetailDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (forma, campos no permitidos, participantes sin exactamente un sujeto o repetidos)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (`visitas.administrar` con `ownerId` ajeno)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el cliente no existe, está eliminado o no es visible (02 F.6.3)' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SCHEDULE_CONFLICT (solo con `BLOQUEAR`; `details[]` con los solapes)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: `${PLANNING_422} · CUSTOMER_INACTIVE` })
  async create(@Body() dto: CreateVisitDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.visits.create(actor, dto);
    response.setHeader('Location', `/api/v1/visits/${view.record.id}`);
    return toVisitDetailDto(view);
  }

  @Patch(':id')
  @RequirePermission(VISIT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'Editar la planificación (RN-04.15)',
    description:
      'Solo pendientes. Campo omitido = sin cambio; `null` = quitar. La fecha de inicio no se edita (`422 USE_RESCHEDULE`). Reasignar exige ' +
      '`visitas.administrar`. Cambiar responsable o fin evalúa conflictos. Sin cambios no escribe ni audita. Audita `crm.visit.updated`.',
  })
  @ApiOkResponse({ type: VisitDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: `RECORD_READ_ONLY (realizada, confirmada o cancelada) · SCHEDULE_CONFLICT · ${RACE_409}` })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: `USE_RESCHEDULE · ${PLANNING_422}` })
  async update(@Param('id', ParseUUIDPipe) visitId: string, @Body() dto: UpdateVisitDto, @Req() request: AppRequest): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitDetailDto(await this.visits.update(actor, visitId, dto));
  }

  @Post(':id/completion')
  @RequirePermission(VISIT_PERMISSIONS.edit)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar visita realizada (F-27, RN-04.16)',
    description:
      'Solo pendientes → `REALIZADA`. Fecha real obligatoria y no futura; asistentes `ATTENDED`. Fija quién y cuándo la registró e inserta ' +
      'el evento `COMPLETED`. Actualiza `projects.last_activity_at`. Audita `crm.visit.completed`.',
  })
  @ApiOkResponse({ type: VisitDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: RACE_409 })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'ACTUAL_DATE_IN_FUTURE · INVALID_DATE_RANGE · REQUIRED_FIELD_MISSING (`crm.campos_obligatorios.visitCompletion`) · INVALID_CATALOG_VALUE · INVALID_CONTACT · CONTACT_INACTIVE · UNKNOWN_REFERENCE · INACTIVE_REFERENCE',
  })
  async complete(@Param('id', ParseUUIDPipe) visitId: string, @Body() dto: VisitCompletionDto, @Req() request: AppRequest): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitDetailDto(await this.visits.complete(actor, visitId, dto));
  }

  @Put(':id/completion')
  @RequirePermission(VISIT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'Corregir la realización (RN-04.17, D-04.6)',
    description:
      'Solo `REALIZADA` sin confirmar. Sustituye los datos de la realización (lo omitido queda vacío). No genera un segundo evento; ' +
      'audita `crm.visit.completion_corrected`. Sin cambios no escribe.',
  })
  @ApiOkResponse({ type: VisitDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: `${RACE_409} (pendiente, confirmada o cancelada)` })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'Mismos códigos que el registro' })
  async correctCompletion(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Body() dto: VisitCompletionDto,
    @Req() request: AppRequest,
  ): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitDetailDto(await this.visits.correctCompletion(actor, visitId, dto));
  }

  @Post(':id/confirmation')
  @RequirePermission(VISIT_PERMISSIONS.close)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar visita (F-28, RN-04.18, DM-20)',
    description:
      'Solo el **dueño** de la visita, con `visitas.cerrar`: ni `visitas.administrar` ni el administrador confirman la de otro. ' +
      'Solo desde `REALIZADA`. Exige `confirmationSummary` si la realización no tiene resumen ni comentarios. Inserta el evento ' +
      '`CONFIRMED` y la deja en solo lectura. Dos confirmaciones simultáneas: una `200`, la otra `409`.',
  })
  @ApiOkResponse({ type: VisitDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (sin `visitas.cerrar`) · VISIT_CONFIRMATION_OWNER_ONLY (no es el dueño)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: `${RACE_409} (p. ej. pendiente sin realización)` })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'CONFIRMATION_SUMMARY_REQUIRED' })
  async confirm(@Param('id', ParseUUIDPipe) visitId: string, @Body() dto: VisitConfirmationDto, @Req() request: AppRequest): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitDetailDto(await this.visits.confirm(actor, visitId, dto));
  }

  @Post(':id/rescheduling')
  @RequirePermission(VISIT_PERMISSIONS.edit)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reprogramar visita (F-29, RN-04.19)',
    description:
      'Solo pendientes. En la **misma fila**: fecha vigente nueva, `rescheduleCount + 1`, estado `REPROGRAMADA` y evento `RESCHEDULED` ' +
      'con fechas y estados anterior y nuevo. Sin fin nuevo conserva la duración. Evalúa conflictos (`scheduleConflicts` / `409`).',
  })
  @ApiOkResponse({ type: VisitDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: `${RACE_409} · SCHEDULE_CONFLICT` })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'RESCHEDULE_SAME_DATE · DATE_IN_PAST · INVALID_DATE_RANGE · REASON_REQUIRED · INVALID_CATALOG_VALUE' })
  async reschedule(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Body() dto: VisitReschedulingDto,
    @Req() request: AppRequest,
  ): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitDetailDto(await this.visits.reschedule(actor, visitId, dto));
  }

  @Post(':id/cancellation')
  @RequirePermission(VISIT_PERMISSIONS.edit)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar visita (F-29, RN-04.20)',
    description: 'Solo pendientes; definitiva. La fila no se elimina. Evento `CANCELLED` con motivo (catálogo o texto). Audita `crm.visit.cancelled`.',
  })
  @ApiOkResponse({ type: VisitDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: RACE_409 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'REASON_REQUIRED · INVALID_CATALOG_VALUE' })
  async cancel(@Param('id', ParseUUIDPipe) visitId: string, @Body() dto: VisitCancellationDto, @Req() request: AppRequest): Promise<VisitDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitDetailDto(await this.visits.cancel(actor, visitId, dto));
  }
}
