import {
  BrowserAuthError,
  CacheLookupPolicy,
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser';
import type * as MsalBrowser from '@azure/msal-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '@/config/env';
import { ApiError } from '@/services/api/api-error';
import { configureHttpClient } from '@/services/api/http-client';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';

import { readReturnPath, saveReturnPath } from './return-path';

import {
  createEntraMsalConfig,
  EntraAuthProvider,
  INTERACTIVE_RENEWAL_GUARD_KEY,
  INTERACTIVE_RENEWAL_GUARD_MS,
} from './entra-auth.provider';

/**
 * Estas pruebas usan `@azure/msal-browser` SIMULADO: verifican que el adaptador llama a MSAL como
 * debe (flujo de redirección, scope de la API, sin bucles) y que completa la sesión con `GET /me`.
 * No prueban nada contra un tenant real.
 */

const API_SCOPE = 'api://api-client-test/access_as_user';
const ACCOUNT = { homeAccountId: 'home-1', username: 'persona@example.test' } as AccountInfo;

const msal = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@azure/msal-browser', async (importOriginal) => {
  const actual = await importOriginal<typeof MsalBrowser>();
  return {
    ...actual,
    PublicClientApplication: vi.fn(function PublicClientApplication() {
      return msal.client;
    }),
  };
});

const PROFILE = {
  id: 'user-1',
  displayName: 'Persona de Prueba',
  email: 'persona@example.test',
  roles: ['usuario'],
  permissions: ['clientes.ver'],
  teams: [],
  dataScope: 'OWN',
};

function createFakeClient(initialAccount: AccountInfo | null = ACCOUNT) {
  let active: AccountInfo | null = null;
  const accounts = initialAccount ? [initialAccount] : [];
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
    getActiveAccount: vi.fn(() => active),
    setActiveAccount: vi.fn((account: AccountInfo | null) => {
      active = account;
    }),
    getAllAccounts: vi.fn((): AccountInfo[] => accounts),
    acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'api-access-token' }),
    acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    logoutRedirect: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn().mockResolvedValue(undefined),
    addEventCallback: vi.fn().mockReturnValue('callback-id'),
  };
}

type FakeClient = ReturnType<typeof createFakeClient>;

function useClient(client: FakeClient): FakeClient {
  msal.client = client;
  return client;
}

function newProvider(): EntraAuthProvider {
  const provider = new EntraAuthProvider();
  configureHttpClient({ getAccessToken: (options) => provider.getAccessToken(options) });
  return provider;
}

const previousEnv = { ...env };

beforeEach(() => {
  Object.assign(env, {
    VITE_AUTH_PROVIDER: 'entra',
    VITE_ENTRA_CLIENT_ID: 'spa-client-test',
    VITE_ENTRA_AUTHORITY: 'https://login.microsoftonline.com/tenant-test',
    VITE_ENTRA_REDIRECT_URI: 'http://localhost:5173/auth/callback',
    VITE_ENTRA_API_SCOPE: API_SCOPE,
  });
  sessionStorage.clear();
});

afterEach(() => {
  Object.assign(env, previousEnv);
  sessionStorage.clear();
  msal.client = null;
  configureHttpClient({ getAccessToken: () => Promise.resolve(null) });
});

