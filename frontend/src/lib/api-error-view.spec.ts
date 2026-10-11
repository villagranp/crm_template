import { describe, expect, it } from 'vitest';

import { ApiError, NETWORK_ERROR_CODE } from '@/services/api/api-error';

import { COMMON_ERROR_CODES, describeApiError } from './api-error-view';

function apiError(statusCode: number, code: string, details: unknown[] = []): ApiError {
  return new ApiError({ statusCode, code, message: 'texto interno del servidor', details, correlationId: 'corr-1' });
}

describe('describeApiError (común)', () => {
  it('elige el mensaje por estado cuando el código no tiene uno propio, sin mostrar el texto del backend', () => {
    expect(describeApiError(apiError(403, 'PERMISSION_DENIED')).message).toBe(
      'No tienes permiso para realizar esta acción.',
    );
    expect(describeApiError(apiError(409, 'CODIGO_DESCONOCIDO')).message).toMatch(/conflicto/);
    expect(describeApiError(apiError(502, 'HTTP_ERROR')).message).toMatch(/error en el servidor/);
    expect(describeApiError(apiError(418, 'HTTP_ERROR')).message).toMatch(/error inesperado/);
  });

  it('VALIDATION_FAILED tiene mensaje propio y expone los motivos de details[].issue', () => {
    const view = describeApiError(
      apiError(400, COMMON_ERROR_CODES.validationFailed, [{ field: 'email', issue: 'email must be an email' }]),
    );

    expect(view).toEqual({
      message: 'Revisa los datos del formulario.',
      issues: ['email must be an email'],
      code: 'VALIDATION_FAILED',
      statusCode: 400,
      correlationId: 'corr-1',
    });
  });

  it('los mensajes del área ganan sobre los comunes', () => {
    expect(
      describeApiError(apiError(409, 'CUSTOMER_CODE_TAKEN'), {
        CUSTOMER_CODE_TAKEN: 'Ya existe un cliente con ese código.',
      }).message,
    ).toBe('Ya existe un cliente con ese código.');
  });

  it('no conoce los códigos de la administración (los aporta su área)', () => {
    expect(describeApiError(apiError(409, 'LAST_ADMIN')).message).toMatch(/conflicto/);
  });

  it('distingue la falta de conexión y los errores que no son de la API', () => {
    expect(describeApiError(apiError(0, NETWORK_ERROR_CODE)).message).toMatch(/no se pudo conectar/i);
    expect(describeApiError(new Error('boom')).code).toBeNull();
  });
});
