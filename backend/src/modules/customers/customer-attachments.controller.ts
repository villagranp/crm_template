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
import {
  AttachmentUploadInterceptor,
  toAttachmentUpload,
  type UploadedAttachmentFile,
} from '@/modules/attachments/attachment-upload.interceptor';
import type { AttachmentOwner } from '@/modules/attachments/attachment-policy';
import { AttachmentsService } from '@/modules/attachments/attachments.service';

import { CustomerActorResolver } from './customer-actor.resolver';
import { CustomerAttachmentWriteGuard } from './customer-attachment-write.guard';
import { CUSTOMER_PERMISSIONS } from './customer-access-policy';
import { toAttachmentResponseDto } from './customer.mapper';
import { CustomersService } from './customers.service';
import {
  AttachmentResponseDto,
  ListCustomerAttachmentsQueryDto,
  PaginatedAttachmentsResponseDto,
  UploadCustomerAttachmentBodyDto,
  UploadCustomerAttachmentDto,
} from './dto/customer-attachment.dto';

const NOT_FOUND = 'RESOURCE_NOT_FOUND: cliente inexistente, fuera de alcance o eliminado; o adjunto de otro cliente o eliminado';

function customerOwner(customerId: string): AttachmentOwner {
  return { type: 'customer', id: customerId };
}

/**
 * Adjuntos del cliente (02 F17–F20, ADR-021, rutas por dueño DC-2). Este
 * controlador autoriza sobre el cliente (permiso + visibilidad → `404`, política
 * de edición → `403`) y solo entonces delega en `AttachmentsService`, que no
 * autoriza. La descarga se transmite por la API, nunca como estático.
 */
@ApiTags('Clientes · Adjuntos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
@Controller('customers/:customerId/attachments')
export class CustomerAttachmentsController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly attachments: AttachmentsService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get()
  @RequirePermission(CUSTOMER_PERMISSIONS.view)
  @ApiOperation({ summary: 'F17 · Adjuntos del cliente', description: 'Orden por defecto `createdAt` descendente. Nunca expone la clave de almacenamiento.' })
  @ApiOkResponse({ type: PaginatedAttachmentsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: ListCustomerAttachmentsQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<AttachmentResponseDto>> {
    const actor = await this.actors.fromRequest(request);
    await this.customersService.assertCanViewAttachments(actor, customerId);
    const page = await this.attachments.list(customerOwner(customerId), {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'desc',
    });
    return PaginatedResponseDto.of(page.items.map(toAttachmentResponseDto), page.page, page.pageSize, page.totalItems);
  }

  @Post()
  @RequirePermission(CUSTOMER_PERMISSIONS.edit)
  // El guard autoriza sobre el cliente (404/403) ANTES de que el interceptor lea el multipart.
  @UseGuards(CustomerAttachmentWriteGuard)
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadCustomerAttachmentBodyDto })
  @ApiOperation({
    summary: 'F18 · Sube un adjunto',
    description:
      'Un archivo en `file` y `description` opcional. Exige poder editar el cliente (RN-02.29), comprobado antes de leer el cuerpo. Tamaño máximo `crm.adjuntos.max_mb`, vigente en cada petición. Tipo por firma (PDF, JPEG, PNG, DOCX, XLSX). Audita `crm.attachment.added`.',
  })
  @ApiCreatedResponse({ type: AttachmentResponseDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED: `customerId` no es UUID, falta `file`, más de un archivo o campos extra',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: cliente no editable por el usuario' })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto, description: 'ATTACHMENT_TOO_LARGE (supera `crm.adjuntos.max_mb`). El 413 de NGINX puede llegar sin cuerpo JSON' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'ATTACHMENT_TYPE_NOT_ALLOWED' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
  async upload(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: UploadCustomerAttachmentDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AttachmentResponseDto> {
    const actor = await this.actors.fromRequest(request);
    // Segunda comprobación tras recibir el archivo: el acceso pudo cambiar durante la subida.
    await this.customersService.assertCanManageAttachments(actor, customerId);
    const created = await this.attachments.add(customerOwner(customerId), toAttachmentUpload(file, body.description), {
      userId: actor.userId,
      audit: actor.audit,
    });
    response.setHeader('Location', `/api/v1/customers/${customerId}/attachments/${created.id}/content`);
    return toAttachmentResponseDto(created);
  }

  @Get(':attachmentId/content')
  @RequirePermission(CUSTOMER_PERMISSIONS.view)
  @ApiProduces('application/octet-stream')
  @ApiOperation({
    summary: 'F19 · Descarga el binario de un adjunto',
    description:
      'Se transmite tras autorizar, con `Content-Type` = tipo detectado al guardar, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`.',
  })
  @ApiOkResponse({ description: 'Flujo binario del archivo', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `customerId` o `attachmentId` no es UUID' })
  async download(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = await this.actors.fromRequest(request);
    await this.customersService.assertCanViewAttachments(actor, customerId);
    const content = await this.attachments.open(customerOwner(customerId), attachmentId);
    return attachmentDownload(response, content);
  }

  @Delete(':attachmentId')
  @RequirePermission(CUSTOMER_PERMISSIONS.edit)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'F20 · Elimina un adjunto (lógico)', description: 'Exige poder editar el cliente. Audita `crm.attachment.removed`.' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `customerId` o `attachmentId` no es UUID' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: cliente no editable por el usuario' })
  async remove(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: AppRequest,
  ): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.customersService.assertCanManageAttachments(actor, customerId);
    await this.attachments.remove(customerOwner(customerId), attachmentId, { userId: actor.userId, audit: actor.audit });
  }
}
