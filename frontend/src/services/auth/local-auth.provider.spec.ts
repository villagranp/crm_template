import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureHttpClient } from '@/services/api/http-client';
import {
  buildSession,
  callsTo,
  deferred,
  errorResponse,
  jsonResponse,
  mockApi,
  TEST_ACCESS_TOKEN_TTL_MS,
} from '@/test/api-mocks';

import { LocalAuthProvider, REFRESH_LEEWAY_MS } from './local-auth.provider';
import { SESSION_LOCK_NAME } from './session-lock';

/**
 * Doble de la Web Locks API con la misma semántica que la real: un único
 * titular por nombre, el resto espera en orden. Dos instancias del proveedor
 * que lo comparten se comportan como dos pestañas del mismo origen.
 */
function installLockManager() {
  let queue: Promise<unknown> = Promise.resolve();
  const lockManager = {
    request: vi.fn((_name: string, _options: LockOptions, callback: () => Promise<unknown>) => {
      const run = queue.then(() => callback());
      queue = run.catch(() => undefined);
      return run;
    }),
  };
  Object.defineProperty(navigator, 'locks', { value: lockManager, configurable: true });
  return lockManager;
}

function removeLockManager(): void {
  Reflect.deleteProperty(navigator, 'locks');
}

const CREDENTIALS = { email: 'persona@example.test', password: 'una frase larga de prueba' };

