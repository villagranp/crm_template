import { decodeJwt, decodeProtectedHeader } from 'jose';

import type { AppConfigService } from '@/config/app-config.service';
import { InvalidTokenError } from '@/infrastructure/authentication/ports/authentication-provider.port';
import { LocalAuthenticationProvider } from '@/infrastructure/authentication/providers/local-authentication.provider';

import { TokenService } from './token.service';

const SECRET = 'secreto-de-prueba-con-mas-de-32-bytes-0123456789';

function configWith(overrides: Record<string, string | undefined> = {}): AppConfigService {
  const values: Record<string, string | undefined> = {
    JWT_ACCESS_TOKEN_SECRET: SECRET,
    JWT_ACCESS_TOKEN_TTL: '15m',
    JWT_ISSUER: 'mi-cliente-ag',
    JWT_AUDIENCE: 'mi-cliente-ag-api',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as AppConfigService;
}

const SUBJECT = {
  userId: 'user-1',
  email: 'persona@example.com',
  displayName: 'Persona de prueba',
  passwordChangeRequired: false,
};

describe('TokenService', () => {
  it('emite un token que el proveedor local acepta', async () => {
    const config = configWith();
    const { accessToken } = await new TokenService(config).signAccessToken(SUBJECT);

    const principal = await new LocalAuthenticationProvider(config).verifyAccessToken(accessToken);

    expect(principal).toEqual({
      subjectId: 'user-1',
      type: 'user',
      email: 'persona@example.com',
      displayName: 'Persona de prueba',
      providerRoles: [],
      issuedBy: 'local',
      passwordChangeRequired: false,
    });
  });

  it('marca el token cuando la contraseña debe cambiarse (D13)', async () => {
    const config = configWith();
    const { accessToken } = await new TokenService(config).signAccessToken({ ...SUBJECT, passwordChangeRequired: true });

    const principal = await new LocalAuthenticationProvider(config).verifyAccessToken(accessToken);

    expect(principal.passwordChangeRequired).toBe(true);
  });

  it('un token normal no lleva el claim de cambio pendiente', async () => {
    const { accessToken } = await new TokenService(configWith()).signAccessToken(SUBJECT);

    expect(decodeJwt(accessToken)).not.toHaveProperty('pcr');
  });

  it('caduca a los 15 minutos (D1)', async () => {
    const { accessToken, expiresAt } = await new TokenService(configWith()).signAccessToken(SUBJECT);
    const claims = decodeJwt(accessToken);

    expect(claims.exp! - claims.iat!).toBe(15 * 60);
    expect(expiresAt.getTime()).toBe(claims.exp! * 1000);
  });

  it('firma con HS256 y un jti distinto en cada token', async () => {
    const service = new TokenService(configWith());
    const [first, second] = await Promise.all([service.signAccessToken(SUBJECT), service.signAccessToken(SUBJECT)]);

    expect(decodeProtectedHeader(first.accessToken).alg).toBe('HS256');
    expect(decodeJwt(first.accessToken).jti).toBeDefined();
    expect(decodeJwt(first.accessToken).jti).not.toBe(decodeJwt(second.accessToken).jti);
  });

  it('no incluye roles ni permisos: salen de la base de datos (ADR-008)', async () => {
    const { accessToken } = await new TokenService(configWith()).signAccessToken(SUBJECT);
    const claims = decodeJwt(accessToken);

    expect(claims).not.toHaveProperty('roles');
    expect(claims).not.toHaveProperty('permissions');
  });

  it('un token firmado con otra clave no se acepta', async () => {
    const { accessToken } = await new TokenService(
      configWith({ JWT_ACCESS_TOKEN_SECRET: 'otra-clave-distinta-tambien-de-32-bytes-o-mas' }),
    ).signAccessToken(SUBJECT);

    await expect(new LocalAuthenticationProvider(configWith()).verifyAccessToken(accessToken)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('un token para otra audiencia no se acepta', async () => {
    const { accessToken } = await new TokenService(configWith({ JWT_AUDIENCE: 'otra-api' })).signAccessToken(SUBJECT);

    await expect(new LocalAuthenticationProvider(configWith()).verifyAccessToken(accessToken)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('se niega a firmar sin clave o con una clave de menos de 256 bits', async () => {
    await expect(
      new TokenService(configWith({ JWT_ACCESS_TOKEN_SECRET: undefined })).signAccessToken(SUBJECT),
    ).rejects.toThrow('JWT_ACCESS_TOKEN_SECRET');
    await expect(
      new TokenService(configWith({ JWT_ACCESS_TOKEN_SECRET: 'corta' })).signAccessToken(SUBJECT),
    ).rejects.toThrow('JWT_ACCESS_TOKEN_SECRET');
  });
});
