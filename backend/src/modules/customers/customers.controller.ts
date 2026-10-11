import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
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

import { CustomerActorResolver } from './customer-actor.resolver';
import { CUSTOMER_PERMISSIONS } from './customer-access-policy';
import { toCustomerFormOptionsDto, toCustomerListItemDto, toCustomerResponseDto, toSalesOwnerOptionDto } from './customer.mapper';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CustomerFormOptionsDto,
  type CustomerListItemDto,
  CustomerResponseDto,
  ListCustomersQueryDto,
  PaginatedCustomersResponseDto,
  PaginatedSalesOwnerOptionsDto,
  PossibleDuplicateDetailDto,
  type SalesOwnerOptionDto,
  SalesOwnerOptionsQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

const VALIDATION_422 =
  'REQUIRED_FIELD_MISSING (incl. `crm.campos_obligatorios`) · INVALID_CATALOG_VALUE · INVALID_COUNTRY · INVALID_SALES_OWNER · ' +
  'INVALID_PHONE_FORMAT · INVALID_TAX_ID_FORMAT · FORMULA_NOT_ALLOWED. `details[]` trae todas las incidencias (`field`, `code`, `message`); ' +
  'el `code` de la respuesta es el de la primera.';
const CONFLICT_409 =
  'CUSTOMER_CODE_TAKEN (`details[0]`: `field`, `customerId|null`, `crmCode`, `isDeleted`) · POSSIBLE_DUPLICATE (`details[]`: `PossibleDuplicateDetailDto`, ' +
  'reenviar con `acknowledgedDuplicateIds`; incluye NIT repetido con `reason = TAX_ID`) · DUPLICATE_BLOCKED (no se puede confirmar; nunca por NIT)';

/**
 * Clientes (02 F1–F8). Sin lógica: valida la forma, resuelve el actor, delega en
 * `CustomersService` y traduce a DTO. Cada handler declara su permiso; la
 * propiedad, el alcance y los campos editables los decide el servicio
 * (`CustomerAccessPolicy`): fuera del alcance → `404`, dentro sin permiso → `403`.
 */
