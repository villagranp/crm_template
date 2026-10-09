import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '@/config/app-config.service';

import { PasswordService } from './password.service';
import { AUTH_REPOSITORY, type AuthRepository } from './ports/auth.repository.port';

/**
 * Contraseña inicial de los usuarios que gestiona un administrador
 * (PLAN-AUTH-LOCAL, D12 y D13).
 *
 * El valor sale de `AUTH_DEFAULT_PASSWORD` y siempre se asigna con cambio
 * obligatorio: quien la conoce solo puede usarla para fijar otra.
 */
@Injectable()
export class InitialCredentialService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly config: AppConfigService,
  ) {}

  /** Solo con autenticación local: con Entra ID no se crean credenciales locales. */
  isConfigured(): boolean {
    return this.config.isLocalAuthEnabled && Boolean(this.config.get('AUTH_DEFAULT_PASSWORD'));
  }

  /** Asigna la contraseña inicial. Devuelve `false` si no está configurada. */
  async assignDefaultPassword(userId: string): Promise<boolean> {
    const defaultPassword = this.config.get('AUTH_DEFAULT_PASSWORD');
    if (!this.isConfigured() || !defaultPassword) {
      return false;
    }

    await this.repository.setPassword(userId, {
      passwordHash: await this.passwordService.hash(defaultPassword),
      mustChangePassword: true,
      expiresAt: null,
      now: new Date(),
    });
    return true;
  }
}
