import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';

import { REPORT_PERMISSIONS } from './report-context';

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
