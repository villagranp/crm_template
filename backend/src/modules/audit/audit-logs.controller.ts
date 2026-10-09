import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { EXPORT_TRUNCATED_HEADER, MAX_EXPORT_ROWS } from '@/common/csv';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { AuditQueryService } from './audit-query.service';
import { auditContextFrom } from './audit.service';
import {
  AuditEventNamesResponseDto,
  AuditLogFilterQueryDto,
  AuditLogPageResponseDto,
  type AuditLogResponseDto,
  ListAuditLogsQueryDto,
} from './dto/audit-log.dto';
import type { AuditLogRecord } from './ports/audit-query.repository.port';

/** Cabecera que indica que la exportación alcanzó el tope de filas. */

function toResponse(record: AuditLogRecord): AuditLogResponseDto {
  return {
    id: record.id,
    occurredAt: record.occurredAt.toISOString(),
    event: record.event,
    correlationId: record.correlationId,
    subjectId: record.subjectId,
    subjectEmail: record.subjectEmail,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    ipAddress: record.ipAddress,
    changes: record.changes ?? null,
    metadata: record.metadata ?? null,
  };
}

function exportFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return `auditoria-${stamp}.csv`;
}

/**
 * Bitácora de auditoría: consulta y exportación (PLAN-ADMIN, D11 y D13).
 * No hay escritura por API: los registros los deja cada caso de uso.
 */
@ApiTags('Administración · Auditoría')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  @Get()
  @RequirePermission('auditoria.ver')
  @ApiOperation({
    summary: 'Consulta paginada de la bitácora',
    description: 'Más recientes primero por defecto. `changes` y `metadata` se devuelven tal como se guardaron.',
  })
  @ApiOkResponse({ type: AuditLogPageResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Filtro inválido (fechas, orden, tamaño de página) o `from` posterior a `to`' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso auditoria.ver' })
  async list(@Query() query: ListAuditLogsQueryDto): Promise<PaginatedResponseDto<AuditLogResponseDto>> {
    const { page, pageSize, sortBy, sortOrder, ...filters } = query;
    const result = await this.auditQueryService.search(filters, { page, pageSize, sortBy, sortOrder });
    return PaginatedResponseDto.of(result.items.map(toResponse), page, pageSize, result.totalItems);
  }

  @Get('events')
  @RequirePermission('auditoria.ver')
  @ApiOperation({ summary: 'Nombres de evento registrados, para el filtro', description: 'Ordenados; como mucho 500.' })
  @ApiOkResponse({ type: AuditEventNamesResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso auditoria.ver' })
  async events(): Promise<AuditEventNamesResponseDto> {
    return { data: await this.auditQueryService.listEventNames() };
  }

  @Get('export')
  @RequirePermission('auditoria.exportar')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporta la bitácora a CSV con los filtros indicados',
    description: `Como mucho ${MAX_EXPORT_ROWS} filas, las más recientes; si se alcanza el tope responde la cabecera ${EXPORT_TRUNCATED_HEADER}: true. La exportación queda registrada como \`audit_log.exported\`.`,
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV (UTF-8 con BOM)', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Filtro inválido o `from` posterior a `to`' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso auditoria.exportar' })
  async export(
    @Query() query: AuditLogFilterQueryDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const result = await this.auditQueryService.export(query, auditContextFrom(request));

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exportFileName()}"`);
    response.setHeader(EXPORT_TRUNCATED_HEADER, String(result.truncated));
    return result.csv;
  }
}
