import {
  BrowserAuthError,
  BrowserAuthErrorCodes,
  CacheLookupPolicy,
  EventType,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
  type IPublicClientApplication,
} from '@azure/msal-browser';

import { env } from '@/config/env';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { fetchProfile, type Profile } from '@/services/access';
import { ApiError } from '@/services/api/api-error';

import type {
  AccessTokenOptions,
  AuthProvider,
  AuthSession,
  SessionListener,
  SignInOptions,
} from './auth-provider';
import { clearReturnPath } from './return-path';

/**
 * Microsoft Entra ID adapter (MSAL) - ADR-007, ADR-027.
 *
 * - Authorization Code Flow + PKCE by REDIRECT. No popups and no hidden iframes: the site sends
 *   `Cross-Origin-Opener-Policy: same-origin` and `frame-ancestors 'none'`, neither works with them.
 * - The token that calls the API is the ACCESS token of the API scope (`VITE_ENTRA_API_SCOPE`).
 *   The id_token only identifies the user to this client and is never sent to the API (ADR-007).
 * - Permissions never come from token claims (ADR-008): once there is a token, the session is
 *   completed with `GET /me`, which is what the backend decides for this user.
 * - MSAL keeps its cache in `sessionStorage` (tab lifetime). No secret exists in the SPA.
 */

/** A renewal redirect started less than this long ago and not yet resolved blocks a new one. */
export const INTERACTIVE_RENEWAL_GUARD_MS = 2 * 60_000;
export const INTERACTIVE_RENEWAL_GUARD_KEY = 'auth.entra.interactiveRenewal';

/** Codes with which the backend refuses an Entra identity that has no usable account (ADR-027). */
export const SSO_ERROR_CODES = {
  identityNotLinked: 'IDENTITY_NOT_LINKED',
  identityIncomplete: 'IDENTITY_INCOMPLETE',
  provisioningDisabled: 'SSO_PROVISIONING_DISABLED',
  domainNotAllowed: 'IDENTITY_DOMAIN_NOT_ALLOWED',
} as const;

const SSO_REFUSAL_CODES: ReadonlySet<string> = new Set(Object.values(SSO_ERROR_CODES));

export function createEntraMsalConfig(): Configuration {
  return {
    auth: {
      clientId: env.VITE_ENTRA_CLIENT_ID ?? '',
      authority: env.VITE_ENTRA_AUTHORITY ?? '',
      redirectUri: env.VITE_ENTRA_REDIRECT_URI ?? '',
      postLogoutRedirectUri: `${window.location.origin}${ROUTE_PATHS.login}`,
      // The response lands on the dedicated callback route, which finishes the sign-in itself.
      // With `true` MSAL would navigate back to the page that started it, a second hop.
      navigateToLoginRequestUrl: false,
    },
    cache: {
      // Session storage limits token lifetime to the browser tab.
      cacheLocation: 'sessionStorage',
    },
  };
}

export function getEntraApiScopes(): string[] {
  return env.VITE_ENTRA_API_SCOPE ? [env.VITE_ENTRA_API_SCOPE] : [];
}

/**
 * Silent renewal that needs the user. MSAL signals it with `InteractionRequiredAuthError`, but when
 * its refresh token is unusable it can also fall back to a hidden iframe, which the CSP
 * (`frame-ancestors 'none'`, no `frame-src`) blocks: that surfaces after ~10 s as
 * `BrowserAuthError monitor_window_timeout`. Both mean "send the user to Microsoft".
 */
function requiresInteraction(error: unknown): boolean {
  return (
    error instanceof InteractionRequiredAuthError ||
    (error instanceof BrowserAuthError && error.errorCode === BrowserAuthErrorCodes.monitorWindowTimeout)
  );
}

/** MSAL keeps everything under the `msal.` prefix; used only when the client cannot be built. */
function clearMsalStorage(): void {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('msal.')) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage unavailable: nothing was written either.
  }
}

function toAuthSession(profile: Profile): AuthSession {
  return {
    // A federated provider never forces a local password change.
    passwordChangeRequired: false,
    user: {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      roles: profile.roles,
      permissions: profile.permissions,
    },
  };
}

