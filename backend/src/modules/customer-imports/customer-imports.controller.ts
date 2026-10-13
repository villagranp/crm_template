import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { contentDispositionAttachment } from '@/modules/attachments/attachment-download';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import { IMPORT_PERMISSIONS } from './customer-import-access-policy';
import { toPaginatedImportsDto, toPaginatedRowsDto, toResponseDto, toSettingsDto } from './customer-import.mapper';
import { CustomerImportUploadInterceptor, importUploadValidationError, type UploadedImportMulterFile } from './customer-import-upload.interceptor';
import { CustomerImportsService } from './customer-imports.service';
import {
  ConfirmCustomerImportDto,
  CustomerImportQueryDto,
  CustomerImportResponseDto,
  CustomerImportRowQueryDto,
  CustomerImportSettingsResponseDto,
  CustomerImportTemplateQueryDto,
  PaginatedCustomerImportRowsDto,
  PaginatedCustomerImportsDto,
} from './dto/customer-import.dto';
import type { ErrorFile } from './error-file';

/** Límites específicos por ruta (06 H.5), además del global y del `limit_req` de NGINX. */
const UPLOAD_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
const CONFIRM_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const DOWNLOAD_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

const IMPORT_NOT_FOUND = 'RESOURCE_NOT_FOUND: carga inexistente o de otro usuario sin alcance `ORGANIZATION` de `importaciones.ver` (mismo cuerpo en ambos casos)';
const UUID_400 = 'BAD_REQUEST: el id no es UUID (`ParseUUIDPipe`) · VALIDATION_FAILED: la consulta o el cuerpo no cumplen el DTO (campos extra incluidos)';
const DISABLED_409 = 'IMPORTS_DISABLED: `crm.importaciones.habilitada = false` (RN-06.1)';
const STATUS_409 = 'INVALID_IMPORT_STATUS: la carga no está `VALIDATED` (ya confirmada, cancelada o terminada; `details[0].status`)';
const MANAGE_403 =
  'PERMISSION_DENIED: falta el permiso del endpoint, o la carga es de otro usuario y el alcance de `importaciones.crear` no es `ORGANIZATION` (RN-06.19)';

function sendFile(response: Response, file: ErrorFile): StreamableFile {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(file.content, { type: file.contentType, length: file.content.length, disposition: contentDispositionAttachment(file.fileName) });
}

function importLocation(id: string): string {
  return `/api/v1/customer-imports/${id}`;
}

/**
 * Carga masiva de clientes (06 F.1, F-42). Sin lógica: forma, actor, delega y
 * mapea a DTO. Las rutas literales (`settings`, `template`) van antes de `:id`.
 * La visibilidad (H.4) y la autoría (RN-06.19) las decide el servicio.
 */
