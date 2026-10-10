/**
 * Frontend authentication port.
 *
 * Mirrors the backend contract in ADR-006: the application depends on this
 * interface, never on MSAL or on a local JWT implementation directly. Adding a
 * third provider means adding an adapter, not editing feature code.
 */

export interface AuthenticatedUser {
  /** Stable subject identifier issued by the provider. */
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
  permissions: string[];
}

/**
 * What the application knows about the current session.
 *
 * `passwordChangeRequired` only ever becomes `true` with the local provider
 * (PLAN-AUTH-LOCAL D13); a federated provider always reports `false`.
 */
export interface AuthSession {
  user: AuthenticatedUser;
  passwordChangeRequired: boolean;
}

/**
 * Credentials typed by the user. Only providers that own the credential (local)
 * use them; redirect-based providers (Entra ID) ignore the argument.
 */
export interface SignInCredentials {
  email: string;
  password: string;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export interface AccessTokenOptions {
  /** Discards the cached token and obtains a new one (used after a `401`). */
  forceRefresh?: boolean;
}

/** Receives the new session, or `null` when the provider lost it on its own. */
export type SessionListener = (session: AuthSession | null) => void;

export interface AuthProvider {
  readonly name: 'local' | 'entra';

  /** Restores an existing session on application start. Never throws. */
  initialize(): Promise<AuthSession | null>;

  /**
   * Starts the sign-in flow. May redirect the browser.
   * Rejects with the provider error (e.g. `ApiError`) so the UI can explain it.
   */
  signIn(credentials?: SignInCredentials): Promise<AuthSession | null>;

  /** Clears the local session and, where applicable, the provider session. */
  signOut(): Promise<void>;

  /** Returns a valid access token, refreshing it when the provider supports it. */
  getAccessToken(options?: AccessTokenOptions): Promise<string | null>;

  /**
   * Changes the user's own password. Only providers that own the credential
   * implement it; with a federated provider the identity provider does it.
   */
  changePassword?(input: PasswordChangeInput): Promise<AuthSession>;

  /**
   * Notifies session changes the application did not initiate: a background
   * refresh that brings new data, or a session that could not be renewed.
   * Returns the unsubscribe function.
   */
  subscribe(listener: SessionListener): () => void;
}

export function hasPermission(user: AuthenticatedUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}
