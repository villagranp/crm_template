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
import { AccessService } from '@/modules/access/access.service';
import { auditContextFrom } from '@/modules/audit/audit.service';

import {
  CreateSafetyMinuteDto,
  PaginatedSafetyMinutesDto,
  SafetyMinuteResponseDto,
  SafetyMinutesQueryDto,
  UpdateSafetyMinuteDto,
} from './dto/safety-minute.dto';
import { SafetyMinutesService, type SafetyMinuteActor, type SafetyMinuteView } from './safety-minutes.service';

export const SAFETY_MINUTE_VIEW_PERMISSION = 'minuto_seguridad.ver';
export const SAFETY_MINUTE_CREATE_PERMISSION = 'minuto_seguridad.crear';
export const SAFETY_MINUTE_EDIT_PERMISSION = 'minuto_seguridad.editar';
export const SAFETY_MINUTE_DELETE_PERMISSION = 'minuto_seguridad.eliminar';

export function toSafetyMinuteDto(view: SafetyMinuteView): SafetyMinuteResponseDto {
  const { record } = view;
  return {
    id: record.id,
    message: record.message,
    displayDate: record.displayDate,
    editable: view.editable,
    deletable: view.deletable,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy ? { id: record.updatedBy.id, displayName: record.updatedBy.displayName } : null,
  };
}

/**
 * Mantenimiento del minuto de seguridad (Ajustes 1, AJ1-2). Cada operación declara su permiso
 * `minuto_seguridad.*` (deny-by-default). La lectura del día para todas las sesiones es
 * `GET /me/safety-minute` (`MeSafetyMinuteController`).
 */
@ApiTags('Administración · Minuto de seguridad')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('safety-minutes')
export class SafetyMinutesController {
  constructor(
    private readonly safetyMinutes: SafetyMinutesService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @RequirePermission(SAFETY_MINUTE_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'AJ1-2 · Lista paginada de minutos de seguridad',
    description:
      'Filtros `from`/`to` sobre `displayDate` (incluidos, `from` ≤ `to`). Orden por `sortBy` (lista blanca; defecto `displayDate` descendente). ' +
      '`editable` y `deletable` los calcula el servidor con "hoy" en la zona `crm.zona_horaria_negocio`.',
  })
  @ApiOkResponse({ type: PaginatedSafetyMinutesDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (fechas, `from` > `to`, `pageSize` > 100, `sortBy` no admitido)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta minuto_seguridad.ver' })
  async search(@Query() query: SafetyMinutesQueryDto): Promise<PaginatedResponseDto<SafetyMinuteResponseDto>> {
    const page = await this.safetyMinutes.search({
      page: query.page,
      pageSize: query.pageSize,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return PaginatedResponseDto.of(page.items.map(toSafetyMinuteDto), page.page, page.pageSize, page.totalItems);
  }

  @Get(':id')
  @RequirePermission(SAFETY_MINUTE_VIEW_PERMISSION)
  @ApiOperation({ summary: 'AJ1-2 · Detalle de un minuto de seguridad' })
  @ApiOkResponse({ type: SafetyMinuteResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'BAD_REQUEST: id no UUID' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta minuto_seguridad.ver' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<SafetyMinuteResponseDto> {
    return toSafetyMinuteDto(await this.safetyMinutes.get(id));
  }

  @Post()
  @RequirePermission(SAFETY_MINUTE_CREATE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'AJ1-2 · Programa el minuto de seguridad de una fecha',
    description: 'Un mensaje por fecha. La fecha no puede ser pasada. Audita `safety_minute.created`.',
  })
  @ApiCreatedResponse({ type: SafetyMinuteResponseDto, description: 'El mensaje creado, con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (mensaje vacío, solo espacios o de más de 1000 caracteres; fecha inválida; campos extra)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta minuto_seguridad.crear' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SAFETY_MINUTE_DUPLICATE: ya hay un mensaje para esa fecha (`details[0].field = "displayDate"`)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'SAFETY_MINUTE_PAST_DATE: la fecha es anterior a hoy' })
  async create(
    @Body() dto: CreateSafetyMinuteDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SafetyMinuteResponseDto> {
    const view = await this.safetyMinutes.create({ message: dto.message, displayDate: dto.displayDate }, await this.actorOf(request));
    response.setHeader('Location', `/api/v1/safety-minutes/${view.record.id}`);
    return toSafetyMinuteDto(view);
  }

  @Patch(':id')
  @RequirePermission(SAFETY_MINUTE_EDIT_PERMISSION)
  @ApiOperation({
    summary: 'AJ1-2 · Edita el mensaje o la fecha de un minuto de seguridad',
    description:
      'Se edita el de hoy y los futuros; los pasados son de solo lectura. La fecha nueva no puede ser pasada ni estar ocupada. ' +
      'Audita `safety_minute.updated` con antes/después; sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: SafetyMinuteResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'BAD_REQUEST: id no UUID · VALIDATION_FAILED: mensaje o fecha inválidos, campos extra' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta minuto_seguridad.editar' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'SAFETY_MINUTE_DUPLICATE (fecha ocupada) · SAFETY_MINUTE_LOCKED (`details[0].reason = "past"`)',
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'SAFETY_MINUTE_PAST_DATE: la fecha nueva es anterior a hoy' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSafetyMinuteDto,
    @Req() request: AppRequest,
  ): Promise<SafetyMinuteResponseDto> {
    const view = await this.safetyMinutes.update(id, { message: dto.message, displayDate: dto.displayDate }, await this.actorOf(request));
    return toSafetyMinuteDto(view);
  }

  @Delete(':id')
  @RequirePermission(SAFETY_MINUTE_DELETE_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'AJ1-2 · Borra un minuto de seguridad futuro',
    description: 'Borrado físico, solo de fechas futuras. El rastro queda en `safety_minute.deleted` (con el estado previo).',
  })
  @ApiNoContentResponse({ description: 'Borrado' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'BAD_REQUEST: id no UUID' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta minuto_seguridad.eliminar' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SAFETY_MINUTE_LOCKED (`details[0].reason` = `today` o `past`)' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AppRequest): Promise<void> {
    await this.safetyMinutes.delete(id, await this.actorOf(request));
  }

  private async actorOf(request: AppRequest): Promise<SafetyMinuteActor> {
    return {
      userId: request.principal ? await this.access.findUserIdForPrincipal(request.principal) : null,
      audit: auditContextFrom(request),
    };
  }
}
