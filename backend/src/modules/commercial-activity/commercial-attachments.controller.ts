import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  type StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequireAnyPermission } from '@/common/decorators/require-any-permission.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { attachmentDownload } from '@/modules/attachments/attachment-download';
import { AttachmentUploadInterceptor, toAttachmentUpload, type UploadedAttachmentFile } from '@/modules/attachments/attachment-upload.interceptor';
import type { AttachmentOwner } from '@/modules/attachments/attachment-policy';
import { AttachmentsService } from '@/modules/attachments/attachments.service';
import type { AttachmentRecord } from '@/modules/attachments/ports/attachments.repository.port';
import { AttachmentResponseDto, PaginatedAttachmentsResponseDto } from '@/modules/customers/dto/customer-attachment.dto';

import { ActivitiesService } from './activities.service';
import { ACTIVITY_PERMISSIONS } from './activity-access-policy';
import { type CommercialActor, CommercialActorResolver } from './commercial-actor.resolver';
import { CommercialAttachmentOwner, CommercialAttachmentWriteGuard } from './commercial-attachment-write.guard';
import { ListCommercialAttachmentsQueryDto, UploadCommercialAttachmentBodyDto, UploadCommercialAttachmentDto } from './dto/attachment.dto';
import { VISIT_PERMISSIONS } from './visit-access-policy';
import { VisitsService } from './visits.service';

/**
 * Adjuntos de visitas, eventos de visita y actividades (04 F.4, DC-2, D-04.18,
 * ADR-021). Las rutas cuelgan del dueño: este módulo autoriza sobre la visita, el
 * evento o la actividad (permiso + visibilidad → `404`, política de edición → `403`,
 * estado → `409`) y solo entonces delega en `AttachmentsService` (02 F.6.5), que no
 * autoriza. Un adjunto de otro dueño en la ruta → `404`. La descarga se transmite por
 * la API (`attachment`, `nosniff`, `no-store`), nunca como estático.
 *
 * Los adjuntos de un evento no se eliminan (historia, 00 §2.11): no hay `DELETE`.
 */

export function toCommercialAttachmentDto(record: AttachmentRecord): AttachmentResponseDto {
  return {
    id: record.id,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
  };
}

const NOT_FOUND = 'RESOURCE_NOT_FOUND: dueño inexistente o fuera del alcance, o adjunto de otro dueño o eliminado';
const BAD_UUID = 'VALIDATION_FAILED: algún id no es UUID';
const UPLOAD_400 = 'VALIDATION_FAILED: id no UUID, falta `file`, más de un archivo o campos extra';
const TOO_LARGE = 'ATTACHMENT_TOO_LARGE (supera `crm.adjuntos.max_mb`). El 413 de NGINX puede llegar sin cuerpo JSON';
const TYPE_422 = 'ATTACHMENT_TYPE_NOT_ALLOWED (tipo detectado por la firma del contenido)';

function listRequest(query: ListCommercialAttachmentsQueryDto): { page: number; pageSize: number; sortBy?: ListCommercialAttachmentsQueryDto['sortBy']; sortOrder: 'asc' | 'desc' } {
  return { page: query.page, pageSize: query.pageSize, sortBy: query.sortBy, sortOrder: query.sortBy ? query.sortOrder : 'desc' };
}

function attachmentActor(actor: CommercialActor): { userId: string | null; audit: CommercialActor['audit'] } {
  return { userId: actor.userId, audit: actor.audit };
}

@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
@Controller('visits/:id')
export class VisitAttachmentsController {
  constructor(
    private readonly visits: VisitsService,
    private readonly attachments: AttachmentsService,
    private readonly actors: CommercialActorResolver,
  ) {}

