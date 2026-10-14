import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedOnly } from '@/common/decorators/authenticated-only.decorator';
import { Public } from '@/common/decorators/public.decorator';
import {
  OPENAPI_ANY_PERMISSION_EXTENSION,
  RequireAnyPermission,
} from '@/common/decorators/require-any-permission.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import type { PermissionResolver } from '@/infrastructure/authentication/ports/permission-resolver.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { PermissionsGuard } from './permissions.guard';

/** Controlador de prueba: cada handler declara su acceso de una forma distinta. */
class SampleController {
  @RequirePermission('visitas.ver', 'actividades.ver')
  all(): void {}

  @RequireAnyPermission('visitas.ver', 'actividades.ver')
  anyOf(): void {}

  @RequireAnyPermission()
  emptyAnyOf(): void {}

  @RequirePermission('visitas.ver')
  @RequireAnyPermission('actividades.ver')
  both(): void {}

  undeclared(): void {}

  @Public('prueba')
  open(): void {}

  @AuthenticatedOnly('prueba')
  self(): void {}
}

@RequirePermission('clientes.ver')
class ClassLevelController {
  @RequireAnyPermission('visitas.ver')
  mixed(): void {}
}

/** Clave de metadatos de `ApiExtension` (`@nestjs/swagger`, `SWAGGER_EXTENSION_METADATA`). */
const SWAGGER_EXTENSION_METADATA = 'swagger/apiExtension';

const PRINCIPAL: AuthenticatedPrincipal = { subjectId: 'user-1', type: 'user', providerRoles: [], issuedBy: 'local' };

function contextFor(target: object, handler: string, principal: AuthenticatedPrincipal | null = PRINCIPAL): ExecutionContext {
  const request = { principal: principal ?? undefined, correlationId: 'corr-1', originalUrl: `/api/v1/${handler}?x=1` };
  const method = (target as { prototype: Record<string, () => void> }).prototype[handler];
  return {
    getHandler: () => method,
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(granted: string[]): { guard: PermissionsGuard; logger: { error: jest.Mock; warn: jest.Mock } } {
  const resolver: PermissionResolver = { resolvePermissions: jest.fn().mockResolvedValue(new Set(granted)) };
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
  return { guard: new PermissionsGuard(new Reflector(), resolver, logger as unknown as AppLogger), logger };
}

describe('PermissionsGuard', () => {
  describe('@RequirePermission (todos)', () => {
    it('concede con todos los permisos y deniega si falta uno', async () => {
      await expect(guardWith(['visitas.ver', 'actividades.ver']).guard.canActivate(contextFor(SampleController, 'all'))).resolves.toBe(true);
      const { guard, logger } = guardWith(['visitas.ver']);
      await expect(guard.canActivate(contextFor(SampleController, 'all'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(logger.warn).toHaveBeenCalledWith('authorization_denied', {
        correlationId: 'corr-1',
        path: '/api/v1/all',
        principalId: 'user-1',
        missingPermissions: ['actividades.ver'],
      });
    });
  });

  describe('@RequireAnyPermission (uno de)', () => {
    it.each([[['visitas.ver']], [['actividades.ver']], [['visitas.ver', 'actividades.ver']]])('concede con %j', async (granted) => {
      await expect(guardWith(granted).guard.canActivate(contextFor(SampleController, 'anyOf'))).resolves.toBe(true);
    });

    it('deniega (403) sin ninguno de los permisos', async () => {
      const { guard, logger } = guardWith(['clientes.ver']);
      await expect(guard.canActivate(contextFor(SampleController, 'anyOf'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(logger.warn).toHaveBeenCalledWith('authorization_denied', {
        correlationId: 'corr-1',
        path: '/api/v1/anyOf',
        principalId: 'user-1',
        missingAnyOf: ['visitas.ver', 'actividades.ver'],
      });
    });

    it('una lista vacía no concede nada', async () => {
      await expect(guardWith(['visitas.ver']).guard.canActivate(contextFor(SampleController, 'emptyAnyOf'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('sin sesión responde 401 antes de evaluar permisos', async () => {
      await expect(guardWith(['visitas.ver']).guard.canActivate(contextFor(SampleController, 'anyOf', null))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('combinado con @RequirePermission es un error de configuración y deniega aunque tenga todo', async () => {
      const { guard, logger } = guardWith(['visitas.ver', 'actividades.ver', 'clientes.ver']);
      await expect(guard.canActivate(contextFor(SampleController, 'both'))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(guard.canActivate(contextFor(ClassLevelController, 'mixed'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(logger.error).toHaveBeenCalledWith('endpoint_with_conflicting_permission_declarations', {
        correlationId: 'corr-1',
        path: '/api/v1/both',
      });
    });

    it('se publica en OpenAPI como extensión "uno de"', () => {
      const extensions = Reflect.getMetadata(SWAGGER_EXTENSION_METADATA, SampleController.prototype.anyOf) as Record<string, unknown>;
      expect(extensions[OPENAPI_ANY_PERMISSION_EXTENSION]).toEqual({ permissions: ['visitas.ver', 'actividades.ver'], semantics: 'ANY_OF' });
    });
  });

  it('deny-by-default: un handler sin declaración se rechaza', async () => {
    const { guard, logger } = guardWith(['visitas.ver']);
    await expect(guard.canActivate(contextFor(SampleController, 'undeclared'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(logger.error).toHaveBeenCalledWith('endpoint_without_permission_declaration', { correlationId: 'corr-1', path: '/api/v1/undeclared' });
  });

  it('público y autoservicio no exigen permiso', async () => {
    const { guard } = guardWith([]);
    await expect(guard.canActivate(contextFor(SampleController, 'open', null))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(SampleController, 'self'))).resolves.toBe(true);
  });
});
