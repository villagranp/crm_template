import { describe, expect, it } from 'vitest';

import { ApiError, NETWORK_ERROR_CODE } from '@/services/api/api-error';

import { ADMIN_ERROR_CODES, createQueryKeys, describeApiError } from './admin-api';

function apiError(statusCode: number, code: string, details: unknown[] = []): ApiError {
  return new ApiError({ statusCode, code, message: 'texto interno del servidor', details, correlationId: 'corr-1' });
}

describe('describeApiError', () => {
  it.each([
    [409, ADMIN_ERROR_CODES.lastAdmin, 'Debe quedar al menos un administrador activo.'],
    [409, ADMIN_ERROR_CODES.selfLockout, 'No puedes suspenderte ni retirarte tu propio acceso de administración.'],
    [422, ADMIN_ERROR_CODES.routeNotRegistered, 'La ruta no corresponde a ninguna pantalla registrada.'],
    [409, ADMIN_ERROR_CODES.roleInUse, 'El rol tiene usuarios asignados. Reasígnalos antes de eliminarlo.'],
    [403, ADMIN_ERROR_CODES.adminOnly, 'Sólo un administrador puede asignar o modificar accesos.'],
  ])('traduce %i %s a un mensaje propio', (status, code, message) => {
    expect(describeApiError(apiError(status, code)).message).toBe(message);
  });

  it('tiene un mensaje específico para cada código de PLAN-ADMIN §3', () => {
    const generic = describeApiError(apiError(409, 'RESOURCE_CONFLICT')).message;
    for (const code of Object.values(ADMIN_ERROR_CODES)) {
      expect(describeApiError(apiError(409, code)).message).not.toBe(generic);
    }
  });

  it('nunca muestra el mensaje crudo del backend', () => {
    expect(describeApiError(apiError(409, 'CODIGO_DESCONOCIDO')).message).toBe(
      'El cambio entra en conflicto con el estado actual. Actualiza y vuelve a intentarlo.',
    );
    expect(describeApiError(apiError(503, 'INTERNAL_ERROR')).message).toBe(
      'Ha ocurrido un error en el servidor. Inténtalo de nuevo más tarde.',
    );
  });

  it('expone los motivos de validación de details[].issue', () => {
    const view = describeApiError(
      apiError(400, 'BAD_REQUEST', [{ issue: 'email must be an email' }, { field: 'x' }, { issue: '  ' }]),
    );

    expect(view.message).toBe('Revisa los datos del formulario.');
    expect(view.issues).toEqual(['email must be an email']);
    expect(view.correlationId).toBe('corr-1');
  });

  it('los mensajes propios de la pantalla ganan sobre los comunes', () => {
    const view = describeApiError(apiError(409, 'RESOURCE_CONFLICT'), {
      RESOURCE_CONFLICT: 'Ya existe un usuario con ese correo.',
    });

    expect(view.message).toBe('Ya existe un usuario con ese correo.');
  });

  it('distingue la falta de conexión y los errores que no son de la API', () => {
    expect(describeApiError(apiError(0, NETWORK_ERROR_CODE)).message).toMatch(/no se pudo conectar/i);
    expect(describeApiError(new Error('boom'))).toEqual({
      message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.',
      issues: [],
      code: null,
      statusCode: null,
    });
  });
});

describe('createQueryKeys', () => {
  it('anida las claves bajo admin/<área> para invalidar por prefijo', () => {
    const keys = createQueryKeys('roles');

    expect(keys.all).toEqual(['admin', 'roles']);
    expect(keys.list({ page: 1 })).toEqual(['admin', 'roles', 'list', { page: 1 }]);
    expect(keys.detail('r-1')).toEqual(['admin', 'roles', 'detail', 'r-1']);
    expect(keys.list({ page: 1 }).slice(0, keys.lists().length)).toEqual(keys.lists());
  });
});
