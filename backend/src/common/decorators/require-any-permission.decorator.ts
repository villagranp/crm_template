import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const REQUIRED_ANY_PERMISSIONS_KEY = 'requiredAnyPermissions';

/** Extensión OpenAPI que publica la lista de permisos alternativos y su semántica "uno de". */
export const OPENAPI_ANY_PERMISSION_EXTENSION = 'x-required-permissions-any-of';

/**
 * Declara permisos **alternativos** para el handler (addendum de 2026-10-10 a
 * ADR-008, D-01.1): basta con tener **uno** de ellos.
 *
 * - Abre la puerta, no concede ver todo: el caso de uso filtra cada fuente por su
 *   propio permiso (p. ej. la agenda solo incluye visitas con `visitas.ver`).
 * - No se combina con `@RequirePermission` en el mismo handler: `PermissionsGuard`
 *   lo trata como error de configuración y deniega (deny-by-default).
 * - Una lista vacía no concede nada.
 *
 * Se publica en OpenAPI como `x-required-permissions-any-of`.
 */
export const RequireAnyPermission = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions),
    ApiExtension(OPENAPI_ANY_PERMISSION_EXTENSION, { permissions, semantics: 'ANY_OF' }),
  );
