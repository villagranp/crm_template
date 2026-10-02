import { env } from '@/config/env';

import type { AuthProvider, AuthenticatedUser } from './auth-provider';

/**
 * Microsoft Entra ID adapter (MSAL) — architectural placeholder.
 *
 * The template deliberately does NOT depend on `@azure/msal-browser`: a tenant,
 * an app registration and a redirect URI are required before the dependency
 * adds any value, and section 85 of the brief forbids dependencies that are not
 * yet needed. The contract, configuration and wiring points are in place so
 * that enabling Entra ID is an adapter change, not an architectural change.
 *
 * To enable it (see `.claude/skills/entra-id/SKILL.md`):
 *   1. pnpm add @azure/msal-browser @azure/msal-react
 *   2. build a PublicClientApplication from `entraMsalConfig` below
 *   3. implement initialize/signIn/signOut/getAccessToken with
 *      ssoSilent + acquireTokenSilent, falling back to a redirect
 *   4. map ID token claims to AuthenticatedUser; permissions still come from
 *      the backend (ADR-008), never from the raw token claims
 */

export const entraMsalConfig = {
  auth: {
    clientId: env.VITE_ENTRA_CLIENT_ID ?? '',
    authority: env.VITE_ENTRA_AUTHORITY ?? '',
    redirectUri: env.VITE_ENTRA_REDIRECT_URI ?? '',
  },
  cache: {
    // Session storage limits token lifetime to the browser tab.
    cacheLocation: 'sessionStorage' as const,
    storeAuthStateInCookie: false,
  },
  apiScopes: env.VITE_ENTRA_API_SCOPE ? [env.VITE_ENTRA_API_SCOPE] : [],
};

const NOT_CONFIGURED_MESSAGE =
  'Entra ID provider is selected but no MSAL adapter is installed. Follow .claude/skills/entra-id/SKILL.md.';

export class EntraAuthProvider implements AuthProvider {
  readonly name = 'entra' as const;

  initialize(): Promise<AuthenticatedUser | null> {
    // Never throws: the shell must render so the error can be shown in the UI.
    return Promise.resolve(null);
  }

  signIn(): Promise<AuthenticatedUser | null> {
    return Promise.reject(new Error(NOT_CONFIGURED_MESSAGE));
  }

  signOut(): Promise<void> {
    return Promise.resolve();
  }

  getAccessToken(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
