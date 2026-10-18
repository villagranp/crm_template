import { AccessDeniedError } from '@/common/errors/application-error';

import {
  deriveNames,
  identityDomainNotAllowedError,
  identityIncompleteError,
  identityNotLinkedError,
  provisioningDisabledError,
  SSO_ERROR_CODES,
} from './sso-identity.rules';

describe('deriveNames', () => {
  it('el primer término es el nombre y el resto el apellido', () => {
    expect(deriveNames('Ana María Beltrán', 'ana@example.invalid')).toEqual({
      firstName: 'Ana',
      lastName: 'María Beltrán',
      displayName: 'Ana María Beltrán',
    });
  });

  it('con un solo término, el apellido es un guion (la columna es obligatoria)', () => {
    expect(deriveNames('Cher', 'cher@example.invalid')).toEqual({ firstName: 'Cher', lastName: '-', displayName: 'Cher' });
  });

  it('sin nombre usa la parte local del correo', () => {
    expect(deriveNames(undefined, 'ana.beltran@example.invalid')).toMatchObject({ displayName: 'ana.beltran', firstName: 'ana.beltran', lastName: '-' });
    expect(deriveNames('   ', 'ana@example.invalid').displayName).toBe('ana');
  });

  it('elimina caracteres de control y de formato y colapsa espacios', () => {
    expect(deriveNames('Ana\u0000‮  \t Beltrán\n', 'a@example.invalid').displayName).toBe('Ana Beltrán');
  });

  it('recorta a la longitud de cada columna', () => {
    const long = deriveNames(`${'N'.repeat(200)} ${'A'.repeat(200)}`, 'a@example.invalid');
    expect(long.displayName.length).toBeLessThanOrEqual(160);
    expect(long.firstName.length).toBeLessThanOrEqual(80);
    expect(long.lastName.length).toBeLessThanOrEqual(80);
    expect(long.lastName).not.toBe('');
  });
});

describe('errores de admisión', () => {
  it.each([
    [identityNotLinkedError(), SSO_ERROR_CODES.notLinked, 'Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.'],
    [identityIncompleteError(), SSO_ERROR_CODES.incomplete, undefined],
    [provisioningDisabledError(), SSO_ERROR_CODES.provisioningDisabled, undefined],
    [identityDomainNotAllowedError(), SSO_ERROR_CODES.domainNotAllowed, 'Tu correo no pertenece a un dominio autorizado. Contacta al administrador.'],
  ])('son 403 con código estable y mensaje en español', (error, code, message) => {
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(error.code).toBe(code);
    if (message) expect(error.message).toBe(message);
    expect(error.message).toMatch(/administrador/);
  });

  it('los códigos son los del contrato', () => {
    expect(SSO_ERROR_CODES).toEqual({
      notLinked: 'IDENTITY_NOT_LINKED',
      incomplete: 'IDENTITY_INCOMPLETE',
      domainNotAllowed: 'IDENTITY_DOMAIN_NOT_ALLOWED',
      provisioningDisabled: 'SSO_PROVISIONING_DISABLED',
    });
  });
});
