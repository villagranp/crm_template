import { SetMetadata } from '@nestjs/common';

export const ANY_PERMISSIONS_KEY = 'anyPermissions';

/**
 * Declara permisos **alternativos**: basta con tener uno de ellos (addendum
 * 2026-10-10 de ADR-008, D-01.1). Para endpoints que mezclan fuentes con permisos
 * distintos (actividad reciente y alertas de Inicio, agenda del Módulo 4).
 *
 * El decorador solo abre la puerta: el caso de uso filtra cada fuente por su
 * propio permiso y alcance. No se combina con `@RequirePermission` en el mismo
 * handler (el guard lo trata como error de configuración y deniega).
 */
export const RequireAnyPermission = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
