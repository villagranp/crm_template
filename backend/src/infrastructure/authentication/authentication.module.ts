import { Global, Module, type Provider } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';
import { AUTHENTICATION_PROVIDER } from './ports/authentication-provider.port';
import { PERMISSION_RESOLVER } from './ports/permission-resolver.port';
import { LocalAuthenticationProvider } from './providers/local-authentication.provider';
import { EntraIdAuthenticationProvider } from './providers/entra-id-authentication.provider';
import { AccessModule } from '@/modules/access/access.module';
import { DatabasePermissionResolver } from './providers/database-permission.resolver';

/**
 * Selecciona el proveedor de autenticacion por configuracion (ADR-006).
 * El dominio y los casos de uso solo conocen el puerto, nunca la implementacion.
 *
 * AUTH_PROVIDER=hybrid queda definido pero NO habilitado: activarlo requiere un ADR
 * del proyecto que defina la resolucion de identidades duplicadas entre proveedores.
 */
const authenticationProvider: Provider = {
  provide: AUTHENTICATION_PROVIDER,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) => {
    switch (config.get('AUTH_PROVIDER')) {
      case 'entra':
        return new EntraIdAuthenticationProvider(config);
      case 'local':
        return new LocalAuthenticationProvider(config);
      case 'hybrid':
        throw new Error(
          'AUTH_PROVIDER=hybrid requiere un ADR del proyecto antes de habilitarse (ver ADR-006)',
        );
      default:
        throw new Error('AUTH_PROVIDER no soportado');
    }
  },
};

/**
 * Los permisos salen de la base de datos (roles + excepciones directas del
 * usuario), nunca de los claims del token. Ver ADR-008 y ADR-018.
 */
const permissionResolver: Provider = {
  provide: PERMISSION_RESOLVER,
  useClass: DatabasePermissionResolver,
};

@Global()
@Module({
  imports: [AccessModule],
  providers: [
    DatabasePermissionResolver,
    authenticationProvider,
    permissionResolver,
    LocalAuthenticationProvider,
    EntraIdAuthenticationProvider,
  ],
  exports: [AUTHENTICATION_PROVIDER, PERMISSION_RESOLVER],
})
export class AuthenticationModule {}
