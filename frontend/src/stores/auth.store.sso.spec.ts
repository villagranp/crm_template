import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/api-error';
import type * as AuthModule from '@/services/auth';
import type { AuthProvider } from '@/services/auth';
import { readReturnPath, saveReturnPath } from '@/services/auth';

import { resetAuthProviderForTests, useAuthStore } from './auth.store';

/** Comportamiento del store con un proveedor de redirección (Entra ID), con el proveedor simulado. */

const hoisted = vi.hoisted(() => ({ provider: null as unknown }));

vi.mock('@/services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthModule>();
  return { ...actual, createAuthProvider: () => hoisted.provider };
});

function fakeProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    name: 'entra',
    initialize: vi.fn().mockResolvedValue(null),
    signIn: vi.fn().mockResolvedValue(null),
    signOut: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn(() => () => undefined),
    ...overrides,
  };
}

describe('auth.store con un proveedor de redirección', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAuthProviderForTests();
    useAuthStore.setState({
      status: 'initializing',
      user: null,
      passwordChangeRequired: false,
      errorMessage: null,
      signInError: null,
      signedOutByUser: false,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    resetAuthProviderForTests();
  });

  it('initialize expone el fallo con el que volvió el inicio de sesión (p. ej. IDENTITY_NOT_LINKED)', async () => {
    const failure = new ApiError({ statusCode: 403, code: 'IDENTITY_NOT_LINKED', message: 'x', details: [] });
    hoisted.provider = fakeProvider({ consumeSignInError: vi.fn(() => failure) });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().signInError).toBe(failure);
  });

  it('initialize con sesión recuperada deja el fallo en null', async () => {
    hoisted.provider = fakeProvider({
      initialize: vi.fn().mockResolvedValue({
        passwordChangeRequired: false,
        user: { id: 'u-1', displayName: 'Persona', roles: [], permissions: [] },
      }),
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().signInError).toBeNull();
  });

  it('un nuevo intento de inicio de sesión limpia el fallo anterior', async () => {
    hoisted.provider = fakeProvider();
    useAuthStore.setState({ signInError: new Error('anterior') });

    await useAuthStore.getState().initialize();
    useAuthStore.setState({ signInError: new Error('anterior') });
    await useAuthStore.getState().signIn();

    expect(useAuthStore.getState().signInError).toBeNull();
  });

  it('el cierre de sesión voluntario borra la ruta de retorno y cierra en el proveedor', async () => {
    const provider = fakeProvider();
    hoisted.provider = provider;
    saveReturnPath('/clientes');
    await useAuthStore.getState().initialize();

    await useAuthStore.getState().signOut();

    expect(readReturnPath()).toBeNull();
    expect(provider.signOut).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().signedOutByUser).toBe(true);
  });
});
