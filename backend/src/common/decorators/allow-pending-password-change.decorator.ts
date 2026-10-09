import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/**
 * Permite el endpoint a una sesión cuya contraseña debe cambiarse
 * (PLAN-AUTH-LOCAL, D13). Sin él, `AuthenticationGuard` responde
 * `403 PASSWORD_CHANGE_REQUIRED`.
 *
 * Solo lo lleva el propio cambio de contraseña: la contraseña inicial es
 * conocida por más gente que su dueño y no debe servir para nada más.
 */
export const AllowPendingPasswordChange = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
