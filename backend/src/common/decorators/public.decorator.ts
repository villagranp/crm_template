import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como accesible sin autenticacion.
 * OBLIGATORIO documentar la razon en el codigo y en la user story:
 * el guard global es deny-by-default y este decorador es la unica excepcion.
 *
 * @param reason Justificacion del acceso publico (queda en el codigo para la revision).
 */
export const Public = (reason: string): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, { isPublic: true, reason });
