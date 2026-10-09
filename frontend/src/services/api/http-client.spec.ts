import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-error';
import { CORRELATION_ID_HEADER } from './correlation-id';
import { configureHttpClient, httpClient } from './http-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('httpClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    configureHttpClient({
      getAccessToken: () => Promise.resolve('test-token'),
      onUnauthorized: () => undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a correlation ID and the bearer token on protected requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await httpClient.get('/health');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;

    expect(headers.get(CORRELATION_ID_HEADER)).toBeTruthy();
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('omits the Authorization header for public requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await httpClient.get('/health', { isPublic: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('Authorization')).toBeNull();
  });

  it('serialises query parameters and drops empty values', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], pagination: {} }));

    await httpClient.get('/items', { query: { page: 1, search: '', status: undefined, sortOrder: 'desc' } });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('page=1');
    expect(url).toContain('sortOrder=desc');
    expect(url).not.toContain('search=');
    expect(url).not.toContain('status=');
  });

  it('maps a backend error payload to ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          statusCode: 403,
          code: 'PERMISSION_DENIED',
          message: 'Permission denied',
          details: [],
          correlationId: 'corr-1',
        },
        403,
      ),
    );

    await expect(httpClient.get('/items')).rejects.toMatchObject({
      statusCode: 403,
      code: 'PERMISSION_DENIED',
      correlationId: 'corr-1',
    });
  });

  it('notifies the unauthorized handler on 401', async () => {
    const onUnauthorized = vi.fn();
    configureHttpClient({ onUnauthorized });
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 401, code: 'UNAUTHORIZED', message: 'nope' }, 401));

    await expect(httpClient.get('/items')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('converts a transport failure into a NETWORK_ERROR ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(httpClient.get('/items')).rejects.toMatchObject({
      statusCode: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(httpClient.delete('/items/1')).resolves.toBeUndefined();
  });

  describe('sesión caducada', () => {
    function unauthorized(): Response {
      return jsonResponse({ statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' }, 401);
    }

    function authorizationOf(callIndex: number): string | null {
      const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
      return (init.headers as Headers).get('Authorization');
    }

    it('ante un 401 renueva el token una vez y repite la petición', async () => {
      let currentToken = 'expired-token';
      const getAccessToken = vi.fn((options?: { forceRefresh?: boolean }) => {
        if (options?.forceRefresh) {
          currentToken = 'fresh-token';
        }
        return Promise.resolve(currentToken);
      });
      const onUnauthorized = vi.fn();
      configureHttpClient({ getAccessToken, onUnauthorized });
      fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await expect(httpClient.get('/items')).resolves.toEqual({ status: 'ok' });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(authorizationOf(0)).toBe('Bearer expired-token');
      expect(authorizationOf(1)).toBe('Bearer fresh-token');
      expect(getAccessToken).toHaveBeenCalledWith({ forceRefresh: true });
      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('sólo reintenta una vez: si vuelve a fallar, avisa de la sesión perdida', async () => {
      const onUnauthorized = vi.fn();
      configureHttpClient({ getAccessToken: () => Promise.resolve('token'), onUnauthorized });
      fetchMock.mockImplementation(() => Promise.resolve(unauthorized()));

      await expect(httpClient.get('/items')).rejects.toMatchObject({ statusCode: 401 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it('si no se puede renovar, no repite y avisa de la sesión perdida', async () => {
      const onUnauthorized = vi.fn();
      configureHttpClient({
        getAccessToken: (options) => Promise.resolve(options?.forceRefresh ? null : 'expired-token'),
        onUnauthorized,
      });
      fetchMock.mockResolvedValueOnce(unauthorized());

      await expect(httpClient.get('/items')).rejects.toMatchObject({ statusCode: 401 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it('reutiliza el token que otra petición ya renovó en lugar de renovar otra vez', async () => {
      const tokens = ['old-token', 'already-renewed-token'];
      const getAccessToken = vi.fn(() => Promise.resolve(tokens.shift() ?? 'unexpected'));
      configureHttpClient({ getAccessToken });
      fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await httpClient.get('/items');

      expect(authorizationOf(1)).toBe('Bearer already-renewed-token');
      expect(getAccessToken).not.toHaveBeenCalledWith({ forceRefresh: true });
    });

    it('no reintenta cuando la petición lo desactiva', async () => {
      fetchMock.mockResolvedValueOnce(unauthorized());

      await expect(httpClient.post('/auth/password/change', { skipSessionRefresh: true })).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('un 401 de un endpoint público no cierra la sesión', async () => {
      const onUnauthorized = vi.fn();
      configureHttpClient({ onUnauthorized });
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'nope' }, 401),
      );

      await expect(httpClient.post('/auth/login', { isPublic: true })).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });

  it('avisa cuando la API exige cambiar la contraseña', async () => {
    const onPasswordChangeRequired = vi.fn();
    configureHttpClient({ onPasswordChangeRequired });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED', message: 'change it' }, 403),
    );

    await expect(httpClient.get('/me/menu')).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(onPasswordChangeRequired).toHaveBeenCalledOnce();
  });
});
