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