describe('LocalAuthProvider', () => {
  beforeEach(() => {
    removeLockManager();
  });

  afterEach(() => {
    removeLockManager();
    vi.useRealTimers();
  });

  it('inicia sesión con las credenciales y expone el cambio obligatorio de contraseña', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': () => jsonResponse(buildSession({ passwordChangeRequired: true })),
    });
    const provider = new LocalAuthProvider();

    const session = await provider.signIn(CREDENTIALS);

    expect(session).toMatchObject({ passwordChangeRequired: true, user: { email: 'persona@example.test' } });
    expect(JSON.parse(String(callsTo(fetchMock, 'POST', '/auth/login')[0]?.body))).toEqual(CREDENTIALS);
    await expect(provider.getAccessToken()).resolves.toBe('access-token-1');
  });

  it('rechaza el inicio de sesión sin credenciales', async () => {
    await expect(new LocalAuthProvider().signIn()).rejects.toThrow(/requires an email and a password/);
  });

  it('propaga el error de la API para que el formulario lo explique', async () => {
    mockApi({ 'POST /auth/login': () => errorResponse(401, 'INVALID_CREDENTIALS') });

    await expect(new LocalAuthProvider().signIn(CREDENTIALS)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('guarda el access token sólo en memoria', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    mockApi({ 'POST /auth/login': () => jsonResponse(buildSession()) });

    await new LocalAuthProvider().signIn(CREDENTIALS);

    expect(setItem).not.toHaveBeenCalled();
  });

  it('restaura la sesión al arrancar y devuelve null si no hay cookie válida', async () => {
    mockApi({ 'POST /auth/refresh': () => errorResponse(401, 'INVALID_REFRESH_TOKEN') });

    await expect(new LocalAuthProvider().initialize()).resolves.toBeNull();
  });

  describe('renovación serializada', () => {
    it('comparte una sola petición de refresh entre llamadas concurrentes de la misma pestaña', async () => {
      const pending = deferred<Response>();
      const fetchMock = mockApi({ 'POST /auth/refresh': () => pending.promise });
      const provider = new LocalAuthProvider();

      const tokens = Promise.all([
        provider.getAccessToken({ forceRefresh: true }),
        provider.getAccessToken({ forceRefresh: true }),
        provider.getAccessToken({ forceRefresh: true }),
      ]);
      pending.resolve(jsonResponse(buildSession({ accessToken: 'access-token-2' })));

      await expect(tokens).resolves.toEqual(['access-token-2', 'access-token-2', 'access-token-2']);
      expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);
    });

    it('entre pestañas usa la Web Locks API y no solapa dos refresh', async () => {
      const lockManager = installLockManager();
      const firstResponse = deferred<Response>();
      let refreshCount = 0;
      const fetchMock = mockApi({
        'POST /auth/refresh': () => {
          refreshCount += 1;
          return refreshCount === 1
            ? firstResponse.promise
            : jsonResponse(buildSession({ accessToken: 'access-token-tab-b' }));
        },
      });
      const tabA = new LocalAuthProvider();
      const tabB = new LocalAuthProvider();

      const renewalA = tabA.getAccessToken({ forceRefresh: true });
      const renewalB = tabB.getAccessToken({ forceRefresh: true });
      await vi.waitFor(() => expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1));

      // La pestaña B espera el cerrojo: su refresh no sale hasta que A termina.
      await Promise.resolve();
      expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);

      firstResponse.resolve(jsonResponse(buildSession({ accessToken: 'access-token-tab-a' })));

      await expect(renewalA).resolves.toBe('access-token-tab-a');
      await expect(renewalB).resolves.toBe('access-token-tab-b');
      expect(lockManager.request).toHaveBeenCalledWith(SESSION_LOCK_NAME, { mode: 'exclusive' }, expect.any(Function));
    });

    it('sin Web Locks API sigue sin solapar renovaciones dentro de la pestaña', async () => {
      const firstResponse = deferred<Response>();
      let refreshCount = 0;
      const fetchMock = mockApi({
        'POST /auth/refresh': () => {
          refreshCount += 1;
          return refreshCount === 1 ? firstResponse.promise : jsonResponse(buildSession());
        },
      });
      const first = new LocalAuthProvider();
      const second = new LocalAuthProvider();

      const renewals = Promise.all([
        first.getAccessToken({ forceRefresh: true }),
        second.getAccessToken({ forceRefresh: true }),
      ]);
      await vi.waitFor(() => expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1));
      await Promise.resolve();
      expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);

      firstResponse.resolve(jsonResponse(buildSession()));
      await renewals;
      expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(2);
    });
  });

  describe('renovación proactiva', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    });

    it('renueva el token poco antes de expiresAt', async () => {
      let refreshCount = 0;
      const fetchMock = mockApi({
        'POST /auth/login': () => jsonResponse(buildSession()),
        'POST /auth/refresh': () => {
          refreshCount += 1;
          return jsonResponse(buildSession({ accessToken: `access-token-renewed-${refreshCount}` }));
        },
      });
      const provider = new LocalAuthProvider();
      await provider.signIn(CREDENTIALS);

      await vi.advanceTimersByTimeAsync(TEST_ACCESS_TOKEN_TTL_MS - REFRESH_LEEWAY_MS - 1_000);
      expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);
      await expect(provider.getAccessToken()).resolves.toBe('access-token-renewed-1');
    });

    it('renueva antes de entregar un token a punto de caducar aunque el temporizador se haya retrasado', async () => {
      const fetchMock = mockApi({
        'POST /auth/login': () => jsonResponse(buildSession()),
        'POST /auth/refresh': () => jsonResponse(buildSession({ accessToken: 'access-token-renewed' })),
      });
      const provider = new LocalAuthProvider();
      await provider.signIn(CREDENTIALS);

      // Pestaña en segundo plano: el reloj avanza sin que el temporizador dispare.
      vi.setSystemTime(Date.now() + TEST_ACCESS_TOKEN_TTL_MS - REFRESH_LEEWAY_MS / 2);

      await expect(provider.getAccessToken()).resolves.toBe('access-token-renewed');
      expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);
    });

    it('notifica la pérdida de sesión cuando el refresh es rechazado', async () => {
      mockApi({
        'POST /auth/login': () => jsonResponse(buildSession()),
        'POST /auth/refresh': () => errorResponse(401, 'INVALID_REFRESH_TOKEN'),
      });
      const provider = new LocalAuthProvider();
      const listener = vi.fn();
      provider.subscribe(listener);
      await provider.signIn(CREDENTIALS);

      await vi.advanceTimersByTimeAsync(TEST_ACCESS_TOKEN_TTL_MS);

      expect(listener).toHaveBeenLastCalledWith(null);
      await expect(provider.getAccessToken()).resolves.toBeNull();
    });
  });

  it('descarta una renovación en vuelo si el usuario cierra sesión', async () => {
    const pending = deferred<Response>();
    mockApi({
      'POST /auth/refresh': () => pending.promise,
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    });
    const provider = new LocalAuthProvider();

    const renewal = provider.getAccessToken({ forceRefresh: true });
    const signOut = provider.signOut();
    pending.resolve(jsonResponse(buildSession()));
    await Promise.all([renewal, signOut]);

    await expect(provider.getAccessToken()).resolves.toBeNull();
  });

  it('cambia la contraseña y adopta la sesión nueva sin cambio pendiente', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': () => jsonResponse(buildSession({ passwordChangeRequired: true })),
      'POST /auth/password/change': () =>
        jsonResponse(buildSession({ accessToken: 'access-token-after-change', passwordChangeRequired: false })),
    });
    const provider = new LocalAuthProvider();
    configureHttpClient({ getAccessToken: (options) => provider.getAccessToken(options) });
    await provider.signIn(CREDENTIALS);

    const session = await provider.changePassword({
      currentPassword: CREDENTIALS.password,
      newPassword: 'otra frase larga de prueba',
    });

    expect(session.passwordChangeRequired).toBe(false);
    const [changeCall] = callsTo(fetchMock, 'POST', '/auth/password/change');
    expect((changeCall?.headers as Headers).get('Authorization')).toBe('Bearer access-token-1');
    await expect(provider.getAccessToken()).resolves.toBe('access-token-after-change');
  });
});
