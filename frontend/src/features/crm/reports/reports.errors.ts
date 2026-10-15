import { describeApiError, type ApiErrorView } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

/**
 * Mensajes en español de los códigos de Reportes (05 F.5) para `describeApiError`. Nunca se
 * muestra el `message` del backend; el `correlationId` se añade como "Referencia" para soporte.
 */

export const REPORT_ERROR_CODES = {
  reportTimeout: 'REPORT_TIMEOUT',
  periodTooLong: 'PERIOD_TOO_LONG',
  exportTooLarge: 'EXPORT_TOO_LARGE',
  rateLimitExceeded: 'RATE_LIMIT_EXCEEDED',
  invalidCatalogSemantics: 'INVALID_CATALOG_SEMANTICS',
  permissionDenied: 'PERMISSION_DENIED',
} as const;

const CODES = REPORT_ERROR_CODES;

export const REPORT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.reportTimeout]: 'La consulta tardó demasiado. Acota los filtros (por ejemplo, un período más corto) y vuelve a intentarlo.',
  [CODES.periodTooLong]: 'El período es demasiado largo para este reporte. Elige un rango más corto.',
  [CODES.exportTooLarge]: 'El resultado es demasiado grande para exportarlo. Acota los filtros.',
  [CODES.rateLimitExceeded]: 'Has hecho demasiadas exportaciones seguidas. Espera un momento antes de volver a intentarlo.',
  [CODES.invalidCatalogSemantics]:
    'La configuración de los catálogos comerciales está incompleta y el reporte no puede calcularse. Avisa al administrador.',
  [CODES.permissionDenied]: 'No tienes permiso para consultar o exportar este reporte.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `{ rows, maxRows }` de un `422 EXPORT_TOO_LARGE` (05 F.4), o `null` si no viene completo. */
export function exportTooLargeDetails(error: unknown): { rows: number; maxRows: number } | null {
  if (!(error instanceof ApiError) || error.code !== CODES.exportTooLarge) {
    return null;
  }
  const detail = error.details.find(isRecord);
  return detail && typeof detail.rows === 'number' && typeof detail.maxRows === 'number' ? { rows: detail.rows, maxRows: detail.maxRows } : null;
}

/** Límite de un `422 PERIOD_TOO_LONG` (`maxYears` o `maxMonths`, P-05.4). */
function periodLimitText(error: ApiError): string | null {
  const detail = error.details.find(isRecord);
  if (detail && typeof detail.maxYears === 'number') {
    return `${detail.maxYears} años`;
  }
  if (detail && typeof detail.maxMonths === 'number') {
    return `${detail.maxMonths} meses`;
  }
  return null;
}

const COUNT_FORMAT = new Intl.NumberFormat('es-GT');

/** Segundos legibles para el `Retry-After` de un `429` ("45 segundos", "2 minutos"). */
export function waitText(seconds: number): string {
  if (seconds < 60) {
    return seconds === 1 ? '1 segundo' : `${seconds} segundos`;
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

/**
 * Mensaje de un error de Reportes con los datos que trae el propio error: N y M de
 * `EXPORT_TOO_LARGE` (E.1), el límite de `PERIOD_TOO_LONG` y la espera de `Retry-After`.
 */
export function describeReportError(error: unknown): ApiErrorView {
  const view = describeApiError(error, REPORT_ERROR_MESSAGES);
  if (!(error instanceof ApiError)) {
    return view;
  }
  const tooLarge = exportTooLargeDetails(error);
  if (tooLarge) {
    return {
      ...view,
      message: `El resultado tiene ${COUNT_FORMAT.format(tooLarge.rows)} filas y el máximo exportable es ${COUNT_FORMAT.format(tooLarge.maxRows)}. Acota los filtros.`,
    };
  }
  if (error.code === CODES.periodTooLong) {
    const limit = periodLimitText(error);
    return limit ? { ...view, message: `El período no puede superar ${limit} en este reporte. Elige un rango más corto.` } : view;
  }
  if (error.statusCode === 429 && error.retryAfterSeconds !== undefined) {
    return { ...view, message: `Has hecho demasiadas exportaciones seguidas. Vuelve a intentarlo en ${waitText(error.retryAfterSeconds)}.` };
  }
  return view;
}

/** Mensaje con la referencia para soporte (`correlationId`). */
export function withReference(view: ApiErrorView): string {
  return view.correlationId ? `${view.message} Referencia: ${view.correlationId}` : view.message;
}

/** Mensaje final (con referencia) de cualquier error de una consulta o exportación de Reportes. */
export function reportErrorMessage(error: unknown): string {
  return withReference(describeReportError(error));
}
