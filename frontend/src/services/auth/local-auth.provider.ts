import { ApiError } from '@/services/api/api-error';

import * as authApi from './auth.api';
import type { SessionResponse } from './auth.api';
import type {
  AccessTokenOptions,
  AuthProvider,
  AuthSession,
  PasswordChangeInput,
  SessionListener,
  SignInCredentials,
} from './auth-provider';
import { runWithSessionLock } from './session-lock';

/**
 * Local JWT adapter (PLAN-AUTH-LOCAL, ADR-019).
 *
 * - The access token lives in memory only: `localStorage` and `sessionStorage`
 *   are readable by any injected script, so a stolen token would survive a
 *   reload. Continuity relies on the HttpOnly refresh cookie set by the backend.
 * - The token is renewed shortly before `expiresAt` and, as a last resort, after
 *   a `401` from a protected call (the HTTP client retries once).
 * - Every operation that rotates the refresh cookie is serialized: one renewal
 *   in flight per tab (shared promise) and one across tabs (`session-lock.ts`).
 *   Presenting an already-rotated cookie twice makes the backend revoke every
 *   session of the user (D4).
 */

/** Renew this long before the token expires, to absorb clock skew and latency. */
export const REFRESH_LEEWAY_MS = 60_000;
/** Lower bound for the proactive timer, so a very short token cannot loop. */
const MIN_REFRESH_DELAY_MS = 5_000;
/** After a transient failure (network, 5xx) try again while the token lasts. */
const REFRESH_RETRY_DELAY_MS = 30_000;

const CREDENTIALS_REQUIRED_MESSAGE = 'Local sign-in requires an email and a password.';

function toAuthSession(response: SessionResponse): AuthSession {
  return {
    passwordChangeRequired: response.passwordChangeRequired,
    user: {
      id: response.user.id,
      email: response.user.email,
      displayName: response.user.displayName,
      roles: response.user.roles,
      permissions: response.user.permissions,
    },
  };
}

export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local' as const;

  private accessToken: string | null = null;
  private expiresAtMs = Number.POSITIVE_INFINITY;
  private renewalInFlight: Promise<AuthSession | null> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * True while this tab runs a task under the session lock. Web Locks are not
   * reentrant, so code running inside must never wait for a renewal.
   */
  private isHoldingSessionLock = false;
  /** Bumped on sign-out so a renewal that was already in flight is discarded. */
  private sessionGeneration = 0;
  private readonly listeners = new Set<SessionListener>();

  initialize(): Promise<AuthSession | null> {
    // renewSession never rejects: a missing cookie simply means "no session".
    return this.renewSession();
  }

  async signIn(credentials?: SignInCredentials): Promise<AuthSession | null> {
    if (!credentials) {
      throw new Error(CREDENTIALS_REQUIRED_MESSAGE);
    }

    const response = await this.runExclusive(() => authApi.login(credentials));
    return this.applySession(response);
  }

  async changePassword(input: PasswordChangeInput): Promise<AuthSession> {
    // Make sure the token is fresh BEFORE taking the lock: inside it, a renewal
    // would wait for the lock this same call is holding.
    await this.getAccessToken();

    const response = await this.runExclusive(() => authApi.changePassword(input));
    return this.applySession(response);
  }

  async signOut(): Promise<void> {
    this.sessionGeneration += 1;
    this.clearSession();
    try {
      await this.runExclusive(() => authApi.logout());
    } catch {
      // Sign-out must succeed locally even if the backend call fails; the
      // refresh cookie expires on its own (D2).
    }
  }

  async getAccessToken(options: AccessTokenOptions = {}): Promise<string | null> {
    if (options.forceRefresh) {
      const session = await this.renewSession();
      return session ? this.accessToken : null;
    }

    // While this tab holds the lock (password change in progress) any wait on
    // a renewal would be a wait on ourselves: hand out the current token.
    if (this.isHoldingSessionLock) {
      return this.accessToken;
    }

    if (this.renewalInFlight) {
      // Do not send a token that is being replaced right now.
      await this.renewalInFlight;
    } else if (this.accessToken && Date.now() >= this.expiresAtMs - REFRESH_LEEWAY_MS) {
      // Covers timers throttled by a background tab or a suspended laptop.
      await this.renewSession();
    }

    return this.accessToken;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** One renewal per tab: concurrent callers share the same promise. */
  private renewSession(): Promise<AuthSession | null> {
    this.renewalInFlight ??= this.runRenewal().finally(() => {
      this.renewalInFlight = null;
    });
    return this.renewalInFlight;
  }

  private async runRenewal(): Promise<AuthSession | null> {
    const generation = this.sessionGeneration;
    try {
      const response = await this.runExclusive(() => authApi.refreshSession());
      if (generation !== this.sessionGeneration) {
        return null;
      }
      const session = this.applySession(response);
      this.notify(session);
      return session;
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        // INVALID_REFRESH_TOKEN: missing, expired, revoked or reused cookie.
        const hadSession = this.accessToken !== null;
        this.clearSession();
        if (hadSession) {
          this.notify(null);
        }
        return null;
      }

      // Transient failure: keep the current token while it is still valid.
      if (this.accessToken) {
        this.scheduleRefresh(REFRESH_RETRY_DELAY_MS);
      }
      return null;
    }
  }

  private async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    return runWithSessionLock(async () => {
      this.isHoldingSessionLock = true;
      try {
        return await task();
      } finally {
        this.isHoldingSessionLock = false;
      }
    });
  }

  private applySession(response: SessionResponse): AuthSession {
    this.accessToken = response.accessToken;

    const expiresAtMs = Date.parse(response.expiresAt);
    // An unreadable expiry disables the proactive timer; the 401 retry still covers it.
    this.expiresAtMs = Number.isNaN(expiresAtMs) ? Number.POSITIVE_INFINITY : expiresAtMs;

    if (Number.isFinite(this.expiresAtMs)) {
      this.scheduleRefresh(this.expiresAtMs - REFRESH_LEEWAY_MS - Date.now());
    } else {
      this.cancelRefresh();
    }

    return toAuthSession(response);
  }

  private scheduleRefresh(delayMs: number): void {
    this.cancelRefresh();
    this.refreshTimer = setTimeout(
      () => {
        this.refreshTimer = null;
        void this.renewSession();
      },
      Math.max(delayMs, MIN_REFRESH_DELAY_MS),
    );
  }

  private cancelRefresh(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private clearSession(): void {
    this.cancelRefresh();
    this.accessToken = null;
    this.expiresAtMs = Number.POSITIVE_INFINITY;
  }

  private notify(session: AuthSession | null): void {
    for (const listener of this.listeners) {
      listener(session);
    }
  }
}
