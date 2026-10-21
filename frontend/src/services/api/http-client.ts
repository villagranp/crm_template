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

/**
 * Cabecera anti-CSRF (ASVS 5.0 G-20). La API la exige en `POST /auth/refresh` y
 * `POST /auth/logout` (si falta responde `403 CSRF_HEADER_REQUIRED`), porque esas
 * dos llamadas se autentican solo con la cookie de refresco. Un formulario o un
 * enlace de otro sitio no puede añadir cabeceras propias, y `fetch` desde otro
 * origen exigiría un preflight CORS que la API no concede. Se envía en TODAS las
 * peticiones: la API es del mismo origen, así que no añade preflight.
 */
export const REQUESTED_WITH_HEADER = 'X-Requested-With';
export const REQUESTED_WITH_VALUE = 'XMLHttpRequest';

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

/** Valor de un parámetro de consulta; una lista se envía como parámetro repetible (`id=a&id=b`). */
export type QueryValue = string | number | boolean | undefined | null | readonly (string | number)[];

export interface RequestOptions {
  query?: Record<string, QueryValue>;
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
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === undefined || item === null || item === '') {
        continue;
      }
      search.append(key, String(item));
    }
  }

  const queryString = search.toString();
  return queryString ? `${base}${normalizedPath}?${queryString}` : `${base}${normalizedPath}`;
}

const RETRY_AFTER_SECONDS = /^\d+$/;

/** `Retry-After` en segundos (la forma que emite la API); una fecha HTTP u otro valor se ignora. */
export function retryAfterSecondsFrom(header: string | null): number | undefined {
  const value = header?.trim();
  return value && RETRY_AFTER_SECONDS.test(value) ? Number(value) : undefined;
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
  }, { retryAfterSeconds: retryAfterSecondsFrom(response.headers.get('retry-after')) });
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
    [REQUESTED_WITH_HEADER]: REQUESTED_WITH_VALUE,
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

type Sender = (accessToken: string | null, correlationId: string) => Promise<Response>;

interface ExecuteOptions {
  isPublic?: boolean;
  skipSessionRefresh?: boolean;
}

/**
 * Sends the request with auth, one renew-and-retry on 401 and the shared error
 * handling. Returns the successful response unread, so each caller decides how
 * to read the body (JSON or file). The transport (`fetch` or, for uploads with
 * progress, `XMLHttpRequest`) is the `sender`.
 */
async function executeWith(sender: Sender, options: ExecuteOptions): Promise<Response> {
  const correlationId = createCorrelationId();
  const accessToken = options.isPublic ? null : await accessTokenProvider();

  let response = await sender(accessToken, correlationId);

  // A protected call rejected with a token we sent: renew once and retry once.
  if (response.status === 401 && accessToken && !options.skipSessionRefresh) {
    const retryToken = await getTokenForRetry(accessToken);
    if (retryToken) {
      response = await sender(retryToken, correlationId);
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

function execute(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<Response> {
  return executeWith(
    (accessToken, correlationId) => send(method, path, options, accessToken, correlationId),
    options,
  );
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
  /** Response headers (p. ej. `X-Export-Rows` de las exportaciones de Reportes). */
  headers: Headers;
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
 * Downloads a file (CSV and XLSX exports) through the same pipeline as every other call.
 * A plain `<a href>` cannot be used: the access token lives in memory and would
 * not be sent.
 */
async function download(path: string, options: RequestOptions = {}): Promise<DownloadedFile> {
  const response = await execute('GET', path, options);
  return {
    blob: await response.blob(),
    fileName: fileNameFromContentDisposition(response.headers.get('content-disposition')),
    headers: response.headers,
  };
}

/** Uploads can be large: they get a longer default timeout than JSON calls. */
const DEFAULT_UPLOAD_TIMEOUT_MS = 120_000;

/** Statuses whose `Response` must not carry a body. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

export interface UploadProgress {
  loaded: number;
  /** `null` when the browser cannot compute the request size. */
  total: number | null;
  /** 0–100, or `null` when `total` is unknown. */
  percent: number | null;
}

export interface UploadOptions {
  /** Called as the request body is sent. Restarts from 0 if the call is retried after a token renewal. */
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function parseResponseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  return headers;
}

/**
 * `fetch` cannot report upload progress, so uploads go through
 * `XMLHttpRequest`. The result is adapted to a `Response` so that auth, retry
 * and error handling are exactly the ones of every other call.
 */
function sendWithXhr(
  method: HttpMethod,
  path: string,
  body: FormData,
  options: UploadOptions,
  accessToken: string | null,
  correlationId: string,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fail = (message: string) => {
      options.signal?.removeEventListener('abort', abort);
      reject(new ApiError({ statusCode: 0, code: NETWORK_ERROR_CODE, message, correlationId }));
    };
    const abort = () => xhr.abort();

    xhr.open(method, buildUrl(path, undefined));
    xhr.timeout = options.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader(CORRELATION_ID_HEADER, correlationId);
    xhr.setRequestHeader(REQUESTED_WITH_HEADER, REQUESTED_WITH_VALUE);
    if (accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    }
    // No Content-Type: the browser sets `multipart/form-data` with its boundary.

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : null;
      options.onProgress?.({
        loaded: event.loaded,
        total,
        percent: total === null ? null : Math.min(100, Math.round((event.loaded / total) * 100)),
      });
    };
    xhr.onload = () => {
      options.signal?.removeEventListener('abort', abort);
      const responseBody = NULL_BODY_STATUSES.has(xhr.status) || !xhr.responseText ? null : xhr.responseText;
      resolve(
        new Response(responseBody, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
        }),
      );
    };
    xhr.onerror = () => fail('Network error');
    xhr.ontimeout = () => fail('Request timed out');
    xhr.onabort = () => fail('Request aborted');

    if (options.signal?.aborted) {
      fail('Request aborted');
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    xhr.send(body);
  });
}

/**
 * Sends a `multipart/form-data` body (attachments, ADR-021) with upload
 * progress, through the same auth, retry and error pipeline as every other
 * call. Build the `FormData` in the feature's `*.api.ts`.
 */
async function upload<TResponse>(path: string, body: FormData, options: UploadOptions = {}): Promise<TResponse> {
  const response = await executeWith(
    (accessToken, correlationId) => sendWithXhr('POST', path, body, options, accessToken, correlationId),
    {},
  );

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
  download,
  upload,
};