@ApiTags('Carga masiva de clientes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED: sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('customer-imports')
export class CustomerImportsController {
  constructor(
    private readonly imports: CustomerImportsService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get('settings')
  @RequirePermission(IMPORT_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-42 · Habilitación, límites efectivos y columnas de la plantilla', description: '`isRequired` sale de `crm.campos_obligatorios` y de las reglas del Módulo 2.' })
  @ApiOkResponse({ type: CustomerImportSettingsResponseDto })
  async settings(): Promise<CustomerImportSettingsResponseDto> {
    return toSettingsDto(await this.imports.settings());
  }

  @Get('template')
  @RequirePermission(IMPORT_PERMISSIONS.create)
  @Throttle(DOWNLOAD_THROTTLE)
  @ApiOperation({
    summary: 'F-42 · Descargar la plantilla (CSV o XLSX)',
    description:
      'CSV: BOM UTF-8 y encabezados. XLSX: hojas `Clientes`, `Instrucciones` y `Valores válidos` (elementos activos leídos de la base). ' +
      'Nombre `plantilla-clientes-v<versión>.<ext>`; `Cache-Control: no-store`.',
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `format` distinto de `CSV` o `XLSX`' })
  async template(@Query() query: CustomerImportTemplateQueryDto, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return sendFile(response, await this.imports.template(query.format));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(IMPORT_PERMISSIONS.create, IMPORT_PERMISSIONS.customersCreate)
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(CustomerImportUploadInterceptor)
  @ApiOperation({
    summary: 'F-42 · Subir, leer y validar un archivo',
    description:
      'Un único campo `file` (`.csv` UTF-8 o `.xlsx`). Proceso síncrono: tipo real por firma → estructura y columnas → validación de cada fila con las reglas del Módulo 2 → `VALIDATED`. ' +
      'Las filas inválidas **no** son un error HTTP: se ven en `/rows`. Un archivo rechazado por estructura queda en el historial como `FAILED`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ type: CustomerImportResponseDto, description: '`Location: /api/v1/customer-imports/{id}`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: falta `file`, más de un archivo o campos extra (`details[0].field = "file"`)' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta `importaciones.crear` o `clientes.crear`' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: `${DISABLED_409} · IMPORT_IN_PROGRESS: el usuario ya tiene una carga validándose o importándose` })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto, description: 'FILE_TOO_LARGE: supera `crm.importaciones.max_mb` (NGINX responde 413 sin cuerpo JSON por encima de 10 MB)' })
  @ApiUnsupportedMediaTypeResponse({
    type: ErrorResponseDto,
    description: 'UNSUPPORTED_FILE_TYPE: extensión distinta de `.csv`/`.xlsx`, tipo real incoherente, `.xls`, XLSX cifrada o con macros, binario renombrado',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'INVALID_IMPORT_FILE: `details[]` = `{ field: "file" | "columns" | "rows", issue, column? }` con `issue` ∈ MISSING_COLUMN, UNKNOWN_COLUMN, DUPLICATE_COLUMN, TOO_MANY_COLUMNS, ' +
      'EMPTY_FILE, NO_DATA_ROWS, TOO_MANY_ROWS, INVALID_ENCODING, MALFORMED_CSV, SHEET_NOT_FOUND, ARCHIVE_LIMITS_EXCEEDED, UNSAFE_CONTENT, UNREADABLE_FILE, PARSE_TIMEOUT',
  })
  async upload(
    @UploadedFile() file: UploadedImportMulterFile | undefined,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomerImportResponseDto> {
    if (!file || !Buffer.isBuffer(file.buffer)) throw importUploadValidationError('A file is required');
    const actor = await this.actors.fromRequest(request);
    const view = await this.imports.upload(actor, { buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, size: file.size });
    response.setHeader('Location', importLocation(view.record.id));
    return toResponseDto(view);
  }

  @Get()
  @RequirePermission(IMPORT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-42 · Historial de cargas',
    description: 'Las propias; todas con alcance `ORGANIZATION` de `importaciones.ver`. `search` abarca código y nombre de archivo.',
  })
  @ApiOkResponse({ type: PaginatedCustomerImportsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: filtro u orden inválido (`sortBy` fuera de la lista blanca, `pageSize` > 100, fecha no ISO 8601)' })
  async list(@Query() query: CustomerImportQueryDto, @Req() request: AppRequest): Promise<PaginatedCustomerImportsDto> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.imports.search(actor, {
      page: query.page,
      pageSize: query.pageSize,
      sortOrder: query.sortOrder,
      ...(query.sortBy ? { sortBy: query.sortBy } : {}),
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.createdFrom ? { createdFrom: new Date(query.createdFrom) } : {}),
      ...(query.createdTo ? { createdTo: new Date(query.createdTo) } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.startedById ? { startedById: query.startedById } : {}),
    });
    return toPaginatedImportsDto(page);
  }

  @Get(':id')
  @RequirePermission(IMPORT_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-42 · Resumen y resultado de una carga', description: 'Una carga activa sin señal de vida durante 15 minutos se marca `FAILED (PROCESS_INTERRUPTED)` antes de responder (RN-06.24).' })
  @ApiOkResponse({ type: CustomerImportResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: IMPORT_NOT_FOUND })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() request: AppRequest): Promise<CustomerImportResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toResponseDto(await this.imports.findById(actor, id));
  }

  @Get(':id/rows')
  @RequirePermission(IMPORT_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-42 · Vista previa y errores por fila', description: 'Orden fijo por `rowNumber`. `duplicateOfCustomer` solo si el usuario ve ese cliente (H.4).' })
  @ApiOkResponse({ type: PaginatedCustomerImportRowsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: IMPORT_NOT_FOUND })
  async rows(@Param('id', ParseUUIDPipe) id: string, @Query() query: CustomerImportRowQueryDto, @Req() request: AppRequest): Promise<PaginatedCustomerImportRowsDto> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.imports.rows(actor, id, {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.hasWarnings !== undefined ? { hasWarnings: query.hasWarnings } : {}),
    });
    return toPaginatedRowsDto(page);
  }

  @Post(':id/confirmation')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission(IMPORT_PERMISSIONS.create, IMPORT_PERMISSIONS.customersCreate)
  @Throttle(CONFIRM_THROTTLE)
  @ApiOperation({
    summary: 'F-42 · Confirmar e importar',
    description:
      'Transición atómica `VALIDATED → IMPORTING`; responde `202` y procesa en segundo plano, una transacción por fila con el alta del Módulo 2. ' +
      'Consultar `GET /customer-imports/{id}` hasta el estado final.',
  })
  @ApiAcceptedResponse({ type: CustomerImportResponseDto, description: '`Location: /api/v1/customer-imports/{id}`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: MANAGE_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: IMPORT_NOT_FOUND })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: `${DISABLED_409} · ${STATUS_409} · IMPORT_CHANGED: \`expectedValidRows\` no coincide (\`details[0].validRows\`) · IMPORT_DATA_PURGED: los datos de las filas se purgaron`,
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'NO_VALID_ROWS: la carga no tiene filas válidas' })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConfirmCustomerImportDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomerImportResponseDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.imports.confirm(actor, id, { expectedValidRows: body.expectedValidRows, includeRowsWithWarnings: body.includeRowsWithWarnings });
    response.setHeader('Location', importLocation(id));
    return toResponseDto(view);
  }

  @Post(':id/cancellation')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(IMPORT_PERMISSIONS.create)
  @ApiOperation({ summary: 'F-42 · Cancelar una carga validada', description: 'Sin cuerpo. No se crea ningún cliente y la carga ya no puede confirmarse.' })
  @ApiOkResponse({ type: CustomerImportResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: MANAGE_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: IMPORT_NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: `${DISABLED_409} · ${STATUS_409}` })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Req() request: AppRequest): Promise<CustomerImportResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toResponseDto(await this.imports.cancel(actor, id));
  }

  @Get(':id/error-file')
  @RequirePermission(IMPORT_PERMISSIONS.view)
  @Throttle(DOWNLOAD_THROTTLE)
  @ApiOperation({
    summary: 'F-42 · Archivo de errores',
    description:
      'Filas no importadas con sus valores originales, estado y errores, en el formato de la carga; celdas neutralizadas contra fórmulas. ' +
      '`errores-<código>.<ext>`, `Cache-Control: no-store`. La descarga se audita.',
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: `${IMPORT_NOT_FOUND} · también si no hay filas no importadas` })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'IMPORT_DATA_PURGED: los datos de las filas se purgaron por retención' })
  async errorFile(@Param('id', ParseUUIDPipe) id: string, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const actor = await this.actors.fromRequest(request);
    return sendFile(response, await this.imports.errorFile(actor, id));
  }
}
