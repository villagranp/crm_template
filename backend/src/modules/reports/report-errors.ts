import { BusinessRuleViolationError, RequestValidationError } from '@/common/errors/application-error';

/**
 * Códigos de error propios de Reportes (05 F.5). `INVALID_CATALOG_SEMANTICS` y
 * `REPORT_TIMEOUT` los emite el servicio compartido de indicadores
 * (`commercial-metrics-errors.ts`); `RATE_LIMIT_EXCEEDED` lo emite el limitador de la
 * exportación (`report-export-throttle.guard.ts`).
 */
export const REPORT_ERROR_CODES = {
  periodTooLong: 'PERIOD_TOO_LONG',
  exportTooLarge: 'EXPORT_TOO_LARGE',
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

/** `422 EXPORT_TOO_LARGE` (RN-05.45): el conjunto supera `crm.reportes.max_filas_exportacion`; nunca un archivo parcial. */
export function exportTooLargeError(rows: number, maxRows: number): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    REPORT_ERROR_CODES.exportTooLarge,
    `The result has ${rows} rows and the export limit is ${maxRows}; narrow the filters`,
    [{ rows, maxRows }],
  );
}
