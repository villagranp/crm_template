import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import {
  AUTHENTICATION_PROVIDER,
  type AuthenticationProvider,
} from '@/infrastructure/authentication/ports/authentication-provider.port';
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
      return true;
    } catch {
      // El detalle del fallo se registra, pero nunca se devuelve al cliente.
      this.logger.warn('authentication_failed', {
        correlationId: request.correlationId,
        path: request.originalUrl.split('?')[0],
      });
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractBearerToken(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
