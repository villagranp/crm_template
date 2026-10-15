import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api';

import { formatCountry, userErrorMessages, USER_ERRORS } from './users-format';

function apiError(statusCode: number, code: string, details: unknown[]): ApiError {
  return new ApiError({ statusCode, code, message: 'x', details });
}

describe('userErrorMessages', () => {
  it('distingue el conflicto de código de colaborador del de correo', () => {
    expect(
      userErrorMessages(apiError(409, 'RESOURCE_CONFLICT', [{ field: 'employeeCode', issue: 'duplicated' }]))
        .RESOURCE_CONFLICT,
    ).toBe('Ya existe un usuario con ese código de colaborador.');
    expect(userErrorMessages(apiError(409, 'RESOURCE_CONFLICT', [])).RESOURCE_CONFLICT).toBe(
      USER_ERRORS.RESOURCE_CONFLICT,
    );
  });

  it('explica el país inexistente o inactivo', () => {
    expect(
      userErrorMessages(apiError(422, 'UNKNOWN_REFERENCE', [{ field: 'countryId', issue: 'inactive' }]))
        .UNKNOWN_REFERENCE,
    ).toBe('El país elegido ya no existe o está inactivo. Elige otro.');
  });

  it('CRM_PROFILE_INCOMPLETE tiene su mensaje', () => {
    expect(USER_ERRORS.CRM_PROFILE_INCOMPLETE).toBe(
      'Para asignar un rol comercial el usuario necesita código de colaborador y país.',
    );
  });
});

describe('formatCountry', () => {
  it('nombre e ISO o guion', () => {
    expect(formatCountry({ id: 'c', isoCode: 'GT', name: 'Guatemala' })).toBe('Guatemala (GT)');
    expect(formatCountry(null)).toBe('—');
  });
});
