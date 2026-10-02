import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declara los permisos necesarios para ejecutar el handler.
 * Convencion: resource.action (customers.read, orders.approve).
 * Se exigen TODOS los permisos indicados.
 */
export const RequirePermission = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
