import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-error';
import { CORRELATION_ID_HEADER } from './correlation-id';
import { configureHttpClient, fileNameFromContentDisposition, httpClient } from './http-client';

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

  describe('download', () => {
    it('devuelve el archivo y su nombre, con el token y la correlación de siempre', async () => {
      fetchMock.mockResolvedValue(
        new Response('a,b\r\n', {
          status: 200,
          headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="usuarios.csv"' },
        }),
      );

      const file = await httpClient.download('/users/export', { query: { status: 'ACTIVE' } });

      // jsdom no implementa Blob.text(): basta con comprobar que llega el contenido.
      expect(file.blob.size).toBe(5);
      expect(file.fileName).toBe('usuarios.csv');
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/users/export?status=ACTIVE');
      expect((init.headers as Headers).get('Authorization')).toBe('Bearer test-token');
    });

    it('traduce el error de la API igual que el resto de llamadas', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ statusCode: 403, code: 'PERMISSION_DENIED', message: 'x', details: [], correlationId: 'c' }, 403),
      );

      await expect(httpClient.download('/users/export')).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});

describe('fileNameFromContentDisposition', () => {
  it.each([
    [null, null],
    ['attachment', null],
    ['attachment; filename="auditoria.csv"', 'auditoria.csv'],
    ['attachment; filename=plano.csv', 'plano.csv'],
    ["attachment; filename=\"a.csv\"; filename*=UTF-8''auditor%C3%ADa.csv", 'auditoría.csv'],
  ])('%s → %s', (header, expected) => {
    expect(fileNameFromContentDisposition(header)).toBe(expected);
  });
});

describe('httpClient.upload', () => {
  interface FakeReply {
    status: number;
    body?: unknown;
    headers?: string;
  }

  /** Doble mínimo de `XMLHttpRequest`: registra la petición y responde con la siguiente respuesta de la cola. */
  class FakeXhr {
    static instances: FakeXhr[] = [];
    static replies: (FakeReply | 'network-error')[] = [];

    method = '';
    url = '';
    timeout = 0;
    status = 0;
    statusText = '';
    responseText = '';
    requestHeaders: Record<string, string> = {};
    body: unknown = null;
    responseHeaders = '';
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;

    constructor() {
      FakeXhr.instances.push(this);
    }

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name: string, value: string) {
      this.requestHeaders[name] = value;
    }

    getAllResponseHeaders() {
      return this.responseHeaders;
    }

    abort() {
      this.onabort?.();
    }

    send(body: unknown) {
      this.body = body;
      const reply = FakeXhr.replies.shift();
      queueMicrotask(() => {
        if (!reply || reply === 'network-error') {
          this.onerror?.();
          return;
        }
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 } as ProgressEvent);
        this.upload.onprogress?.({ lengthComputable: true, loaded: 200, total: 200 } as ProgressEvent);
        this.status = reply.status;
        this.responseText = reply.body === undefined ? '' : JSON.stringify(reply.body);
        this.responseHeaders = reply.headers ?? 'content-type: application/json\r\n';
        this.onload?.();
      });
    }
  }

  beforeEach(() => {
    FakeXhr.instances = [];
    FakeXhr.replies = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    configureHttpClient({
      getAccessToken: () => Promise.resolve('test-token'),
      onUnauthorized: () => undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function formData(): FormData {
    const data = new FormData();
    data.append('file', new Blob(['x']), 'a.pdf');
    return data;
  }

  it('envía el FormData con token y correlación, informa del progreso y devuelve el JSON', async () => {
    FakeXhr.replies.push({ status: 201, body: { id: 'att-1' } });
    const onProgress = vi.fn();
    const body = formData();

    await expect(httpClient.upload('/customers/c-1/attachments', body, { onProgress })).resolves.toEqual({
      id: 'att-1',
    });

    const [xhr] = FakeXhr.instances;
    expect(xhr?.method).toBe('POST');
    expect(xhr?.url).toContain('/customers/c-1/attachments');
    expect(xhr?.body).toBe(body);
    expect(xhr?.requestHeaders.Authorization).toBe('Bearer test-token');
    expect(xhr?.requestHeaders[CORRELATION_ID_HEADER]).toBeTruthy();
    expect(xhr?.requestHeaders['Content-Type']).toBeUndefined();
    expect(onProgress).toHaveBeenNthCalledWith(1, { loaded: 50, total: 200, percent: 25 });
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 200, total: 200, percent: 100 });
  });

  it('traduce el error de la API igual que el resto de llamadas', async () => {
    FakeXhr.replies.push({
      status: 422,
      body: { statusCode: 422, code: 'ATTACHMENT_TYPE_NOT_ALLOWED', message: 'x', details: [], correlationId: 'c-9' },
    });

    await expect(httpClient.upload('/x', formData())).rejects.toMatchObject({
      statusCode: 422,
      code: 'ATTACHMENT_TYPE_NOT_ALLOWED',
      correlationId: 'c-9',
    });
  });

  it('un 413 sin cuerpo JSON (NGINX) llega como ApiError con su estado', async () => {
    FakeXhr.replies.push({ status: 413, headers: 'content-type: text/html\r\n' });

    await expect(httpClient.upload('/x', formData())).rejects.toMatchObject({ statusCode: 413, code: 'HTTP_ERROR' });
  });

  it('ante un 401 renueva el token y repite la subida una vez', async () => {
    let currentToken = 'expired-token';
    configureHttpClient({
      getAccessToken: (options) => {
        if (options?.forceRefresh) {
          currentToken = 'fresh-token';
        }
        return Promise.resolve(currentToken);
      },
    });
    FakeXhr.replies.push(
      { status: 401, body: { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' } },
      { status: 201, body: { id: 'att-2' } },
    );

    await expect(httpClient.upload('/x', formData())).resolves.toEqual({ id: 'att-2' });
    expect(FakeXhr.instances.map((xhr) => xhr.requestHeaders.Authorization)).toEqual([
      'Bearer expired-token',
      'Bearer fresh-token',
    ]);
  });

  it('convierte un fallo de red en NETWORK_ERROR', async () => {
    FakeXhr.replies.push('network-error');

    await expect(httpClient.upload('/x', formData())).rejects.toMatchObject({ statusCode: 0, code: 'NETWORK_ERROR' });
  });

  it('no envía nada si la señal ya está abortada', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(httpClient.upload('/x', formData(), { signal: controller.signal })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(FakeXhr.instances[0]?.body).toBeNull();
  });
});
