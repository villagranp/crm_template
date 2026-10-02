/**
 * Modelo interno de identidad. El dominio NUNCA conoce Entra ID ni el formato del token.
 * Los permisos no viven aqui: los resuelve PermissionResolver (ADR-008).
 */
export interface AuthenticatedPrincipal {
  /** Identificador estable del sujeto (sub / oid). Nunca el correo. */
  readonly subjectId: string;
  readonly type: 'user' | 'service';
  readonly tenantId?: string;
  readonly email?: string;
  readonly displayName?: string;
  /** Roles tal como llegan del proveedor, antes de mapearse a permisos. */
  readonly providerRoles: readonly string[];
  readonly issuedBy: AuthProviderName;
}

export type AuthProviderName = 'local' | 'entra' | 'service';
