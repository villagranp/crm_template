import type { AuthenticatedPrincipal, AuthProviderName } from './authenticated-principal';

export const AUTHENTICATION_PROVIDER = Symbol('AUTHENTICATION_PROVIDER');

/**
 * Puerto de autenticacion (ADR-006). Cada implementacion DEBE verificar, como minimo:
 * firma, issuer, audience, expiracion (exp) y not-before (nbf).
 * Lanza InvalidTokenError ante cualquier fallo, sin revelar el detalle al cliente.
 */
export interface AuthenticationProvider {
  readonly name: AuthProviderName;
  verifyAccessToken(token: string): Promise<AuthenticatedPrincipal>;
}

export class InvalidTokenError extends Error {
  /**
   * Código estable del rechazo (p. ej. `ERR_JWT_EXPIRED` de jose o `ENTRA_SCOPE_MISSING`), seguro de
   * registrar: nunca contiene datos del token. El guard registra solo esto.
   */
  constructor(
    reason: string,
    readonly code?: string,
  ) {
    super(reason);
    this.name = 'InvalidTokenError';
  }
}
