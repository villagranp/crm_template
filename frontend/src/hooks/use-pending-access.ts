import { useAuth } from '@/hooks/use-auth';

/**
 * `true` si la persona inició sesión pero aún no tiene ningún rol ni permiso: es el estado de un
 * usuario recién creado en el primer ingreso con Entra ID (ADR-027), que el administrador del CRM
 * todavía no ha habilitado.
 *
 * Coincide con la regla del servidor para `UserDetailResponseDto.pendingAccess` (usuario ACTIVE sin
 * rol vigente ni permisos directos vigentes): desde la sesión sólo se ve «sin roles y sin permisos»,
 * que es lo mismo para quien está activo. Es experiencia de usuario: el backend decide el acceso en
 * cada petición.
 */
export function usePendingAccess(): boolean {
  const { isAuthenticated, user } = useAuth();
  return isAuthenticated && user !== null && user.roles.length === 0 && user.permissions.length === 0;
}
