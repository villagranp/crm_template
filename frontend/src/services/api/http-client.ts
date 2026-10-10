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

export type AccessTokenProvider = (options?: { forceRefresh?: boolean }) => Promise<string | null>;
export type UnauthorizedHandler = () => void;
export type PasswordChangeRequiredHandler = () => void;

/** Error code the API returns while the user still has to replace an initial password. */
export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';

let accessTokenProvider: AccessTokenProvider = () => Promise.resolve(null);
let unauthorizedHandler: UnauthorizedHandler = () => undefined;
let passwordChangeRequiredHandler: PasswordChangeRequiredHandler = () => undefined;

/** Wired once at startup by the auth layer; keeps the client provider-agnostic. */
export function configureHttpClient(options: {
  getAccessToken?: AccessTokenProvider;
  onUnauthorized?: UnauthorizedHandler;
  onPasswordChangeRequired?: PasswordChangeRequiredHandler;
}): void {
  if (options.getAccessToken) {
    accessTokenProvider = options.getAccessToken;
  }
  if (options.onUnauthorized) {
    unauthorizedHandler = options.onUnauthorized;
  }
  if (options.onPasswordChangeRequired) {
    passwordChangeRequiredHandler = options.onPasswordChangeRequired;
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skips the Authorization header for genuinely public endpoints. */
  isPublic?: boolean;
  /**
   * Disables the refresh-and-retry on `401`. Only for calls the auth layer
   * already runs while holding the refresh lock: retrying would wait on that
   * same lock forever.
   */
  skipSessionRefresh?: boolean;
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

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function send(
  method: HttpMethod,
  path: string,
  options: RequestOptions,
  accessToken: string | null,
  correlationId: string,
): Promise<Response> {
  const headers = new Headers({
    Accept: 'application/json',
    [CORRELATION_ID_HEADER]: correlationId,
  });

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (options.signal) {
    options.signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  try {
    return await fetch(buildUrl(path, options.query), {
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
}

/**
 * Obtains the token to retry with after a `401`, or `null` if there is none.
 *
 * If the token changed while the request was in flight (another request
 * already renewed it) that one is reused instead of renewing again: every
 * renewal rotates the refresh cookie, so redundant renewals only add risk.
 */
async function getTokenForRetry(rejectedToken: string): Promise<string | null> {
  const currentToken = await accessTokenProvider();
  if (currentToken && currentToken !== rejectedToken) {
    return currentToken;
  }
  return accessTokenProvider({ forceRefresh: true });
}

/**
 * Sends the request with auth, one renew-and-retry on 401 and the shared error
 * handling. Returns the successful response unread, so each caller decides how
 * to read the body (JSON or file).
 */
async function execute(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<Response> {
  const correlationId = createCorrelationId();
  const accessToken = options.isPublic ? null : await accessTokenProvider();

  let response = await send(method, path, options, accessToken, correlationId);

  // A protected call rejected with a token we sent: renew once and retry once.
  if (response.status === 401 && accessToken && !options.skipSessionRefresh) {
    const retryToken = await getTokenForRetry(accessToken);
    if (retryToken) {
      response = await send(method, path, options, retryToken, correlationId);
    }
  }

  if (!response.ok) {
    const error = await toApiError(response, correlationId);

    // A 401 on a public endpoint (wrong password, expired refresh cookie) is a
    // business answer, not a lost session.
    if (error.isUnauthorized && !options.isPublic) {
      unauthorizedHandler();
    }
    if (error.isForbidden && error.code === PASSWORD_CHANGE_REQUIRED_CODE) {
      passwordChangeRequiredHandler();
    }

    throw error;
  }

  return response;
}

async function request<TResponse>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<TResponse> {
  const response = await execute(method, path, options);

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export interface DownloadedFile {
  blob: Blob;
  /** Name from `Content-Disposition`, if the server sent one. */
  fileName: string | null;
}

/** `filename*=UTF-8''...` (RFC 5987) wins over plain `filename="..."`. */
export function fileNameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Malformed encoding: fall back to the plain parameter.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || null;
}

/**
 * Downloads a file (CSV exports) through the same pipeline as every other call.
 * A plain `<a href>` cannot be used: the access token lives in memory and would
 * not be sent.
 */
async function download(path: string, options: RequestOptions = {}): Promise<DownloadedFile> {
  const response = await execute('GET', path, options);
  return {
    blob: await response.blob(),
    fileName: fileNameFromContentDisposition(response.headers.get('content-disposition')),
  };
}

export const httpClient = {
  get: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('GET', path, options),
  post: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('POST', path, options),
  put: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('PUT', path, options),
  patch: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('PATCH', path, options),
  delete: <TResponse>(path: string, options?: RequestOptions) => request<TResponse>('DELETE', path, options),
  download,
};
