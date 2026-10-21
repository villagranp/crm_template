import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '@/common/decorators/allow-pending-password-change.decorator';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import {
  AUTHENTICATION_PROVIDER,
  type AuthenticationProvider,
  InvalidTokenError,
} from '@/infrastructure/authentication/ports/authentication-provider.port';
import {
  PRINCIPAL_ADMISSION,
  type PrincipalAdmission,
} from '@/infrastructure/authentication/ports/principal-admission.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AppRequest } from '@/common/types/request-context';

/**
 * Guard global de autenticacion: deny-by-default.
 * Un endpoint solo queda abierto si lo marca @Public('razon').
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHENTICATION_PROVIDER)
    private readonly authenticationProvider: AuthenticationProvider,
    @Inject(PRINCIPAL_ADMISSION)
    private readonly admission: PrincipalAdmission,
    private readonly logger: AppLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publicMetadata = this.reflector.getAllAndOverride<{ isPublic: boolean } | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (publicMetadata?.isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = this.extractBearerToken(request.header('authorization'));

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      request.principal = await this.authenticationProvider.verifyAccessToken(token);
    } catch (error) {
      // Se registra solo el código del rechazo (p. ej. ERR_JWT_EXPIRED): ni el mensaje, que puede citar
      // claims del token, ni el token. Nada de esto se devuelve al cliente.
      this.logger.warn('authentication_failed', {
        correlationId: request.correlationId,
        path: request.originalUrl.split('?')[0],
        reason: error instanceof InvalidTokenError ? (error.code ?? 'ERR_TOKEN_INVALID') : 'ERR_UNEXPECTED',
      });
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // ADR-027: con Entra ID, un token válido no basta: la identidad debe tener cuenta local (o crearla en el
    // primer ingreso). Los 403 `IDENTITY_*` y `SSO_PROVISIONING_DISABLED` salen de aquí, no se convierten en 401.
    await this.admission.admit(request.principal, {
      correlationId: request.correlationId,
      ipAddress: request.ip ?? null,
    });

    // D13: con una contraseña asignada por otro, la sesión solo sirve para cambiarla.
    if (request.principal.passwordChangeRequired && !this.allowsPendingPasswordChange(context)) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must set a new password before continuing',
      });
    }

    return true;
  }

  private allowsPendingPasswordChange(context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
  }

  private extractBearerToken(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
