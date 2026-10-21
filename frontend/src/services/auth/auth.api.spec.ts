import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureHttpClient } from '@/services/api/http-client';

import { logout, refreshSession } from './auth.api';

/**
 * Contrato con la API (ASVS 5.0 G-20): refresco y cierre de sesión se autentican
 * solo con la cookie de refresco, así que deben llevar `X-Requested-With`; sin
 * ella la API responde `403 CSRF_HEADER_REQUIRED`.
 */
describe('auth.api: cabecera anti-CSRF', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    configureHttpClient({ getAccessToken: () => Promise.resolve('test-token') });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lastRequest(): { url: string; init: RequestInit; headers: Headers } {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, headers: init.headers as Headers };
  }

  it('POST /auth/refresh envía X-Requested-With: XMLHttpRequest y la cookie del mismo origen', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'a' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await refreshSession();

    const { url, init, headers } = lastRequest();
    expect(url).toMatch(/\/auth\/refresh$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(headers.get('Authorization')).toBeNull();
  });

  it('POST /auth/logout envía X-Requested-With: XMLHttpRequest', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await logout();

    const { url, init, headers } = lastRequest();
    expect(url).toMatch(/\/auth\/logout$/);
    expect(init.method).toBe('POST');
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
  });
});
