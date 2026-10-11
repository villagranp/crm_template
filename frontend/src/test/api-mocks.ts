import { vi, type Mock } from 'vitest';

/**
 * Dobles de la API para pruebas de componente y de servicio.
 *
 * Se sustituye `fetch` (el borde real del cliente HTTP) en lugar de los
 * módulos propios, para que las pruebas recorran el mismo camino que la
 * aplicación: cliente HTTP, proveedor de autenticación y store.
 */

export const TEST_ACCESS_TOKEN_TTL_MS = 15 * 60_000;

export interface TestSessionOverrides {
  accessToken?: string;
  expiresAt?: string;
  passwordChangeRequired?: boolean;
  permissions?: string[];
}

export function buildSession(overrides: TestSessionOverrides = {}) {
  return {
    accessToken: overrides.accessToken ?? 'access-token-1',
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + TEST_ACCESS_TOKEN_TTL_MS).toISOString(),
    passwordChangeRequired: overrides.passwordChangeRequired ?? false,
    user: {
      id: 'user-1',
      email: 'persona@example.test',
      displayName: 'Persona de Prueba',
      roles: ['ADMIN'],
      permissions: overrides.permissions ?? ['usuarios.ver'],
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string, details: unknown[] = []): Response {
  return jsonResponse({ statusCode: status, code, message: 'error de prueba', details, correlationId: 'corr-test' }, status);
}

export type RouteHandler = (init: RequestInit) => Response | Promise<Response>;

/**
 * Sustituye `fetch` y responde por `MÉTODO /ruta` (sin el prefijo `/api/v1`).
 * Una ruta sin manejador responde 404 para que el fallo sea visible.
 */
export function mockApi(routes: Record<string, RouteHandler>): Mock {
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = new URL(input, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
    const handler = routes[`${init.method ?? 'GET'} ${path}`];
    return handler ? handler(init) : errorResponse(404, 'NOT_FOUND');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Llamadas registradas a una ruta concreta. */
export function callsTo(fetchMock: Mock, method: string, path: string): RequestInit[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      const requestInit = (init ?? {}) as RequestInit;
      return (requestInit.method ?? 'GET') === method && String(input).endsWith(path);
    })
    .map(([, init]) => init as RequestInit);
}

/** Promesa controlable desde la prueba, para fijar el orden de las respuestas. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

export interface UploadReply {
  status: number;
  body?: unknown;
  /** Progreso que se notifica antes de responder, como `[cargado, total]`. */
  progress?: [loaded: number, total: number][];
  /** Si se indica, la respuesta espera a esta promesa después de notificar el progreso. */
  hold?: Promise<unknown>;
}

export interface RecordedUpload {
  method: string;
  /** Ruta sin el prefijo `/api/v1`. */
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export type UploadHandler = (request: RecordedUpload) => UploadReply | Promise<UploadReply>;

/**
 * Sustituye `XMLHttpRequest` (el borde de `httpClient.upload`, que lo usa para
 * informar del progreso) y responde con `handler`. Devuelve las subidas
 * registradas. Una respuesta sin `body` llega sin JSON, como un `413` de NGINX.
 */
export function mockUpload(handler: UploadHandler): RecordedUpload[] {
  const recorded: RecordedUpload[] = [];

  class FakeXhr {
    status = 0;
    statusText = '';
    responseText = '';
    timeout = 0;
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private request: RecordedUpload = { method: 'GET', path: '', headers: {}, body: null };
    private responseHeaders = '';
    private aborted = false;

    open(method: string, url: string) {
      this.request.method = method;
      this.request.path = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
    }

    setRequestHeader(name: string, value: string) {
      this.request.headers[name] = value;
    }

    getAllResponseHeaders() {
      return this.responseHeaders;
    }

    abort() {
      this.aborted = true;
      this.onabort?.();
    }

    send(body: unknown) {
      this.request.body = body;
      recorded.push(this.request);
      void Promise.resolve(handler(this.request)).then(async (reply) => {
        if (this.aborted) {
          return;
        }
        for (const [loaded, total] of reply.progress ?? []) {
          this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
        }
        await reply.hold;
        if (this.aborted) {
          return;
        }
        this.status = reply.status;
        this.responseText = reply.body === undefined ? '' : JSON.stringify(reply.body);
        this.responseHeaders = reply.body === undefined ? 'content-type: text/html\r\n' : 'content-type: application/json\r\n';
        this.onload?.();
      });
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return recorded;
}
