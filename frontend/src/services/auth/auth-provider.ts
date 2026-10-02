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

export interface AuthProvider {
  readonly name: 'local' | 'entra';

  /** Restores an existing session on application start. Never throws. */
  initialize(): Promise<AuthenticatedUser | null>;

  /** Starts the sign-in flow. May redirect the browser. */
  signIn(): Promise<AuthenticatedUser | null>;

  /** Clears the local session and, where applicable, the provider session. */
  signOut(): Promise<void>;

  /** Returns a valid access token, refreshing it when the provider supports it. */
  getAccessToken(): Promise<string | null>;
}

export function hasPermission(user: AuthenticatedUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}