  @Get('attachments')
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiOperation({ summary: 'Adjuntos de la visita', description: 'Sin los de sus eventos. Orden por defecto `createdAt` descendente.' })
  @ApiOkResponse({ type: PaginatedAttachmentsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async list(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Query() query: ListCommercialAttachmentsQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<AttachmentResponseDto>> {
    const actor = await this.actors.fromRequest(request);
    await this.visits.assertCanViewAttachments(actor, visitId);
    const page = await this.attachments.list({ type: 'visit', id: visitId }, listRequest(query));
    return PaginatedResponseDto.of(page.items.map(toCommercialAttachmentDto), page.page, page.pageSize, page.totalItems);
  }

  @Post('attachments')
  @RequirePermission(VISIT_PERMISSIONS.edit)
  @CommercialAttachmentOwner('visit')
  // El guard autoriza sobre la visita (404/403/409) ANTES de que el interceptor lea el multipart.
  @UseGuards(CommercialAttachmentWriteGuard)
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadCommercialAttachmentBodyDto })
  @ApiOperation({
    summary: 'Sube un adjunto a la visita',
    description:
      'Propia con `visitas.editar`; ajena con `visitas.administrar`. No en visitas confirmadas o canceladas. Tamaño máximo ' +
      '`crm.adjuntos.max_mb`; tipo por firma (PDF, JPEG, PNG, DOCX, XLSX). Audita `crm.attachment.added`.',
  })
  @ApiCreatedResponse({ type: AttachmentResponseDto, description: 'Con cabecera `Location` (ruta de descarga)' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UPLOAD_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: visita no editable por el usuario' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RECORD_READ_ONLY (visita confirmada o cancelada)' })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto, description: TOO_LARGE })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: TYPE_422 })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
  async upload(
    @Param('id', ParseUUIDPipe) visitId: string,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: UploadCommercialAttachmentDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AttachmentResponseDto> {
    const actor = await this.actors.fromRequest(request);
    // Segunda comprobación tras recibir el archivo: el acceso o el estado pudieron cambiar.
    await this.visits.assertCanManageAttachments(actor, visitId);
    const created = await this.attachments.add({ type: 'visit', id: visitId }, toAttachmentUpload(file, body.description), attachmentActor(actor));
    response.setHeader('Location', `/api/v1/visits/${visitId}/attachments/${created.id}/content`);
    return toCommercialAttachmentDto(created);
  }

  @Get('attachments/:attachmentId/content')
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiProduces('application/octet-stream')
  @ApiOperation({
    summary: 'Descarga un adjunto de la visita',
    description: '`Content-Type` = tipo detectado al guardar, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.',
  })
  @ApiOkResponse({ description: 'Flujo binario del archivo', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  async download(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = await this.actors.fromRequest(request);
    await this.visits.assertCanViewAttachments(actor, visitId);
    return attachmentDownload(response, await this.attachments.open({ type: 'visit', id: visitId }, attachmentId));
  }

  @Delete('attachments/:attachmentId')
  @RequirePermission(VISIT_PERMISSIONS.edit)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un adjunto de la visita (lógico)', description: 'Exige poder editar la visita; no en confirmadas o canceladas. Audita `crm.attachment.removed`.' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: visita no editable por el usuario' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RECORD_READ_ONLY (visita confirmada o cancelada)' })
  async remove(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
  ): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.visits.assertCanManageAttachments(actor, visitId);
    await this.attachments.remove({ type: 'visit', id: visitId }, attachmentId, attachmentActor(actor));
  }

  @Get('events/:eventId/attachments')
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiOperation({ summary: 'Adjuntos de un evento de la visita', description: 'El evento debe ser de esa visita (`404` si no).' })
  @ApiOkResponse({ type: PaginatedAttachmentsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async listEvent(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ListCommercialAttachmentsQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<AttachmentResponseDto>> {
    const actor = await this.actors.fromRequest(request);
    await this.visits.findVisibleEvent(actor, visitId, eventId);
    const page = await this.attachments.list(eventOwner(eventId), listRequest(query));
    return PaginatedResponseDto.of(page.items.map(toCommercialAttachmentDto), page.page, page.pageSize, page.totalItems);
  }

  @Post('events/:eventId/attachments')
  @RequireAnyPermission(VISIT_PERMISSIONS.edit, VISIT_PERMISSIONS.close)
  @CommercialAttachmentOwner('visitEvent')
  @UseGuards(CommercialAttachmentWriteGuard)
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadCommercialAttachmentBodyDto })
  @ApiOperation({
    summary: 'Sube un adjunto a un evento de la visita (D-04.18)',
    description:
      'Exige `visitas.editar` **o** `visitas.cerrar` (los permisos con los que se ejecutan los eventos). Solo quien ejecutó el evento ' +
      '(`performedBy`) y en los 15 minutos siguientes a `occurredAt`; después el evento es inmutable.',
  })
  @ApiCreatedResponse({ type: AttachmentResponseDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UPLOAD_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: otro usuario (`details[0].reason = NOT_EVENT_PERFORMER`)' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RECORD_READ_ONLY: ventana de 15 minutos vencida (`details[0].reason = EVENT_ATTACHMENT_WINDOW_EXPIRED`)' })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto, description: TOO_LARGE })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: TYPE_422 })
  async uploadEvent(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: UploadCommercialAttachmentDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AttachmentResponseDto> {
    const actor = await this.actors.fromRequest(request);
    await this.visits.assertCanAttachToEvent(actor, visitId, eventId);
    const created = await this.attachments.add(eventOwner(eventId), toAttachmentUpload(file, body.description), attachmentActor(actor));
    response.setHeader('Location', `/api/v1/visits/${visitId}/events/${eventId}/attachments/${created.id}/content`);
    return toCommercialAttachmentDto(created);
  }

  @Get('events/:eventId/attachments/:attachmentId/content')
  @RequirePermission(VISIT_PERMISSIONS.view)
  @ApiProduces('application/octet-stream')
  @ApiOperation({ summary: 'Descarga un adjunto de un evento de la visita', description: 'Mismas cabeceras que la descarga de la visita.' })
  @ApiOkResponse({ description: 'Flujo binario del archivo', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  async downloadEvent(
    @Param('id', ParseUUIDPipe) visitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = await this.actors.fromRequest(request);
    await this.visits.findVisibleEvent(actor, visitId, eventId);
    return attachmentDownload(response, await this.attachments.open(eventOwner(eventId), attachmentId));
  }
}

function eventOwner(eventId: string): AttachmentOwner {
  return { type: 'visitEvent', id: eventId };
}

@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
@Controller('activities/:id/attachments')
export class ActivityAttachmentsController {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly attachments: AttachmentsService,
    private readonly actors: CommercialActorResolver,
  ) {}

  @Get()
  @RequirePermission(ACTIVITY_PERMISSIONS.view)
  @ApiOperation({ summary: 'Adjuntos de la actividad', description: 'Orden por defecto `createdAt` descendente.' })
  @ApiOkResponse({ type: PaginatedAttachmentsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async list(
    @Param('id', ParseUUIDPipe) activityId: string,
    @Query() query: ListCommercialAttachmentsQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<AttachmentResponseDto>> {
    const actor = await this.actors.fromRequest(request);
    await this.activities.assertCanViewAttachments(actor, activityId);
    const page = await this.attachments.list({ type: 'activity', id: activityId }, listRequest(query));
    return PaginatedResponseDto.of(page.items.map(toCommercialAttachmentDto), page.page, page.pageSize, page.totalItems);
  }

  @Post()
  @RequirePermission(ACTIVITY_PERMISSIONS.edit)
  @CommercialAttachmentOwner('activity')
  @UseGuards(CommercialAttachmentWriteGuard)
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadCommercialAttachmentBodyDto })
  @ApiOperation({
    summary: 'Sube un adjunto a la actividad',
    description:
      'Propia con `actividades.editar`; ajena con `actividades.administrar`. Solo actividades abiertas (completar adjunta antes de enviar la ' +
      'finalización, E.12). Tamaño máximo `crm.adjuntos.max_mb`; tipo por firma. Audita `crm.attachment.added`.',
  })
  @ApiCreatedResponse({ type: AttachmentResponseDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UPLOAD_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: actividad no editable por el usuario' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RECORD_READ_ONLY (actividad completada o cancelada)' })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto, description: TOO_LARGE })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: TYPE_422 })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
  async upload(
    @Param('id', ParseUUIDPipe) activityId: string,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: UploadCommercialAttachmentDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AttachmentResponseDto> {
    const actor = await this.actors.fromRequest(request);
    await this.activities.assertCanManageAttachments(actor, activityId);
    const created = await this.attachments.add({ type: 'activity', id: activityId }, toAttachmentUpload(file, body.description), attachmentActor(actor));
    response.setHeader('Location', `/api/v1/activities/${activityId}/attachments/${created.id}/content`);
    return toCommercialAttachmentDto(created);
  }

  @Get(':attachmentId/content')
  @RequirePermission(ACTIVITY_PERMISSIONS.view)
  @ApiProduces('application/octet-stream')
  @ApiOperation({ summary: 'Descarga un adjunto de la actividad', description: 'Mismas cabeceras que el resto de descargas (`attachment`, `nosniff`, `no-store`).' })
  @ApiOkResponse({ description: 'Flujo binario del archivo', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  async download(
    @Param('id', ParseUUIDPipe) activityId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = await this.actors.fromRequest(request);
    await this.activities.assertCanViewAttachments(actor, activityId);
    return attachmentDownload(response, await this.attachments.open({ type: 'activity', id: activityId }, attachmentId));
  }

  @Delete(':attachmentId')
  @RequirePermission(ACTIVITY_PERMISSIONS.edit)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un adjunto de la actividad (lógico)', description: 'Exige poder editar la actividad y que siga abierta. Audita `crm.attachment.removed`.' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: BAD_UUID })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: actividad no editable por el usuario' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RECORD_READ_ONLY (actividad completada o cancelada)' })
  async remove(
    @Param('id', ParseUUIDPipe) activityId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
  ): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.activities.assertCanManageAttachments(actor, activityId);
    await this.attachments.remove({ type: 'activity', id: activityId }, attachmentId, attachmentActor(actor));
  }
}
