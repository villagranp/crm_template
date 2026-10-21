import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AppEnvironment, parseOrigins } from './env.schema';

/**
 * Acceso tipado a la configuracion. El resto de la aplicacion no lee process.env.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<AppEnvironment, true>) {}

  get<K extends keyof AppEnvironment>(key: K): AppEnvironment[K] {
    return this.configService.get(key, { infer: true }) as AppEnvironment[K];
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get corsAllowedOrigins(): string[] {
    return parseOrigins(this.get('CORS_ALLOWED_ORIGINS'));
  }

  get isEntraEnabled(): boolean {
    const provider = this.get('AUTH_PROVIDER');
    return provider === 'entra' || provider === 'hybrid';
  }

  /** Ruta base absoluta de los adjuntos (ADR-021). La valida y crea `LocalFileSystemStorage` al arrancar. */
  get attachmentsStoragePath(): string {
    return resolve(this.get('ATTACHMENTS_STORAGE_PATH'));
  }

  get isLocalAuthEnabled(): boolean {
    const provider = this.get('AUTH_PROVIDER');
    return provider === 'local' || provider === 'hybrid';
  }
}
