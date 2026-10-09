import { type CanActivate, Injectable, NotFoundException } from '@nestjs/common';

import { AppConfigService } from '@/config/app-config.service';

/**
 * Con `AUTH_PROVIDER=entra` la autenticación local no existe: sus endpoints
 * responden 404 como cualquier ruta inexistente. Sin esto, una credencial local
 * olvidada seguiría siendo una puerta de entrada paralela a Entra ID.
 */
@Injectable()
export class LocalAuthEnabledGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(): boolean {
    if (!this.config.isLocalAuthEnabled) {
      throw new NotFoundException();
    }
    return true;
  }
}
