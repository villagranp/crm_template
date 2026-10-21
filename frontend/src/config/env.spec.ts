import { describe, expect, it } from 'vitest';

import { envSchema } from './env';

const ENTRA_COMPLETE = {
  VITE_AUTH_PROVIDER: 'entra',
  VITE_ENTRA_CLIENT_ID: 'spa-client-test',
  VITE_ENTRA_AUTHORITY: 'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555',
  VITE_ENTRA_REDIRECT_URI: 'http://localhost:5173/auth/callback',
  VITE_ENTRA_API_SCOPE: 'api://api-client-test/access_as_user',
};

function failingKeys(input: Record<string, unknown>): string[] {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('configuración del frontend', () => {
  it('el proveedor local no exige ninguna variable de Entra', () => {
    expect(envSchema.safeParse({ VITE_AUTH_PROVIDER: 'local' }).success).toBe(true);
    expect(envSchema.safeParse({}).success).toBe(true);
  });

  it('con Entra completo es válida, sin exigir VITE_ENTRA_TENANT_ID (va dentro del authority)', () => {
    expect(envSchema.safeParse(ENTRA_COMPLETE).success).toBe(true);
  });

  it.each([
    'VITE_ENTRA_CLIENT_ID',
    'VITE_ENTRA_AUTHORITY',
    'VITE_ENTRA_REDIRECT_URI',
    'VITE_ENTRA_API_SCOPE',
  ])('con Entra falla si falta %s y sólo informa del nombre', (key) => {
    const input: Record<string, unknown> = { ...ENTRA_COMPLETE };
    delete input[key];

    expect(failingKeys(input)).toEqual([key]);
  });

  it('una variable en blanco cuenta como ausente', () => {
    expect(failingKeys({ ...ENTRA_COMPLETE, VITE_ENTRA_CLIENT_ID: '   ' })).toEqual(['VITE_ENTRA_CLIENT_ID']);
  });

  it('el authority debe ser una URL https', () => {
    expect(failingKeys({ ...ENTRA_COMPLETE, VITE_ENTRA_AUTHORITY: 'http://login.microsoftonline.com/t' })).toEqual([
      'VITE_ENTRA_AUTHORITY',
    ]);
    expect(failingKeys({ ...ENTRA_COMPLETE, VITE_ENTRA_AUTHORITY: 'no es una url' })).toEqual([
      'VITE_ENTRA_AUTHORITY',
    ]);
  });

  it.each(['common', 'organizations', 'consumers', 'tenant-test'])(
    'el authority debe llevar un tenant GUID: rechaza /%s',
    (tenant) => {
      expect(
        failingKeys({ ...ENTRA_COMPLETE, VITE_ENTRA_AUTHORITY: `https://login.microsoftonline.com/${tenant}` }),
      ).toEqual(['VITE_ENTRA_AUTHORITY']);
    },
  );

  it('acepta el authority con GUID y sufijo /v2.0', () => {
    expect(
      envSchema.safeParse({
        ...ENTRA_COMPLETE,
        VITE_ENTRA_AUTHORITY: 'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0',
      }).success,
    ).toBe(true);
  });

  it('la redirect URI debe ser una URL absoluta http(s)', () => {
    expect(failingKeys({ ...ENTRA_COMPLETE, VITE_ENTRA_REDIRECT_URI: '/auth/callback' })).toEqual([
      'VITE_ENTRA_REDIRECT_URI',
    ]);
    expect(
      envSchema.safeParse({
        ...ENTRA_COMPLETE,
        VITE_ENTRA_REDIRECT_URI: 'https://miclienteag-qa.somosgrupoag.com/auth/callback',
      }).success,
    ).toBe(true);
  });
});
