import { describe, expect, it } from 'vitest';

import { describeApiError } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

import {
  COMMERCIAL_ERROR_MESSAGES,
  commercialFieldErrors,
  hasCommercialErrorCode,
  isNotFoundError,
  withReference,
} from './commercial-activity.errors';

function apiError(statusCode: number, code: string, details: unknown[] = []): ApiError {
  return new ApiError({ statusCode, code, message: 'backend message', details, correlationId: 'corr-1' });
}

describe('commercial-activity.errors (04 §F.5)', () => {
  it('traduce los códigos del módulo sin mostrar el mensaje del backend', () => {
    const view = describeApiError(apiError(403, 'VISIT_CONFIRMATION_OWNER_ONLY'), COMMERCIAL_ERROR_MESSAGES);
    expect(view.message).toBe('Solo el asesor dueño de la visita puede confirmarla.');
    expect(withReference(view)).toBe('Solo el asesor dueño de la visita puede confirmarla. Referencia: corr-1');
    expect(describeApiError(apiError(422, 'RESULT_REQUIRED'), COMMERCIAL_ERROR_MESSAGES).message).toBe(
      'Indica un resultado, de la lista o en notas.',
    );
  });

  it('pinta cada incidencia bajo su campo con su propio código, agrupando rutas anidadas', () => {
    const error = apiError(422, 'REQUIRED_FIELD_MISSING', [
      { field: 'subject', code: 'REQUIRED_FIELD_MISSING' },
      { field: 'durationMinutes', code: 'FIELD_NOT_APPLICABLE' },
      { field: 'participants.0.contactId', code: 'INVALID_CONTACT' },
      { field: 'participants.1.contactId', code: 'CONTACT_INACTIVE' },
      { issue: 'sin campo' },
    ]);
    expect(commercialFieldErrors(error)).toEqual({
      subject: 'Este campo es obligatorio.',
      durationMinutes: 'No aplica a este tipo de actividad.',
      participants: 'Algún contacto no pertenece a este cliente.',
    });
    expect(commercialFieldErrors(new Error('x'))).toEqual({});
  });

  it('reconoce el código y el 404', () => {
    expect(hasCommercialErrorCode(apiError(409, 'RECORD_READ_ONLY'), 'RECORD_READ_ONLY')).toBe(true);
    expect(hasCommercialErrorCode(new Error('x'), 'RECORD_READ_ONLY')).toBe(false);
    expect(isNotFoundError(apiError(404, 'RESOURCE_NOT_FOUND'))).toBe(true);
    expect(isNotFoundError(apiError(403, 'PERMISSION_DENIED'))).toBe(false);
  });
});
