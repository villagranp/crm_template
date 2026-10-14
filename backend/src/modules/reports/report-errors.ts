import { BusinessRuleViolationError, RequestValidationError } from '@/common/errors/application-error';

/**
 * Códigos de error propios de Reportes (05 F.5). `INVALID_CATALOG_SEMANTICS` y
 * `REPORT_TIMEOUT` los emite el servicio compartido de indicadores
 * (`commercial-metrics-errors.ts`); `EXPORT_TOO_LARGE` y `RATE_LIMIT_EXCEEDED` llegan
 * con la exportación (F-39).
 */
export const REPORT_ERROR_CODES = {
  periodTooLong: 'PERIOD_TOO_LONG',
} as const;

/** `400 VALIDATION_FAILED` de una regla de forma que el DTO no puede expresar sola (DC-6). */
export function reportValidationError(field: string, issue: string): RequestValidationError {
  return new RequestValidationError('Request validation failed', [{ field, issue }]);
}

/** `422 PERIOD_TOO_LONG` (C.2): el rango supera el máximo del reporte. */
export function periodTooLongError(field: string, limit: { maxYears: number } | { maxMonths: number }): BusinessRuleViolationError {
  const message = 'maxYears' in limit ? `The period cannot exceed ${limit.maxYears} years` : `The period cannot exceed ${limit.maxMonths} months`;
  return new BusinessRuleViolationError(REPORT_ERROR_CODES.periodTooLong, message, [{ field, code: REPORT_ERROR_CODES.periodTooLong, message, ...limit }]);
}
