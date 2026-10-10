import { Inject, Injectable } from '@nestjs/common';

import { AUTH_REPOSITORY, type AuthRepository } from './ports/auth.repository.port';

export type AttemptReservation =
  | { allowed: true; attemptNumber: number }
  /** `lockedUntil` solo viene si esta petición es la que activó el bloqueo. */
  | { allowed: false; lockedUntil: Date | null };

/**
 * Bloqueo temporal por intentos fallidos (PLAN-AUTH-LOCAL, D8).
 *
 * Cada intento **reserva su turno antes** de verificar la contraseña, con un
 * incremento atómico en la base. Así, aunque lleguen muchas peticiones a la
 * vez, solo las `maxFailedAttempts` primeras de la ventana llegan a verificar
 * una contraseña; el resto se rechaza sin verificarla. Leer el estado y
 * decidir después dejaría pasar a todas las que ya estuvieran en vuelo.
 *
 * Los umbrales salen de `system_parameters` en cada intento, así que un
 * administrador los ajusta sin desplegar.
 */
@Injectable()
export class LockoutService {
  constructor(@Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository) {}

  async reserveAttempt(credentialId: string, now: Date): Promise<AttemptReservation> {
    const settings = await this.repository.getSecuritySettings();
    const attemptNumber = await this.repository.reserveLoginAttempt(credentialId, now);

    if (attemptNumber === null) {
      return { allowed: false, lockedUntil: null };
    }
    if (attemptNumber > settings.maxFailedAttempts) {
      // Peticiones simultáneas que llegaron tras agotar la ventana.
      return { allowed: false, lockedUntil: await this.lock(credentialId, settings.lockoutMinutes, now) };
    }
    return { allowed: true, attemptNumber };
  }

  /** Tras un fallo verificado. Devuelve la fecha de desbloqueo si este fallo bloquea la cuenta. */
  async registerFailure(credentialId: string, attemptNumber: number, now: Date): Promise<Date | null> {
    const settings = await this.repository.getSecuritySettings();
    if (attemptNumber < settings.maxFailedAttempts) {
      return null;
    }
    return this.lock(credentialId, settings.lockoutMinutes, now);
  }

  /** Un acierto reinicia el contador. */
  async registerSuccess(credentialId: string): Promise<void> {
    await this.repository.clearFailedAttempts(credentialId);
  }

  private async lock(credentialId: string, lockoutMinutes: number, now: Date): Promise<Date | null> {
    const lockedUntil = new Date(now.getTime() + lockoutMinutes * 60_000);
    return (await this.repository.lockCredential(credentialId, lockedUntil, now)) ? lockedUntil : null;
  }
}
