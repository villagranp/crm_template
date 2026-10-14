import { applyDecorators, type Type, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { XLSX_CONTENT_TYPE } from '@/common/xlsx';

import { REPORT_PERMISSIONS } from './report-context';
import { REPORT_EXPORT_THROTTLE, ReportExportThrottleGuard } from './report-export-throttle.guard';

const SCOPE_NOTE =
  'Exige `reportes.ver`. Filas, conteos y totales se calculan **después** de aplicar el alcance de `reportes.ver` ' +
  '(OWN/TEAM con subequipos/COUNTRY/ORGANIZATION y herencias DM-13, 00 §4.2); un filtro nunca amplía el alcance: ' +
  'filtrar por un asesor, país o id fuera del alcance o inexistente devuelve un conjunto vacío (RN-05.4). ' +
  'Excluye registros eliminados lógicamente y los de proyectos o clientes eliminados (RN-05.5).';

/** Decoradores comunes de los controladores de Reportes (05 F.1). */
export function ReportsController(): ClassDecorator {
  return applyDecorators(
    ApiTags('reports'),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED: sin sesión o token inválido' }),
    ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: sin `reportes.ver`' }),
    ApiServiceUnavailableResponse({ type: ErrorResponseDto, description: 'REPORT_TIMEOUT: la consulta superó el tiempo máximo; acotar los filtros' }),
  );
}

export interface ReportEndpointOptions {
  readonly summary: string;
  readonly description: string;
  readonly ok: Type<unknown>;
  /** Errores `400` propios además de la forma (`VALIDATION_FAILED`). */
  readonly badRequest?: string;
  /** `false` = sin parámetros de consulta: ni `400` ni `PERIOD_TOO_LONG` (opciones de filtro). */
  readonly withQuery?: boolean;
}

/** Handler de lectura de Reportes: permiso, operación, respuesta y errores documentados. */
export function ReportEndpoint(options: ReportEndpointOptions): MethodDecorator {
  const withQuery = options.withQuery !== false;
  const unprocessable = !withQuery
    ? 'INVALID_CATALOG_SEMANTICS: un catálogo con semántica no cumple 00 §3.3'
    : 'PERIOD_TOO_LONG (rango mayor al máximo de C.2) · INVALID_CATALOG_SEMANTICS (catálogo con semántica inválida, 00 §3.3)';
  return applyDecorators(
    RequirePermission(REPORT_PERMISSIONS.view),
    ApiOperation({ summary: options.summary, description: `${options.description}\n\n${SCOPE_NOTE}` }),
    ApiOkResponse({ type: options.ok }),
    ...(withQuery
      ? [
          ApiBadRequestResponse({
            type: ErrorResponseDto,
            description: `VALIDATION_FAILED: parámetro desconocido, UUID o enumerado inválido, más de 50 valores, \`pageSize > 100\`, \`sortBy\` fuera de la lista blanca${options.badRequest ? `, ${options.badRequest}` : ''}`,
          }),
        ]
      : []),
    ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: unprocessable }),
  );
}

export interface ReportExportEndpointOptions {
  readonly summary: string;
  readonly description: string;
  /** Errores `400` propios además de la forma. */
  readonly badRequest?: string;
}

/**
 * Handler `/export` (05 F.1, F.4): exige `reportes.ver` **y** `reportes.exportar`, limita a
 * 5 exportaciones por minuto y usuario, y documenta el binario XLSX, sus cabeceras y
 * todos los errores (400/401/403/422/429/503).
 */
export function ReportExportEndpoint(options: ReportExportEndpointOptions): MethodDecorator {
  return applyDecorators(
    RequirePermission(REPORT_PERMISSIONS.view, REPORT_PERMISSIONS.export),
    UseGuards(ReportExportThrottleGuard),
    ApiOperation({
      summary: options.summary,
      description:
        `${options.description}\n\nMismos filtros, alcance y orden que la pantalla, **sin paginación** (RN-05.44). Conjunto completo: ` +
        'si supera `crm.reportes.max_filas_exportacion` responde `422 EXPORT_TOO_LARGE` y nunca un archivo parcial (RN-05.45). ' +
        'Hojas: "Datos", "Resumen" y "Filtros" (RN-05.48); celdas tipadas y sin fórmulas (RN-05.47, RN-05.49). Cada exportación ' +
        `queda en la auditoría como \`crm.report.exported\` (RN-05.43). Máximo ${REPORT_EXPORT_THROTTLE.limit} exportaciones por minuto y usuario.\n\n${SCOPE_NOTE}`,
    }),
    ApiProduces(XLSX_CONTENT_TYPE),
    ApiOkResponse({
      description: 'Archivo XLSX (adjunto)',
      schema: { type: 'string', format: 'binary' },
      headers: {
        'Content-Disposition': { description: 'attachment; filename="reporte-<reporte>-YYYYMMDD-HHmm.xlsx"', schema: { type: 'string' } },
        'X-Export-Rows': { description: 'Filas de la hoja "Datos"', schema: { type: 'integer' } },
        'X-Export-Truncated': { description: 'Siempre `false` (RN-05.45)', schema: { type: 'string', enum: ['false'] } },
      },
    }),
    ApiBadRequestResponse({
      type: ErrorResponseDto,
      description: `VALIDATION_FAILED: parámetro desconocido (incluidos \`page\` y \`pageSize\`), \`format\` distinto de \`xlsx\`, UUID o enumerado inválido, \`sortBy\` fuera de la lista blanca${options.badRequest ? `, ${options.badRequest}` : ''}`,
    }),
    ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: sin `reportes.ver` o sin `reportes.exportar`' }),
    ApiUnprocessableEntityResponse({
      type: ErrorResponseDto,
      description:
        'EXPORT_TOO_LARGE (`details: [{ rows, maxRows }]`) · PERIOD_TOO_LONG · INVALID_CATALOG_SEMANTICS (catálogo con semántica inválida, 00 §3.3)',
    }),
    ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED: más de 5 exportaciones en un minuto (cabecera `Retry-After`)' }),
  );
}
