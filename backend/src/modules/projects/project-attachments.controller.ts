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

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { attachmentDownload } from '@/modules/attachments/attachment-download';
import type { AttachmentOwner } from '@/modules/attachments/attachment-policy';
import { AttachmentUploadInterceptor, toAttachmentUpload, type UploadedAttachmentFile } from '@/modules/attachments/attachment-upload.interceptor';
import { AttachmentsService } from '@/modules/attachments/attachments.service';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';
import { toAttachmentResponseDto } from '@/modules/customers/customer.mapper';
import { AttachmentResponseDto, PaginatedAttachmentsResponseDto } from '@/modules/customers/dto/customer-attachment.dto';

import { ListProjectAttachmentsQueryDto, UploadProjectAttachmentBodyDto, UploadProjectAttachmentDto } from './dto/project-subresources.dto';
import { ProjectAttachmentWriteGuard } from './project-attachment-write.guard';
import { PROJECT_PERMISSIONS } from './project-constants';
import { ProjectsService } from './projects.service';

const NOT_FOUND = 'RESOURCE_NOT_FOUND: proyecto inexistente, eliminado o fuera de alcance; o adjunto de otro proyecto o eliminado';
const EDIT_403 = 'PERMISSION_DENIED: proyecto no editable por el usuario (propio con `proyectos.editar`, ajeno con `proyectos.administrar`)';

function projectOwner(projectId: string): AttachmentOwner {
  return { type: 'project', id: projectId };
}

/**
 * Adjuntos del proyecto (03 F.1, ADR-021, rutas por dueño DC-2). Este controlador
 * autoriza sobre el proyecto (permiso + visibilidad → `404`, política de edición →
 * `403`) y solo entonces delega en `AttachmentsService`, que no autoriza. La descarga
 * se transmite por la API, nunca como estático.
 */
@ApiTags('Proyectos · Adjuntos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('projects/:id/attachments')
export class ProjectAttachmentsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly attachments: AttachmentsService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get()
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-11 · Adjuntos del proyecto', description: 'Orden por defecto `createdAt` descendente. Nunca expone la clave de almacenamiento.' })
  @ApiOkResponse({ type: PaginatedAttachmentsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async list(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Query() query: ListProjectAttachmentsQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<AttachmentResponseDto>> {
    const actor = await this.actors.fromRequest(request);
    await this.projects.assertCanViewAttachments(actor, projectId);
    const page = await this.attachments.list(projectOwner(projectId), {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'desc',
    });
    return PaginatedResponseDto.of(page.items.map(toAttachmentResponseDto), page.page, page.pageSize, page.totalItems);
  }

  @Post()
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  // El guard autoriza sobre el proyecto (404/403) ANTES de que el interceptor lea el multipart.
  @UseGuards(ProjectAttachmentWriteGuard)
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadProjectAttachmentBodyDto })
  @ApiOperation({
    summary: 'F-10/F-11 · Sube un adjunto',
    description:
      'Un archivo en `file` y `description` opcional (≤ 300). Exige poder editar el proyecto, comprobado antes de leer el cuerpo. Tamaño máximo `crm.adjuntos.max_mb`; ' +
      'tipo por firma (PDF, JPEG, PNG, DOCX, XLSX); clave `<año>/<mes>/<uuid>`. Audita `crm.attachment.added` y actualiza `lastActivityAt`.',
  })
  @ApiCreatedResponse({ type: AttachmentResponseDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'BAD_REQUEST: `id` no es UUID · VALIDATION_FAILED: falta `file`, más de un archivo o campos extra' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto, description: 'ATTACHMENT_TOO_LARGE (supera `crm.adjuntos.max_mb`). El 413 de NGINX puede llegar sin cuerpo JSON' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'ATTACHMENT_TYPE_NOT_ALLOWED' })
  async upload(
    @Param('id', ParseUUIDPipe) projectId: string,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: UploadProjectAttachmentDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AttachmentResponseDto> {
    const actor = await this.actors.fromRequest(request);
    // Segunda comprobación tras recibir el archivo: el acceso pudo cambiar durante la subida.
    await this.projects.assertCanManageAttachments(actor, projectId);
    const created = await this.attachments.add(projectOwner(projectId), toAttachmentUpload(file, body.description), {
      userId: actor.userId,
      audit: actor.audit,
    });
    await this.projects.touchAfterAttachmentChange(projectId);
    response.setHeader('Location', `/api/v1/projects/${projectId}/attachments/${created.id}/content`);
    return toAttachmentResponseDto(created);
  }

  @Get(':attachmentId/content')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiProduces('application/octet-stream')
  @ApiOperation({
    summary: 'F-11 · Descarga el binario de un adjunto',
    description:
      'Se transmite tras autorizar, con `Content-Type` guardado, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`.',
  })
  @ApiOkResponse({ description: 'Flujo binario del archivo', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'BAD_REQUEST: `id` o `attachmentId` no es UUID' })
  async download(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = await this.actors.fromRequest(request);
    await this.projects.assertCanViewAttachments(actor, projectId);
    const content = await this.attachments.open(projectOwner(projectId), attachmentId);
    return attachmentDownload(response, content);
  }

  @Delete(':attachmentId')
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'F-11 · Elimina un adjunto (lógico)', description: 'Exige poder editar el proyecto. Audita `crm.attachment.removed` y actualiza `lastActivityAt`.' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'BAD_REQUEST: `id` o `attachmentId` no es UUID' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  async remove(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
  ): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.projects.assertCanManageAttachments(actor, projectId);
    await this.attachments.remove(projectOwner(projectId), attachmentId, { userId: actor.userId, audit: actor.audit });
    await this.projects.touchAfterAttachmentChange(projectId);
  }
}
