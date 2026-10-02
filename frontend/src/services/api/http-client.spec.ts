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
});
