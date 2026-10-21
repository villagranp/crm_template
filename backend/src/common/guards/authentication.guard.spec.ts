import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { AccessDeniedError } from '@/common/errors/application-error';
import { httpStatusOf } from '@/common/filters/all-exceptions.filter';
import { InvalidTokenError, type AuthenticationProvider } from '@/infrastructure/authentication/ports/authentication-provider.port';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import type { PrincipalAdmission } from '@/infrastructure/authentication/ports/principal-admission.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { AuthenticationGuard } from './authentication.guard';

const PRINCIPAL: AuthenticatedPrincipal = { subjectId: 'oid-1', type: 'user', email: 'ana@example.invalid', providerRoles: [], issuedBy: 'entra' };

interface Metadata {
  isPublic?: boolean;
  allowPendingPasswordChange?: boolean;
}

function build(options: { metadata?: Metadata; principal?: AuthenticatedPrincipal; verifyError?: Error; admitError?: Error; header?: string | undefined } = {}) {
  const order: string[] = [];
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'isPublic') return options.metadata?.isPublic ? { isPublic: true } : undefined;
      return options.metadata?.allowPendingPasswordChange ? true : undefined;
    }),
  };
  const provider: AuthenticationProvider = {
    name: 'entra',
    verifyAccessToken: jest.fn(async () => {
      order.push('verify');
      if (options.verifyError) throw options.verifyError;
      return options.principal ?? PRINCIPAL;
    }),
  };
  const admission: PrincipalAdmission = {
    admit: jest.fn(async () => {
      order.push('admit');
      if (options.admitError) throw options.admitError;
    }),
  };
  const logger = { warn: jest.fn() };
  const guard = new AuthenticationGuard(reflector as unknown as Reflector, provider, admission, logger as unknown as AppLogger);

  const request: Record<string, unknown> = {
    correlationId: 'corr-1',
    ip: '203.0.113.7',
    originalUrl: '/api/v1/me?x=1',
    header: (name: string) => (name === 'authorization' ? ('header' in options ? options.header : 'Bearer token-secreto') : undefined),
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard, context, request, provider, admission, logger, order, reflector };
}

describe('AuthenticationGuard · admisión (ADR-027)', () => {
  it('verifica el token, admite a la identidad con la correlación y la IP, y deja el principal en la petición', async () => {
    const { guard, context, request, admission, order } = build();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(order).toEqual(['verify', 'admit']);
    expect(request['principal']).toBe(PRINCIPAL);
    expect(admission.admit).toHaveBeenCalledWith(PRINCIPAL, { correlationId: 'corr-1', ipAddress: '203.0.113.7' });
  });

  it('una ruta pública no verifica ni admite', async () => {
    const { guard, context, provider, admission } = build({ metadata: { isPublic: true }, header: undefined });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(provider.verifyAccessToken).not.toHaveBeenCalled();
    expect(admission.admit).not.toHaveBeenCalled();
  });

  it('sin token: 401 y no se admite a nadie', async () => {
    const { guard, context, admission } = build({ header: undefined });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(admission.admit).not.toHaveBeenCalled();
  });

  it('un token inválido es 401 y no llega a la admisión', async () => {
    const { guard, context, admission } = build({ verifyError: new InvalidTokenError('detalle', 'ERR_JWT_EXPIRED') });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(admission.admit).not.toHaveBeenCalled();
  });

  it('un rechazo de la admisión sale como 403 con su código (no se convierte en 401)', async () => {
    const denied = new AccessDeniedError('IDENTITY_NOT_LINKED', 'Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.');
    const { guard, context } = build({ admitError: denied });
    const error = await guard.canActivate(context).catch((caught: unknown) => caught);
    expect(error).toBe(denied);
    expect(error).not.toBeInstanceOf(UnauthorizedException);
    expect(httpStatusOf(error)).toBe(403);
  });

  it('la admisión va ANTES de PASSWORD_CHANGE_REQUIRED: una identidad sin cuenta recibe su 403, no el de la contraseña', async () => {
    const denied = new AccessDeniedError('SSO_PROVISIONING_DISABLED', 'Alta desactivada');
    const { guard, context, admission } = build({ principal: { ...PRINCIPAL, passwordChangeRequired: true }, admitError: denied });
    await expect(guard.canActivate(context)).rejects.toBe(denied);
    expect(admission.admit).toHaveBeenCalledTimes(1);
  });

  it('admitida la identidad, PASSWORD_CHANGE_REQUIRED sigue aplicando salvo en el cambio de contraseña', async () => {
    const pending: AuthenticatedPrincipal = { ...PRINCIPAL, issuedBy: 'local', passwordChangeRequired: true };
    const blocked = build({ principal: pending });
    const error = await blocked.guard.canActivate(blocked.context).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(blocked.order).toEqual(['verify', 'admit']);

    const allowed = build({ principal: pending, metadata: { allowPendingPasswordChange: true } });
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true);
  });

  it('el fallo de autenticación registra solo el código del rechazo: ni mensaje, ni token', async () => {
    const { guard, context, logger } = build({ verifyError: new InvalidTokenError('el mensaje cita claims secreto@example.invalid', 'ERR_JWT_EXPIRED') });
    await guard.canActivate(context).catch(() => undefined);
    expect(logger.warn).toHaveBeenCalledWith('authentication_failed', { correlationId: 'corr-1', path: '/api/v1/me', reason: 'ERR_JWT_EXPIRED' });
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain('secreto');
    expect(logged).not.toContain('token-secreto');
  });

  it('un error que no es InvalidTokenError se registra como inesperado, sin su mensaje', async () => {
    const { guard, context, logger } = build({ verifyError: new Error('contraseña de la base: hunter2') });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith('authentication_failed', expect.objectContaining({ reason: 'ERR_UNEXPECTED' }));
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('hunter2');
  });

  it('un InvalidTokenError sin código se registra con un código genérico', async () => {
    const { guard, context, logger } = build({ verifyError: new InvalidTokenError('sin código') });
    await guard.canActivate(context).catch(() => undefined);
    expect(logger.warn).toHaveBeenCalledWith('authentication_failed', expect.objectContaining({ reason: 'ERR_TOKEN_INVALID' }));
  });
});
