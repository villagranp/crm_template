import { create } from 'zustand';

import { configureHttpClient } from '@/services/api/http-client';
import type { AuthProvider, AuthenticatedUser } from '@/services/auth';
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
  errorMessage: string | null;
  initialize: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

let provider: AuthProvider | null = null;

function getProvider(): AuthProvider {
  provider ??= createAuthProvider();
  return provider;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'initializing',
  user: null,
  errorMessage: null,

  initialize: async () => {
    const authProvider = getProvider();

    configureHttpClient({
      getAccessToken: () => authProvider.getAccessToken(),
      onUnauthorized: () => set({ status: 'anonymous', user: null }),
    });

    const user = await authProvider.initialize();
    set({ status: user ? 'authenticated' : 'anonymous', user, errorMessage: null });
  },

  signIn: async () => {
    try {
      const user = await getProvider().signIn();
      set({ status: user ? 'authenticated' : 'anonymous', user, errorMessage: null });
    } catch (error) {
      set({
        status: 'error',
        user: null,
        errorMessage: error instanceof Error ? error.message : 'Sign-in failed',
      });
    }
  },

  signOut: async () => {
    await getProvider().signOut();
    set({ status: 'anonymous', user: null, errorMessage: null });
  },
}));

/** Test-only seam: resets the memoised provider between test cases. */
export function resetAuthProviderForTests(): void {
  provider = null;
}
