import type { Request, Response } from 'express';

import type { AppConfigService } from '@/config/app-config.service';

import { clearRefreshCookie, readRefreshCookie, refreshCookieName, setRefreshCookie } from './refresh-cookie';

function configFor(nodeEnv: 'development' | 'test' | 'production'): AppConfigService {
  const values: Record<string, string> = { NODE_ENV: nodeEnv, API_GLOBAL_PREFIX: 'api', API_DEFAULT_VERSION: '1' };
  return { get: (key: string) => values[key] } as unknown as AppConfigService;
}

function requestWithCookie(cookie: string | undefined): Request {
  return { headers: cookie === undefined ? {} : { cookie } } as unknown as Request;
}

describe('refresh-cookie (G-18)', () => {
  it.each(['production', 'test'] as const)('con %s (Secure) se llama __Secure-refresh_token', (nodeEnv) => {
    expect(refreshCookieName(configFor(nodeEnv))).toBe('__Secure-refresh_token');
  });

  it('en desarrollo (http://localhost, sin Secure) conserva refresh_token', () => {
    expect(refreshCookieName(configFor('development'))).toBe('refresh_token');
  });

  it('se fija con el prefijo, Secure, HttpOnly, SameSite=Lax y la ruta de autenticación', () => {
    const cookie = jest.fn();
    const expires = new Date('2026-10-20T12:00:00Z');

    setRefreshCookie({ cookie } as unknown as Response, configFor('production'), 'valor', expires);

    expect(cookie).toHaveBeenCalledWith('__Secure-refresh_token', 'valor', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires,
    });
  });

  it('en desarrollo se fija sin Secure y sin prefijo', () => {
    const cookie = jest.fn();

    setRefreshCookie({ cookie } as unknown as Response, configFor('development'), 'valor', new Date());

    expect(cookie).toHaveBeenCalledWith('refresh_token', 'valor', expect.objectContaining({ secure: false }));
  });

  it('se borra con el mismo nombre y opciones', () => {
    const clearCookie = jest.fn();

    clearRefreshCookie({ clearCookie } as unknown as Response, configFor('production'));

    expect(clearCookie).toHaveBeenCalledWith('__Secure-refresh_token', expect.objectContaining({ secure: true, path: '/api/v1/auth' }));
  });

  it('con Secure lee solo __Secure-refresh_token, nunca el nombre sin prefijo', () => {
    const config = configFor('production');

    expect(readRefreshCookie(requestWithCookie('otra=1; __Secure-refresh_token=abc'), config)).toBe('abc');
    expect(readRefreshCookie(requestWithCookie('refresh_token=sembrada'), config)).toBeUndefined();
    expect(readRefreshCookie(requestWithCookie('refresh_token=sembrada; __Secure-refresh_token=abc'), config)).toBe('abc');
  });

  it('en desarrollo lee solo refresh_token', () => {
    const config = configFor('development');

    expect(readRefreshCookie(requestWithCookie('refresh_token=abc'), config)).toBe('abc');
    expect(readRefreshCookie(requestWithCookie('__Secure-refresh_token=abc'), config)).toBeUndefined();
  });

  it('sin cabecera Cookie o con valor vacío devuelve undefined', () => {
    const config = configFor('production');

    expect(readRefreshCookie(requestWithCookie(undefined), config)).toBeUndefined();
    expect(readRefreshCookie(requestWithCookie('__Secure-refresh_token='), config)).toBeUndefined();
  });
});
