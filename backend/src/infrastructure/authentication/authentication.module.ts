import { Global, Module, type Provider } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';
import { AUTHENTICATION_PROVIDER } from './ports/authentication-provider.port';
import { PERMISSION_RESOLVER } from './ports/permission-resolver.port';
import { LocalAuthenticationProvider } from './providers/local-authentication.provider';
import { EntraIdAuthenticationProvider } from './providers/entra-id-authentication.provider';
import { AccessModule } from '@/modules/access/access.module';
import { DatabasePermissionResolver } from './providers/database-permission.resolver';
import { PRINCIPAL_ADMISSION } from './ports/principal-admission.port';
import { SsoProvisioningService } from '@/modules/access/sso-provisioning.service';

/**
 * Selecciona el proveedor de autenticacion por configuracion (ADR-006).
 * El dominio y los casos de uso solo conocen el puerto, nunca la implementacion.
 *
 * AUTH_PROVIDER=hybrid queda definido en la configuracion pero NO se implementa: ADR-027 decidio un
 * corte directo de `local` a `entra`, sin ventana con dos proveedores a la vez.
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
          'AUTH_PROVIDER=hybrid no está soportado: el corte a Entra ID es directo, sin modo híbrido (ver ADR-027)',
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

/**
 * Admisión tras verificar el token (ADR-027): con Entra ID crea la cuenta del primer ingreso o
 * rechaza con 403; con `local` no hace nada. La implementa el módulo de acceso.
 */
const principalAdmission: Provider = {
  provide: PRINCIPAL_ADMISSION,
  useExisting: SsoProvisioningService,
};

@Global()
@Module({
  imports: [AccessModule],
  providers: [
    DatabasePermissionResolver,
    authenticationProvider,
    permissionResolver,
    principalAdmission,
    LocalAuthenticationProvider,
    EntraIdAuthenticationProvider,
  ],
  exports: [AUTHENTICATION_PROVIDER, PERMISSION_RESOLVER, PRINCIPAL_ADMISSION],
})
export class AuthenticationModule {}
