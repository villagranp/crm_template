import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/api-error';

import { describeReportError, exportTooLargeDetails, reportErrorMessage, waitText } from './reports.errors';

function apiError(statusCode: number, code: string, details: unknown[] = [], retryAfterSeconds?: number) {
  return new ApiError({ statusCode, code, message: 'backend', details, correlationId: 'corr-1' }, { retryAfterSeconds });
}

describe('reports.errors (05 F.5)', () => {
  it('EXPORT_TOO_LARGE: mensaje en español con N y M y la referencia (E.1, PF-05.35)', () => {
    const error = apiError(422, 'EXPORT_TOO_LARGE', [{ rows: 123456, maxRows: 100000 }]);

    expect(exportTooLargeDetails(error)).toEqual({ rows: 123456, maxRows: 100000 });
    expect(reportErrorMessage(error)).toBe(
      'El resultado tiene 123,456 filas y el máximo exportable es 100,000. Acota los filtros. Referencia: corr-1',
    );
  });

  it('REPORT_TIMEOUT pide acotar los filtros; nunca muestra el mensaje del backend', () => {
    const view = describeReportError(apiError(503, 'REPORT_TIMEOUT'));
    expect(view.message).toMatch(/Acota los filtros/);
    expect(view.message).not.toMatch(/backend/);
    expect(view.correlationId).toBe('corr-1');
  });

  it('PERIOD_TOO_LONG con el límite del detalle (años o meses)', () => {
    expect(describeReportError(apiError(422, 'PERIOD_TOO_LONG', [{ field: 'to', maxYears: 5 }])).message).toBe(
      'El período no puede superar 5 años en este reporte. Elige un rango más corto.',
    );
    expect(describeReportError(apiError(422, 'PERIOD_TOO_LONG', [{ field: 'toMonth', maxMonths: 24 }])).message).toBe(
      'El período no puede superar 24 meses en este reporte. Elige un rango más corto.',
    );
  });

  it('429 con Retry-After indica cuánto esperar', () => {
    expect(describeReportError(apiError(429, 'RATE_LIMIT_EXCEEDED', [], 37)).message).toBe(
      'Has hecho demasiadas exportaciones seguidas. Vuelve a intentarlo en 37 segundos.',
    );
    expect(describeReportError(apiError(429, 'RATE_LIMIT_EXCEEDED')).message).toMatch(/Espera un momento/);
    expect(waitText(1)).toBe('1 segundo');
    expect(waitText(90)).toBe('2 minutos');
  });

  it('un error que no es de la API usa el mensaje genérico', () => {
    expect(reportErrorMessage(new Error('x'))).toBe('Ha ocurrido un error inesperado. Inténtalo de nuevo.');
  });
});
