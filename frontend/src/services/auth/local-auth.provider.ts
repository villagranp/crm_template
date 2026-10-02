import { httpClient } from '@/services/api/http-client';

import type { AuthProvider, AuthenticatedUser } from './auth-provider';

/**
 * Local JWT adapter.
 *
 * Foundation scope: session restore and sign-out are wired, sign-in is NOT
 * implemented because the template ships no user store and no login endpoint
 * (see section 99 of the template brief: no business functionality).
 *
 * When a project enables local authentication it implements `POST /auth/login`
 * on the backend and completes `signIn()` here. The access token is kept in
 * memory only: `localStorage` is readable by any injected script, so a stolen
 * token would survive a page reload. Session continuity relies on an
 * HttpOnly + Secure + SameSite refresh cookie issued by the backend.
 */

interface SessionResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

const NOT_IMPLEMENTED_MESSAGE =
  'Local sign-in is not implemented in the template. Implement the backend auth module and complete LocalAuthProvider.signIn().';

export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local' as const;

  private accessToken: string | null = null;

  async initialize(): Promise<AuthenticatedUser | null> {
    try {
      const session = await httpClient.post<SessionResponse>('/auth/refresh', { isPublic: true });
      this.accessToken = session.accessToken;
      return session.user;
    } catch {
      // No active session, or the endpoint does not exist yet in this project.
      this.accessToken = null;
      return null;
    }
  }

  signIn(): Promise<AuthenticatedUser | null> {
    return Promise.reject(new Error(NOT_IMPLEMENTED_MESSAGE));
  }

  async signOut(): Promise<void> {
    this.accessToken = null;
    try {
      await httpClient.post<void>('/auth/logout');
    } catch {
      // Sign-out must succeed locally even if the backend call fails.
    }
  }

  getAccessToken(): Promise<string | null> {
    return Promise.resolve(this.accessToken);
  }
}
