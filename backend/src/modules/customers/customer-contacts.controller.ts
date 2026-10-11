import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
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

import { ContactsService } from './contacts.service';
import { CustomerActorResolver } from './customer-actor.resolver';
import { CONTACT_PERMISSIONS } from './customer-access-policy';
import { toContactResponseDto } from './customer.mapper';
import { contactFullName } from './customer-normalization';
import {
  ContactResponseDto,
  CreateContactDto,
  ListContactsQueryDto,
  PaginatedContactsResponseDto,
  PrimaryContactResponseDto,
  SetPrimaryContactDto,
  UpdateContactDto,
} from './dto/contact.dto';

const NOT_FOUND = 'RESOURCE_NOT_FOUND: cliente inexistente, fuera de alcance o eliminado; o contacto de otro cliente';
const NOT_WRITABLE = 'PERMISSION_DENIED: falta el permiso o el cliente no es editable por el usuario (ajeno sin `clientes.administrar`, o heredado)';
const DUPLICATES =
  "CONTACT_EMAIL_TAKEN (`details[0]`: `field = email`, `contactId`, `isDeleted`) · POSSIBLE_DUPLICATE (`details[]`: `{ rule, reason: 'FULL_NAME'|'PHONE', " +
  'candidate: { id, fullName, jobTitle, isDeleted } }`, reenviar con `acknowledgedDuplicateIds`) · DUPLICATE_BLOCKED';

/**
 * Contactos del cliente y contacto principal (02 F9–F16). El cliente sale de la
 * ruta (nunca del cuerpo). Datos personales: solo con `contactos.ver` y cliente visible.
 */
@ApiTags('Clientes · Contactos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: NOT_FOUND })
@Controller('customers/:customerId')
export class CustomerContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get('contacts')
  @RequirePermission(CONTACT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F9 · Contactos del cliente',
    description:
      '`search` en nombre, apellidos, correo y cargo. `status` por defecto `ACTIVE`. Orden por defecto `lastName` ascendente. `deleted=true` exige `contactos.eliminar`.',
  })
  @ApiOkResponse({ type: PaginatedContactsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: ListContactsQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<ContactResponseDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.contactsService.list(actor, customerId, {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
      search: query.search,
      status: query.status,
      deleted: query.deleted,
    });
    return PaginatedResponseDto.of(page.items.map(toContactResponseDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('contacts/:contactId')
  @RequirePermission(CONTACT_PERMISSIONS.view)
  @ApiOperation({ summary: 'F10 · Detalle de un contacto' })
  @ApiOkResponse({ type: ContactResponseDto })
  async findById(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Req() request: AppRequest,
  ): Promise<ContactResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toContactResponseDto(await this.contactsService.findById(actor, customerId, contactId));
  }

  @Post('contacts')
  @RequirePermission(CONTACT_PERMISSIONS.create)
  @ApiOperation({
    summary: 'F11 · Alta de contacto',
    description: '`isActive` por defecto `true`. `isPrimary` sustituye al principal anterior. Audita `crm.contact.created` con PII enmascarada.',
  })
  @ApiCreatedResponse({ type: ContactResponseDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `customerId` en el cuerpo)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: NOT_WRITABLE })
  @ApiConflictResponse({ type: ErrorResponseDto, description: DUPLICATES })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_PHONE_FORMAT · CONTACT_INACTIVE (inactivo marcado como principal)' })
  async create(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateContactDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ContactResponseDto> {
    const actor = await this.actors.fromRequest(request);
    const contact = await this.contactsService.create(actor, customerId, dto);
    response.setHeader('Location', `/api/v1/customers/${customerId}/contacts/${contact.id}`);
    return toContactResponseDto(contact);
  }

  @Patch('contacts/:contactId')
  @RequirePermission(CONTACT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F12 · Edición de contacto (incluye activar/desactivar)',
    description:
      'Desactivar el principal deja al cliente sin principal en la misma operación. Audita `crm.contact.updated` y, si cambia el estado, `crm.contact.activated|deactivated`.',
  })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `isPrimary`: el principal se cambia con F13/F14)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: NOT_WRITABLE })
  @ApiConflictResponse({ type: ErrorResponseDto, description: DUPLICATES })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_PHONE_FORMAT' })
  async update(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactDto,
    @Req() request: AppRequest,
  ): Promise<ContactResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toContactResponseDto(await this.contactsService.update(actor, customerId, contactId, dto));
  }

  @Put('primary-contact')
  @RequirePermission(CONTACT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F13 · Elige el contacto principal',
    description: 'Sustituye al anterior (como máximo uno). Audita `crm.customer.primary_contact_changed`.',
  })
  @ApiOkResponse({ type: PrimaryContactResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: NOT_WRITABLE })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'CONTACT_INACTIVE' })
  async setPrimary(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: SetPrimaryContactDto,
    @Req() request: AppRequest,
  ): Promise<PrimaryContactResponseDto> {
    const actor = await this.actors.fromRequest(request);
    const contact = await this.contactsService.setPrimary(actor, customerId, dto.contactId);
    return { primaryContact: { id: contact.id, fullName: contactFullName(contact.firstName, contact.lastName) } };
  }

  @Delete('primary-contact')
  @RequirePermission(CONTACT_PERMISSIONS.edit)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'F14 · Quita el contacto principal', description: 'Audita `crm.customer.primary_contact_changed` si había uno.' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: NOT_WRITABLE })
  async clearPrimary(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: AppRequest): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.contactsService.clearPrimary(actor, customerId);
  }

  @Delete('contacts/:contactId')
  @RequirePermission(CONTACT_PERMISSIONS.delete)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'F15 · Eliminación lógica de un contacto',
    description: 'Si era el principal, el cliente queda sin principal en la misma operación. Audita `crm.contact.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: NOT_WRITABLE })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'CONTACT_HAS_HISTORY: participa en visitas o actividades; desactivarlo con F12' })
  async remove(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Req() request: AppRequest,
  ): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.contactsService.remove(actor, customerId, contactId);
  }

  @Post('contacts/:contactId/restore')
  @RequirePermission(CONTACT_PERMISSIONS.delete)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'F16 · Restaura un contacto eliminado', description: 'Audita `crm.contact.restored`.' })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: NOT_WRITABLE })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'CONTACT_NOT_DELETED · CONTACT_EMAIL_TAKEN' })
  async restore(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Req() request: AppRequest,
  ): Promise<ContactResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toContactResponseDto(await this.contactsService.restore(actor, customerId, contactId));
  }
}
