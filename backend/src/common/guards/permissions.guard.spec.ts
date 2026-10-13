import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ANY_PERMISSIONS_KEY } from '@/common/decorators/require-any-permission.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '@/common/decorators/require-permission.decorator';
import type { PermissionResolver } from '@/infrastructure/authentication/ports/permission-resolver.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { PermissionsGuard } from './permissions.guard';

function contextWith(metadata: Record<string, unknown>): ExecutionContext {
  const handler = (): void => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ principal: { subjectId: 'u1' }, correlationId: 'c', originalUrl: '/x' }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard con @RequireAnyPermission (addendum ADR-008, D-01.1)', () => {
  const granted = new Set(['visitas.ver']);
  const resolver: PermissionResolver = { resolvePermissions: jest.fn(async () => granted) } as unknown as PermissionResolver;
  const guard = new PermissionsGuard(new Reflector(), resolver, { warn: jest.fn(), error: jest.fn() } as unknown as AppLogger);

  it('concede con uno cualquiera de los permisos alternativos', async () => {
    await expect(guard.canActivate(contextWith({ [ANY_PERMISSIONS_KEY]: ['actividades.ver', 'visitas.ver'] }))).resolves.toBe(true);
  });

  it('sin ninguno → 403', async () => {
    await expect(guard.canActivate(contextWith({ [ANY_PERMISSIONS_KEY]: ['actividades.ver', 'proyectos.ver'] }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('combinar @RequirePermission y @RequireAnyPermission es un error de configuración → 403', async () => {
    await expect(
      guard.canActivate(contextWith({ [ANY_PERMISSIONS_KEY]: ['visitas.ver'], [REQUIRED_PERMISSIONS_KEY]: ['visitas.ver'] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('@RequirePermission sigue exigiendo todos', async () => {
    await expect(guard.canActivate(contextWith({ [REQUIRED_PERMISSIONS_KEY]: ['visitas.ver'] }))).resolves.toBe(true);
    await expect(guard.canActivate(contextWith({ [REQUIRED_PERMISSIONS_KEY]: ['visitas.ver', 'proyectos.ver'] }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sin declaración sigue denegando (deny-by-default)', async () => {
    await expect(guard.canActivate(contextWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
