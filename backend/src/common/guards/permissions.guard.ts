import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { AUTHENTICATED_ONLY_KEY } from '@/common/decorators/authenticated-only.decorator';
import { REQUIRED_ANY_PERMISSIONS_KEY } from '@/common/decorators/require-any-permission.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '@/common/decorators/require-permission.decorator';
import {
  PERMISSION_RESOLVER,
  type PermissionResolver,
} from '@/infrastructure/authentication/ports/permission-resolver.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AppRequest } from '@/common/types/request-context';

/**
 * Guard global de autorizacion (ADR-008).
 *
 * Deny-by-default: un endpoint autenticado que no declare @RequirePermission ni
 * @RequireAnyPermission se rechaza, para que ningun handler quede sin decision de acceso
 * por olvido.
 *
 * - `@RequirePermission(a, b)`: exige TODOS los permisos.
 * - `@RequireAnyPermission(a, b)` (addendum ADR-008, D-01.1): exige AL MENOS UNO. El caso de
 *   uso filtra despues cada fuente por su propio permiso.
 * - Declarar ambos en el mismo handler es un error de configuracion: se deniega.
 *
 * El permiso NO sustituye la verificacion de propiedad del recurso, que vive en el caso de uso.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_RESOLVER) private readonly permissionResolver: PermissionResolver,
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

    const requiredPermissions = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const anyOfPermissions = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<AppRequest>();

    if (!request.principal) {
      throw new UnauthorizedException('Authentication required');
    }

    // Autoservicio: el recurso es el propio usuario, no hace falta un permiso.
    const authenticatedOnly = this.reflector.getAllAndOverride<{ reason: string } | undefined>(
      AUTHENTICATED_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (authenticatedOnly) {
      return true;
    }

    const path = request.originalUrl.split('?')[0];
    const hasAll = requiredPermissions !== undefined && requiredPermissions.length > 0;
    const hasAnyOf = anyOfPermissions !== undefined;

    if (hasAll && hasAnyOf) {
      this.logger.error('endpoint_with_conflicting_permission_declarations', {
        correlationId: request.correlationId,
        path,
      });
      throw new ForbiddenException('Endpoint declares both required and alternative permissions');
    }

    if (!hasAll && !hasAnyOf) {
      this.logger.error('endpoint_without_permission_declaration', {
        correlationId: request.correlationId,
        path,
      });
      throw new ForbiddenException('Endpoint has no permission declaration');
    }

    const granted = await this.permissionResolver.resolvePermissions(request.principal);

    if (hasAnyOf) {
      // Una lista vacia no concede nada (deny-by-default).
      if (!anyOfPermissions.some((permission) => granted.has(permission))) {
        this.logger.warn('authorization_denied', {
          correlationId: request.correlationId,
          path,
          principalId: request.principal.subjectId,
          missingAnyOf: anyOfPermissions,
        });
        throw new ForbiddenException('Insufficient permissions');
      }
      return true;
    }

    const missing = (requiredPermissions ?? []).filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      this.logger.warn('authorization_denied', {
        correlationId: request.correlationId,
        path,
        principalId: request.principal.subjectId,
        missingPermissions: missing,
      });
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
