import { env } from '@/config/env';
import type { ApiErrorBody } from '@/types/api';

import { ApiError, NETWORK_ERROR_CODE } from './api-error';
import { CORRELATION_ID_HEADER, createCorrelationId } from './correlation-id';

/**
 * Centralised HTTP client.
 *
 * Components and hooks MUST NOT call `fetch` directly (see
 * `.claude/skills/frontend-react/SKILL.md`). Everything goes through here so
 * that base URL, auth header, correlation ID, timeouts and error shape are
 * defined exactly once.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export type AccessTokenProvider = () => Promise<string | null>;
export type UnauthorizedHandler = () => void;

let accessTokenProvider: AccessTokenProvider = () => Promise.resolve(null);
let unauthorizedHandler: UnauthorizedHandler = () => undefined;

/** Wired once at startup by the auth layer; keeps the client provider-agnostic. */
export function configureHttpClient(options: {
  getAccessToken?: AccessTokenProvider;
  onUnauthorized?: UnauthorizedHandler;
}): void {
  if (options.getAccessToken) {
    accessTokenProvider = options.getAccessToken;
  }
  if (options.onUnauthorized) {
    unauthorizedHandler = options.onUnauthorized;
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skips the Authorization header for genuinely public endpoints. */
  isPublic?: boolean;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const base = env.VITE_API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.append(key, String(value));
  }

  const queryString = search.toString();
  return queryString ? `${base}${normalizedPath}?${queryString}` : `${base}${normalizedPath}`;
}

async function toApiError(response: Response, correlationId: string): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};

  try {
    body = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    // Non-JSON error payload (gateway/proxy failure): fall through to defaults.
  }

  return new ApiError({
    statusCode: body.statusCode ?? response.status,
    code: body.code ?? 'HTTP_ERROR',
    message: body.message ?? response.statusText ?? 'Request failed',
    details: Array.isArray(body.details) ? body.details : [],
    correlationId: body.correlationId ?? correlationId,
  });
}

async function request<TResponse>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const correlationId = createCorrelationId();
  const headers = new Headers({
    Accept: 'application/json',
    [CORRELATION_ID_HEADER]: correlationId,
  });

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (!options.isPublic) {
    const accessToken = await accessTokenProvider();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (options.signal) {
    options.signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeoutController.signal,
      credentials: 'same-origin',
    });
  } catch (cause) {
    throw new ApiError({
      statusCode: 0,
      code: NETWORK_ERROR_CODE,
      message: cause instanceof Error && cause.name === 'AbortError' ? 'Request timed out' : 'Network error',
      correlationId,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    unauthorizedHandler();
  }

  if (!response.ok) {
    throw await toApiError(response, correlationId);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export const httpClient = {
  get: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('GET', path, options),
  post: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('POST', path, options),
  put: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('PUT', path, options),
  patch: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('PATCH', path, options),
  delete: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('DELETE', path, options),
};