describe('EntraAuthProvider', () => {
  describe('configuración de MSAL', () => {
    it('usa redirección con sessionStorage, la redirect URI de /auth/callback y vuelve a /acceso al cerrar', () => {
      const { auth, cache } = createEntraMsalConfig();

      expect(auth).toMatchObject({
        clientId: 'spa-client-test',
        authority: 'https://login.microsoftonline.com/tenant-test',
        redirectUri: 'http://localhost:5173/auth/callback',
        postLogoutRedirectUri: `${window.location.origin}/acceso`,
        navigateToLoginRequestUrl: false,
      });
      expect(cache?.cacheLocation).toBe('sessionStorage');
    });
  });

  describe('initialize', () => {
    it('sin cuenta en caché devuelve null, procesa la redirección y no llama a la API', async () => {
      const client = useClient(createFakeClient(null));
      const fetchMock = mockApi({ 'GET /me': () => jsonResponse(PROFILE) });

      await expect(newProvider().initialize()).resolves.toBeNull();

      expect(client.initialize).toHaveBeenCalledOnce();
      expect(client.handleRedirectPromise).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('con cuenta activa completa la sesión con GET /me y el access token de la API, no con los claims', async () => {
      const client = useClient(createFakeClient());
      const fetchMock = mockApi({ 'GET /me': () => jsonResponse(PROFILE) });

      const session = await newProvider().initialize();

      expect(session).toEqual({
        passwordChangeRequired: false,
        user: {
          id: 'user-1',
          displayName: 'Persona de Prueba',
          email: 'persona@example.test',
          roles: ['usuario'],
          permissions: ['clientes.ver'],
        },
      });
      expect(client.acquireTokenSilent).toHaveBeenCalledWith({
        scopes: [API_SCOPE],
        account: ACCOUNT,
        forceRefresh: false,
        cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
      });
      const [meCall] = callsTo(fetchMock, 'GET', '/me');
      expect((meCall?.headers as Headers).get('Authorization')).toBe('Bearer api-access-token');
    });

    it('al volver de Microsoft adopta la cuenta del resultado y limpia la guarda de renovación', async () => {
      const client = useClient(createFakeClient(null));
      client.handleRedirectPromise.mockResolvedValue({ account: ACCOUNT, accessToken: 'ignored' });
      client.getAllAccounts.mockReturnValue([ACCOUNT]);
      sessionStorage.setItem(INTERACTIVE_RENEWAL_GUARD_KEY, String(Date.now()));
      mockApi({ 'GET /me': () => jsonResponse(PROFILE) });

      const session = await newProvider().initialize();

      expect(client.setActiveAccount).toHaveBeenCalledWith(ACCOUNT);
      expect(session?.user.id).toBe('user-1');
      expect(sessionStorage.getItem(INTERACTIVE_RENEWAL_GUARD_KEY)).toBeNull();
    });

    it('dos arranques simultáneos (StrictMode) comparten una sola carga de /me', async () => {
      useClient(createFakeClient());
      const fetchMock = mockApi({ 'GET /me': () => jsonResponse(PROFILE) });
      const provider = newProvider();

      await Promise.all([provider.initialize(), provider.initialize()]);

      expect(callsTo(fetchMock, 'GET', '/me')).toHaveLength(1);
    });

    it('un 403 IDENTITY_NOT_LINKED deja la sesión en null, guarda el error y borra la caché local sin redirigir', async () => {
      const client = useClient(createFakeClient());
      mockApi({ 'GET /me': () => errorResponse(403, 'IDENTITY_NOT_LINKED') });
      const provider = newProvider();

      await expect(provider.initialize()).resolves.toBeNull();

      const error = provider.consumeSignInError();
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ statusCode: 403, code: 'IDENTITY_NOT_LINKED' });
      expect(client.clearCache).toHaveBeenCalledOnce();
      expect(client.logoutRedirect).not.toHaveBeenCalled();
      // Se entrega una sola vez.
      expect(provider.consumeSignInError()).toBeNull();
    });

    it.each(['IDENTITY_INCOMPLETE', 'SSO_PROVISIONING_DISABLED', 'IDENTITY_DOMAIN_NOT_ALLOWED'])(
      'un 403 %s también borra la caché local',
      async (code) => {
        const client = useClient(createFakeClient());
        mockApi({ 'GET /me': () => errorResponse(403, code) });

        await expect(newProvider().initialize()).resolves.toBeNull();

        expect(client.clearCache).toHaveBeenCalledOnce();
      },
    );

    it('un 401 de GET /me (cuenta suspendida, bloqueada o eliminada) guarda el error y borra sólo la caché local', async () => {
      const client = useClient(createFakeClient());
      mockApi({ 'GET /me': () => errorResponse(401, 'UNAUTHORIZED') });
      const provider = newProvider();

      await expect(provider.initialize()).resolves.toBeNull();

      expect(provider.consumeSignInError()).toMatchObject({ statusCode: 401 });
      expect(client.clearCache).toHaveBeenCalledOnce();
      expect(client.logoutRedirect).not.toHaveBeenCalled();
    });

    it('un rechazo de identidad borra la ruta de retorno guardada', async () => {
      useClient(createFakeClient());
      saveReturnPath('/clientes');
      mockApi({ 'GET /me': () => errorResponse(403, 'IDENTITY_NOT_LINKED') });

      await newProvider().initialize();

      expect(readReturnPath()).toBeNull();
    });

    it('un 403 de otro tipo (p. ej. permisos) no borra la caché local ni la ruta de retorno', async () => {
      const client = useClient(createFakeClient());
      saveReturnPath('/clientes');
      mockApi({ 'GET /me': () => errorResponse(403, 'FORBIDDEN') });

      await newProvider().initialize();

      expect(client.clearCache).not.toHaveBeenCalled();
      expect(readReturnPath()).toBe('/clientes');
    });

    it('un fallo de red en GET /me no borra la cuenta: sigue siendo recuperable', async () => {
      const client = useClient(createFakeClient());
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
      const provider = newProvider();

      await expect(provider.initialize()).resolves.toBeNull();

      expect(provider.consumeSignInError()).toMatchObject({ statusCode: 0 });
      expect(client.clearCache).not.toHaveBeenCalled();
    });

    it('un error de MSAL al procesar la redirección no lanza: devuelve null y lo guarda', async () => {
      const client = useClient(createFakeClient(null));
      const failure = new Error('access_denied');
      client.handleRedirectPromise.mockRejectedValue(failure);
      const provider = newProvider();

      await expect(provider.initialize()).resolves.toBeNull();

      expect(provider.consumeSignInError()).toBe(failure);
    });
  });

  describe('signIn', () => {
    it('inicia la redirección con el scope de la API, sin ventanas emergentes, y no devuelve sesión', async () => {
      const client = useClient(createFakeClient(null));
      const provider = newProvider();

      await expect(provider.signIn()).resolves.toBeNull();

      expect(client.loginRedirect).toHaveBeenCalledWith({ scopes: [API_SCOPE] });
      expect(client).not.toHaveProperty('loginPopup');
    });

    it('sin selectAccount no envía prompt: reutiliza la sesión de Microsoft', async () => {
      const client = useClient(createFakeClient(null));

      await newProvider().signIn(undefined, {});

      expect(client.loginRedirect.mock.calls[0]?.[0]).not.toHaveProperty('prompt');
    });

    it('con selectAccount pide a Microsoft que pregunte la cuenta (prompt select_account)', async () => {
      const client = useClient(createFakeClient(null));

      await newProvider().signIn(undefined, { selectAccount: true });

      expect(client.loginRedirect).toHaveBeenCalledWith({ scopes: [API_SCOPE], prompt: 'select_account' });
    });

    it('propaga el fallo de MSAL para que el store lo registre', async () => {
      const client = useClient(createFakeClient(null));
      client.loginRedirect.mockRejectedValue(new Error('interaction_in_progress'));

      await expect(newProvider().signIn()).rejects.toThrow('interaction_in_progress');
    });
  });

  describe('getAccessToken', () => {
    it('obtiene el token en silencio y lo renueva a la fuerza tras un 401', async () => {
      const client = useClient(createFakeClient());
      const provider = newProvider();

      await expect(provider.getAccessToken()).resolves.toBe('api-access-token');
      await provider.getAccessToken({ forceRefresh: true });

      expect(client.acquireTokenSilent).toHaveBeenLastCalledWith({
        scopes: [API_SCOPE],
        account: ACCOUNT,
        forceRefresh: true,
        // Nunca el iframe oculto (la CSP lo bloquea): sólo caché y refresh token.
        cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
      });
    });

    it('sin cuenta devuelve null y no toca a MSAL', async () => {
      const client = useClient(createFakeClient(null));

      await expect(newProvider().getAccessToken()).resolves.toBeNull();

      expect(client.acquireTokenSilent).not.toHaveBeenCalled();
    });

    it('un refresh token vencido que MSAL reporta con monitor_window_timeout (iframe bloqueado) redirige una vez', async () => {
      const client = useClient(createFakeClient());
      client.acquireTokenSilent.mockRejectedValue(new BrowserAuthError('monitor_window_timeout'));

      void newProvider().getAccessToken();

      await vi.waitFor(() => expect(client.acquireTokenRedirect).toHaveBeenCalledOnce());
      expect(client.acquireTokenRedirect).toHaveBeenCalledWith({ scopes: [API_SCOPE], account: ACCOUNT });
    });

    it('otros BrowserAuthError no se confunden con la necesidad de interacción', async () => {
      const client = useClient(createFakeClient());
      client.acquireTokenSilent.mockRejectedValue(new BrowserAuthError('no_network_connectivity'));

      await expect(newProvider().getAccessToken()).resolves.toBeNull();

      expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('un fallo de red en la renovación silenciosa devuelve null sin redirigir', async () => {
      const client = useClient(createFakeClient());
      client.acquireTokenSilent.mockRejectedValue(new Error('network_error'));

      await expect(newProvider().getAccessToken()).resolves.toBeNull();

      expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('si hace falta interacción redirige UNA vez aunque lo pidan varias llamadas a la vez', async () => {
      const client = useClient(createFakeClient());
      client.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('interaction_required'));
      const provider = newProvider();

      const calls = [provider.getAccessToken(), provider.getAccessToken(), provider.getAccessToken()];
      const settled = await Promise.race([
        Promise.all(calls).then(() => 'settled'),
        new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 50)),
      ]);

      expect(client.acquireTokenRedirect).toHaveBeenCalledOnce();
      expect(client.acquireTokenRedirect).toHaveBeenCalledWith({ scopes: [API_SCOPE], account: ACCOUNT });
      // El navegador se está yendo: ninguna petición sale sin token ni con un 401 en pantalla.
      expect(settled).toBe('pending');
      expect(sessionStorage.getItem(INTERACTIVE_RENEWAL_GUARD_KEY)).not.toBeNull();
    });

    it('no entra en bucle: si ya se redirigió hace poco y no se resolvió, cierra la sesión local y avisa', async () => {
      const client = useClient(createFakeClient());
      client.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('interaction_required'));
      // La página se recargó tras volver de Microsoft sin conseguir token: la guarda persiste.
      sessionStorage.setItem(INTERACTIVE_RENEWAL_GUARD_KEY, String(Date.now()));
      const provider = newProvider();
      const listener = vi.fn();
      provider.subscribe(listener);

      await expect(provider.getAccessToken()).resolves.toBeNull();

      expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
      expect(client.clearCache).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(null);
      expect(sessionStorage.getItem(INTERACTIVE_RENEWAL_GUARD_KEY)).toBeNull();
    });

    it('una guarda caducada ya no bloquea: se puede volver a redirigir', async () => {
      const client = useClient(createFakeClient());
      client.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('interaction_required'));
      sessionStorage.setItem(
        INTERACTIVE_RENEWAL_GUARD_KEY,
        String(Date.now() - INTERACTIVE_RENEWAL_GUARD_MS - 1_000),
      );

      void newProvider().getAccessToken();

      await vi.waitFor(() => expect(client.acquireTokenRedirect).toHaveBeenCalledOnce());
    });

    it('un token obtenido en silencio limpia la guarda', async () => {
      useClient(createFakeClient());
      sessionStorage.setItem(INTERACTIVE_RENEWAL_GUARD_KEY, String(Date.now()));

      await newProvider().getAccessToken();

      expect(sessionStorage.getItem(INTERACTIVE_RENEWAL_GUARD_KEY)).toBeNull();
    });

    it('si acquireTokenRedirect falla devuelve null y libera la guarda para un nuevo intento', async () => {
      const client = useClient(createFakeClient());
      client.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('interaction_required'));
      client.acquireTokenRedirect.mockRejectedValue(new Error('interaction_in_progress'));

      await expect(newProvider().getAccessToken()).resolves.toBeNull();

      expect(sessionStorage.getItem(INTERACTIVE_RENEWAL_GUARD_KEY)).toBeNull();
    });
  });

  describe('signOut', () => {
    it('cierra con logoutRedirect para la cuenta activa y vuelve a /acceso', async () => {
      const client = useClient(createFakeClient());
      sessionStorage.setItem(INTERACTIVE_RENEWAL_GUARD_KEY, String(Date.now()));

      await newProvider().signOut();

      expect(client.logoutRedirect).toHaveBeenCalledWith({
        account: ACCOUNT,
        postLogoutRedirectUri: `${window.location.origin}/acceso`,
      });
      expect(sessionStorage.getItem(INTERACTIVE_RENEWAL_GUARD_KEY)).toBeNull();
    });

    it('sin cuenta no redirige a Microsoft pero sí limpia la caché de MSAL', async () => {
      const client = useClient(createFakeClient(null));

      await expect(newProvider().signOut()).resolves.toBeUndefined();

      expect(client.logoutRedirect).not.toHaveBeenCalled();
      expect(client.clearCache).toHaveBeenCalledOnce();
    });

    it('si el cliente no se puede crear borra igualmente lo que MSAL dejó en sessionStorage', async () => {
      const client = useClient(createFakeClient());
      client.initialize.mockRejectedValue(new Error('storage blocked'));
      sessionStorage.setItem('msal.token.keys.client', '{}');
      sessionStorage.setItem('otra.clave', 'se conserva');

      await expect(newProvider().signOut()).resolves.toBeUndefined();

      expect(sessionStorage.getItem('msal.token.keys.client')).toBeNull();
      expect(sessionStorage.getItem('otra.clave')).toBe('se conserva');
    });
  });

  describe('subscribe', () => {
    it('avisa de la pérdida de sesión cuando MSAL quita la cuenta y deja de avisar al darse de baja', async () => {
      const client = useClient(createFakeClient());
      mockApi({ 'GET /me': () => jsonResponse(PROFILE) });
      const provider = newProvider();
      const listener = vi.fn();
      const unsubscribe = provider.subscribe(listener);
      await provider.initialize();

      const [callback, eventTypes] = client.addEventCallback.mock.calls[0] as [() => void, string[]];
      expect(eventTypes).toEqual(expect.arrayContaining(['msal:accountRemoved', 'msal:logoutSuccess']));

      callback();
      expect(listener).toHaveBeenCalledWith(null);

      unsubscribe();
      callback();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
