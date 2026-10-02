import type { AuthenticatedPrincipal } from './authenticated-principal';

export const PERMISSION_RESOLVER = Symbol('PERMISSION_RESOLVER');

/**
 * Traduce la identidad autenticada a permisos de aplicacion (resource.action).
 * Separa autenticacion de autorizacion (ADR-008): los roles del proveedor se MAPEAN,
 * nunca se confia directamente en un claim para decidir acceso.
 */
export interface PermissionResolver {
  resolvePermissions(principal: AuthenticatedPrincipal): Promise<ReadonlySet<string>>;
}