@ApiTags('Clientes')
@ApiBearerAuth()
@ApiExtraModels(PossibleDuplicateDetailDto)
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get()
  @RequirePermission(CUSTOMER_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F1 · Búsqueda de clientes visibles',
    description:
      'Filtros combinables (AND), siempre dentro del alcance del usuario (H.1; `access = INHERITED` si solo lo ve por un proyecto). ' +
      'Orden por defecto `legalName` ascendente. `deleted=true` (solo eliminados) exige `clientes.eliminar`.',
  })
  @ApiOkResponse({ type: PaginatedCustomersResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `sortBy` fuera de la lista blanca, `pageSize` > 100)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (también `deleted=true` sin `clientes.eliminar`)' })
  async list(@Query() query: ListCustomersQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<CustomerListItemDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.customersService.list(actor, {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
      search: query.search,
      customerCode: query.customerCode,
      crmCode: query.crmCode,
      legalName: query.legalName,
      countryId: query.countryId,
      city: query.city,
      statusId: query.statusId,
      salesOwnerId: query.salesOwnerId,
      activeOnly: query.activeOnly,
      deleted: query.deleted,
    });
    return PaginatedResponseDto.of(page.items.map(toCustomerListItemDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('form-options')
  @RequirePermission(CUSTOMER_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F2 · Opciones del formulario de cliente',
    description: 'Países, tipos de empresa, estados y calificaciones **activos**; valores por defecto, obligatorios y límites de adjuntos (D-02.1).',
  })
  @ApiOkResponse({ type: CustomerFormOptionsDto })
  async formOptions(): Promise<CustomerFormOptionsDto> {
    return toCustomerFormOptionsDto(await this.customersService.formOptions());
  }

  @Get('sales-owner-options')
  @RequirePermission(CUSTOMER_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F3 · Responsables de ventas asignables',
    description:
      'Usuarios ACTIVE con `clientes.ver` efectivo (D-02.2). Sin `clientes.administrar`, solo el propio usuario; con él, los de su alcance. Sin correo ni teléfono.',
  })
  @ApiOkResponse({ type: PaginatedSalesOwnerOptionsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async salesOwnerOptions(
    @Query() query: SalesOwnerOptionsQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<SalesOwnerOptionDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.customersService.salesOwnerOptions(actor, { page: query.page, pageSize: query.pageSize, search: query.search });
    return PaginatedResponseDto.of(page.items.map(toSalesOwnerOptionDto), page.page, page.pageSize, page.totalItems);
  }

  @Get(':id')
  @RequirePermission(CUSTOMER_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F4 · Ficha del cliente',
    description: '`capabilities` (incl. `editableFields`) sale de la misma política que hace cumplir las operaciones. `primaryContact` solo con `contactos.ver`.',
  })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `id` no es UUID' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: inexistente, fuera de alcance o eliminado sin `clientes.eliminar`' })
  async findById(@Param('id', ParseUUIDPipe) customerId: string, @Req() request: AppRequest): Promise<CustomerResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toCustomerResponseDto(await this.customersService.findById(actor, customerId));
  }

  @Post()
  @RequirePermission(CUSTOMER_PERMISSIONS.create)
  @ApiOperation({
    summary: 'F5 · Alta de cliente',
    description:
      '`crmCode` se asigna con la secuencia `crm.cliente` (`CLI-000123`). Responsable por defecto: el usuario. Audita `crm.customer.created` (`metadata.source = UI`).',
  })
  @ApiCreatedResponse({ type: CustomerResponseDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (campos con formato inválido, campos no permitidos como `crmCode`)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED · FIELD_NOT_EDITABLE (`salesOwnerId` ajeno sin `clientes.administrar`)' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: CONFLICT_409 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: VALIDATION_422 })
  async create(
    @Body() dto: CreateCustomerDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomerResponseDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.customersService.create(actor, dto);
    response.setHeader('Location', `/api/v1/customers/${view.record.id}`);
    return toCustomerResponseDto(view);
  }

  @Patch(':id')
  @RequirePermission(CUSTOMER_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F6 · Edición de cliente (incluye desactivar con `statusId`)',
    description:
      'Campo omitido = sin cambio; `null` = quitar un opcional. Propio con `clientes.editar`; ajeno (alcance directo) con `clientes.administrar`; ' +
      'heredado = solo lectura. `customerCode`, `salesOwnerId` y `countryId` exigen `clientes.administrar`. Avisos de duplicado solo por los valores que cambian ' +
      '(todos si cambia el país). Audita `crm.customer.updated` con la diferencia; sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. enviar `crmCode`)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED (cliente ajeno o heredado) · FIELD_NOT_EDITABLE (`details[].field`)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: CONFLICT_409 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: VALIDATION_422 })
  async update(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateCustomerDto,
    @Req() request: AppRequest,
  ): Promise<CustomerResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toCustomerResponseDto(await this.customersService.update(actor, customerId, dto));
  }

  @Delete(':id')
  @RequirePermission(CUSTOMER_PERMISSIONS.delete)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'F7 · Eliminación lógica del cliente',
    description: 'Conserva contactos, adjuntos e historia; el código sigue ocupado. Alcance directo. Audita `crm.customer.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: "CUSTOMER_HAS_DEPENDENCIES: `details: [{ dependency: 'projects'|'openActivities'|'pendingVisits', count }]`",
  })
  async remove(@Param('id', ParseUUIDPipe) customerId: string, @Req() request: AppRequest): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.customersService.remove(actor, customerId);
  }

  @Post(':id/restore')
  @RequirePermission(CUSTOMER_PERMISSIONS.delete)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'F8 · Restaura un cliente eliminado',
    description: 'Alcance directo. Con `unicidad_codigo = GLOBAL` revalida el código. Audita `crm.customer.restored`.',
  })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'CUSTOMER_NOT_DELETED · CUSTOMER_CODE_TAKEN' })
  async restore(@Param('id', ParseUUIDPipe) customerId: string, @Req() request: AppRequest): Promise<CustomerResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toCustomerResponseDto(await this.customersService.restore(actor, customerId));
  }
}
