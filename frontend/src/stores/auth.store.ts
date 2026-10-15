import { create } from 'zustand';

import { ApiError } from '@/services/api/api-error';
import { configureHttpClient } from '@/services/api/http-client';
import { queryClient } from '@/services/api/query-client';
import type {
  AuthProvider,
  AuthSession,
  AuthenticatedUser,
  PasswordChangeInput,
  SignInCredentials,
} from '@/services/auth';
import { createAuthProvider } from '@/services/auth';

/**
 * Client-side authentication state.
 *
 * Zustand is used here — and only here in the Foundation — because session
 * state is genuinely client state shared across the tree. Server data belongs
 * to TanStack Query (ADR-001); do not cache API responses in this store.
 */

export type AuthStatus = 'initializing' | 'authenticated' | 'anonymous' | 'error';

interface AuthState {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  /**
   * The user signed in with an initial or reset password and must set their
   * own before using anything else (PLAN-AUTH-LOCAL D13). UX only: the API
   * rejects every other call with `403 PASSWORD_CHANGE_REQUIRED` regardless.
   */
  passwordChangeRequired: boolean;
  errorMessage: string | null;
  /**
   * El usuario cerró sesión él mismo. `RequireAuth` lo usa para no guardar la ruta actual como
   * destino de retorno: quien entre después (otro usuario, otros permisos) empieza en el inicio.
   * Una sesión caducada no lo activa y sí vuelve al sitio donde estaba.
   */
  signedOutByUser: boolean;
  initialize: () => Promise<void>;
  /** Rejects with the provider error so the form can explain it. */
  signIn: (credentials?: SignInCredentials) => Promise<void>;
  signOut: () => Promise<void>;
  /** Rejects with the provider error (e.g. `422 INVALID_CURRENT_PASSWORD`). */
  changePassword: (input: PasswordChangeInput) => Promise<void>;
}

const SIGN_IN_FAILED_MESSAGE = 'Sign-in failed';
const PASSWORD_CHANGE_UNSUPPORTED_MESSAGE = 'The configured authentication provider does not manage passwords.';

let provider: AuthProvider | null = null;
let unsubscribeFromProvider: (() => void) | null = null;

function getProvider(): AuthProvider {
  provider ??= createAuthProvider();
  return provider;
}

function sessionState(
  session: AuthSession | null,
): Pick<AuthState, 'status' | 'user' | 'passwordChangeRequired' | 'errorMessage'> {
  if (!session) {
    return { status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null };
  }
  return {
    status: 'authenticated',
    user: session.user,
    passwordChangeRequired: session.passwordChangeRequired,
    errorMessage: null,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'initializing',
  user: null,
  passwordChangeRequired: false,
  errorMessage: null,
  signedOutByUser: false,

  initialize: async () => {
    const authProvider = getProvider();

    configureHttpClient({
      getAccessToken: (options) => authProvider.getAccessToken(options),
      onUnauthorized: () => set(sessionState(null)),
      onPasswordChangeRequired: () => set({ passwordChangeRequired: true }),
    });

    // StrictMode runs the effect twice: never keep two subscriptions.
    unsubscribeFromProvider?.();
    unsubscribeFromProvider = authProvider.subscribe((session) => set(sessionState(session)));

    const session = await authProvider.initialize();
    set(sessionState(session));
  },

  signIn: async (credentials) => {
    try {
      const session = await getProvider().signIn(credentials);
      set({ ...sessionState(session), signedOutByUser: false });
    } catch (error) {
      // API errors are expected answers (wrong password, disabled account) and
      // the form explains them; anything else is a provider failure.
      if (!(error instanceof ApiError)) {
        set({
          status: 'error',
          user: null,
          passwordChangeRequired: false,
          errorMessage: error instanceof Error ? error.message : SIGN_IN_FAILED_MESSAGE,
        });
      }
      throw error;
    }
  },

  signOut: async () => {
    await getProvider().signOut();
    set({ ...sessionState(null), signedOutByUser: true });
  },

  changePassword: async (input) => {
    const authProvider = getProvider();
    if (!authProvider.changePassword) {
      throw new Error(PASSWORD_CHANGE_UNSUPPORTED_MESSAGE);
    }
    const session = await authProvider.changePassword(input);
    set(sessionState(session));
  },
}));

/**
 * Aislamiento entre usuarios: la caché de TanStack Query es del proceso, no del usuario, y claves
 * como `['me','preferences']` (`staleTime: Infinity`) no llevan el id. Se vacía entera cada vez que
 * cambia la identidad (cierre de sesión voluntario o caducado, o inicio de otro usuario sin
 * recargar). Renovar el token o cambiar la contraseña conserva el id y no la toca.
 */
useAuthStore.subscribe((state, previous) => {
  if ((state.user?.id ?? null) !== (previous.user?.id ?? null)) {
    queryClient.clear();
  }
});

/** Test-only seam: resets the memoised provider between test cases. */
export function resetAuthProviderForTests(): void {
  unsubscribeFromProvider?.();
  unsubscribeFromProvider = null;
  provider = null;
}