function readGuardTimestamp(): number | null {
  try {
    const raw = sessionStorage.getItem(INTERACTIVE_RENEWAL_GUARD_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeGuard(): void {
  try {
    sessionStorage.setItem(INTERACTIVE_RENEWAL_GUARD_KEY, String(Date.now()));
  } catch {
    // Without storage the in-memory flag (`interactionStarted`) still covers this page load.
  }
}

function clearGuard(): void {
  try {
    sessionStorage.removeItem(INTERACTIVE_RENEWAL_GUARD_KEY);
  } catch {
    // Nothing to clear.
  }
}

function isGuardActive(): boolean {
  const startedAt = readGuardTimestamp();
  return startedAt !== null && Date.now() - startedAt < INTERACTIVE_RENEWAL_GUARD_MS;
}

/**
 * The browser is navigating away: the page will be discarded, so the pending request never
 * resolves. Returning `null` instead would let the request go out without a token and flash a `401`.
 */
function waitForNavigation(): Promise<never> {
  return new Promise<never>(() => undefined);
}

/**
 * `403` with one of the `IDENTITY_*` / `SSO_*` codes, or the `401` the backend answers when the
 * linked account is suspended, locked or deleted ("account not enabled").
 */
export function isIdentityRejection(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ((error.isForbidden && SSO_REFUSAL_CODES.has(error.code)) || error.isUnauthorized)
  );
}

export class EntraAuthProvider implements AuthProvider {
  readonly name = 'entra' as const;

  private clientPromise: Promise<IPublicClientApplication> | null = null;
  private initializing: Promise<AuthSession | null> | null = null;
  private signInError: unknown = null;
  /** A redirect for a renewal is already on its way: concurrent callers must not start another. */
  private interactionStarted = false;
  private readonly listeners = new Set<SessionListener>();

  initialize(): Promise<AuthSession | null> {
    // StrictMode runs the start-up effect twice: share one run so `GET /me` is not duplicated.
    this.initializing ??= this.runInitialize().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  /** The user never types credentials here: the sign-in happens on Microsoft's page. */
  async signIn(_credentials?: unknown, options: SignInOptions = {}): Promise<AuthSession | null> {
    this.signInError = null;
    const client = await this.getClient();
    // The browser leaves the page; the session is completed by `initialize()` on the callback route.
    // Without `prompt`, Microsoft reuses its current session: after a rejected account that would
    // bring the same wrong account back every time.
    await client.loginRedirect({
      scopes: getEntraApiScopes(),
      ...(options.selectAccount ? { prompt: 'select_account' } : {}),
    });
    return null;
  }

  async signOut(): Promise<void> {
    clearGuard();
    this.signInError = null;
    let client: IPublicClientApplication;
    try {
      client = await this.getClient();
    } catch {
      clearMsalStorage();
      return;
    }

    const account = this.resolveAccount(client);
    if (!account) {
      // No account to end at Microsoft, but leftovers (tokens, state) must not survive a sign-out.
      await this.discardLocalAccount(client);
      return;
    }
    // Clears the MSAL cache and ends the Microsoft session; returns to `/acceso`.
    await client.logoutRedirect({
      account,
      postLogoutRedirectUri: createEntraMsalConfig().auth.postLogoutRedirectUri,
    });
  }

  async getAccessToken(options: AccessTokenOptions = {}): Promise<string | null> {
    let client: IPublicClientApplication;
    try {
      client = await this.getClient();
    } catch {
      return null;
    }

    const account = this.resolveAccount(client);
    if (!account) {
      return null;
    }

    try {
      const result = await client.acquireTokenSilent({
        scopes: getEntraApiScopes(),
        account,
        forceRefresh: options.forceRefresh === true,
        // Never fall back to the hidden-iframe flow (blocked by the CSP): an unusable refresh token
        // must come out as `InteractionRequiredAuthError`, which leads to a controlled redirect.
        cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
      });
      clearGuard();
      return result.accessToken;
    } catch (error) {
      if (requiresInteraction(error)) {
        return this.renewWithRedirect(client, account);
      }
      // Transient failure (network, Microsoft unavailable): no token this time. The HTTP client
      // surfaces the `401`; the cached account remains, so the next attempt can still succeed.
      return null;
    }
  }

  consumeSignInError(): unknown {
    const error = this.signInError;
    this.signInError = null;
    return error;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getClient(): Promise<IPublicClientApplication> {
    this.clientPromise ??= this.createClient().catch((error: unknown) => {
      // Let a later call try again (e.g. storage that was blocked a moment ago).
      this.clientPromise = null;
      throw error;
    });
    return this.clientPromise;
  }

  private async createClient(): Promise<IPublicClientApplication> {
    const client = new PublicClientApplication(createEntraMsalConfig());
    await client.initialize();
    // The account was removed or the user logged out from elsewhere: the session is gone.
    client.addEventCallback(
      () => this.notify(null),
      [EventType.ACCOUNT_REMOVED, EventType.LOGOUT_SUCCESS],
    );
    return client;
  }

  private async runInitialize(): Promise<AuthSession | null> {
    try {
      const client = await this.getClient();
      // Consumes the `#code=...` the callback route was loaded with (no-op elsewhere).
      const redirectResult = await client.handleRedirectPromise();
      if (redirectResult?.account) {
        client.setActiveAccount(redirectResult.account);
        clearGuard();
      }

      if (!this.resolveAccount(client)) {
        return null;
      }
      return await this.loadSession(client);
    } catch (error) {
      // MSAL error (cancelled, `access_denied`, state mismatch...) or unusable storage: no session.
      this.signInError = error;
      return null;
    }
  }

  /** Permissions come from the backend, never from the token claims (ADR-008). */
  private async loadSession(client: IPublicClientApplication): Promise<AuthSession | null> {
    try {
      return toAuthSession(await fetchProfile());
    } catch (error) {
      this.signInError = error;
      if (isIdentityRejection(error)) {
        // The identity is valid for Microsoft but not for this application (not linked, no usable
        // email, domain not allowed, provisioning off) or its account is not enabled (`401`). Drop
        // only the local MSAL state (no redirect): otherwise every reload would repeat the refusal.
        // The saved return path goes too: it must not apply to whoever signs in next in this tab.
        clearReturnPath();
        await this.discardLocalAccount(client);
      }
      return null;
    }
  }

  private async discardLocalAccount(client: IPublicClientApplication): Promise<void> {
    try {
      await client.clearCache({ account: this.resolveAccount(client) });
    } catch {
      // The cache is tab-scoped; failing to clear it only means one more refusal on reload.
    }
  }

  private resolveAccount(client: IPublicClientApplication): AccountInfo | null {
    const active = client.getActiveAccount();
    if (active) {
      return active;
    }
    const [first] = client.getAllAccounts();
    if (!first) {
      return null;
    }
    client.setActiveAccount(first);
    return first;
  }

  /**
   * Silent renewal needs the user: one controlled redirect, never a loop.
   *
   * A redirect that was started recently and has not been resolved means the previous one did not
   * fix anything (the user cancelled, MFA failed...). Repeating it would bounce between this site
   * and Microsoft, so the session is dropped locally and the user sees the login screen.
   */
  private async renewWithRedirect(
    client: IPublicClientApplication,
    account: AccountInfo,
  ): Promise<string | null> {
    if (this.interactionStarted) {
      return waitForNavigation();
    }

    if (isGuardActive()) {
      clearGuard();
      await this.discardLocalAccount(client);
      this.notify(null);
      return null;
    }

    this.interactionStarted = true;
    writeGuard();
    try {
      await client.acquireTokenRedirect({ scopes: getEntraApiScopes(), account });
    } catch {
      this.interactionStarted = false;
      clearGuard();
      return null;
    }
    return waitForNavigation();
  }

  private notify(session: AuthSession | null): void {
    for (const listener of this.listeners) {
      listener(session);
    }
  }
}
