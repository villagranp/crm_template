import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_ONLY_KEY = 'authenticatedOnly';

/**
 * Marca un endpoint que exige sesión pero **no** un permiso concreto.
 *
 * Es la única excepción legítima a la regla "todo endpoint declara permiso":
 * los endpoints de autoservicio, donde el recurso es el propio usuario
 * (`/me`, `/me/menu`, cambio de la propia contraseña). Cualquier otro caso
 * necesita `@RequirePermission`.
 *
 * La razón es obligatoria para que la excepción quede justificada en el código
 * y se vea en la revisión.
 */
export const AuthenticatedOnly = (reason: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ONLY_KEY, { reason });
