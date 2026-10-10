import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AccessService } from '@/modules/access/access.service';

import { AuthService, type AuthRequestContext } from './auth.service';
import type { InitialCredentialService } from './initial-credential.service';
import type { LockoutService } from './lockout.service';
import type { PasswordService } from './password.service';
import type { AccountRecord, AuthRepository } from './ports/auth.repository.port';
import type { SessionService } from './session.service';
import type { TokenService } from './token.service';

const CONTEXT: AuthRequestContext = { correlationId: 'corr-1', ipAddress: '10.0.0.1', userAgent: 'Navegador' };
const EMAIL = 'persona@example.com';

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    userId: 'user-1',
    email: EMAIL,
    displayName: 'Persona',
    status: 'ACTIVE',
    credential: {
      id: 'cred-1',
      passwordHash: 'hash-real',
      mustChangePassword: false,
      expiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    },
    ...overrides,
  };
}

/**
 * Las piezas con estado (sesiones, bloqueo, hashing) tienen sus propias
 * pruebas y la integración se cubre contra PostgreSQL en test/. Aquí se
 * prueban las decisiones de orquestación que no se ven desde fuera.
 */
function setup(found: AccountRecord | null) {
  const repository = {
    findAccountByEmail: jest.fn(async () => found),
    findAccountByUserId: jest.fn(async () => found),
    recordLoginAttempt: jest.fn(async () => undefined),
    recordAudit: jest.fn(async () => undefined),
    recordSuccessfulLogin: jest.fn(async () => undefined),
    updatePasswordHash: jest.fn(async () => undefined),
    getSecuritySettings: jest.fn(async () => ({ maxFailedAttempts: 5, lockoutMinutes: 15, passwordExpiryDays: 0 })),
    setPassword: jest.fn(async () => undefined),
    activateInvitedAccount: jest.fn(async () => undefined),
  };
  const passwordService = {
    verify: jest.fn(async (_hash: string, plain: string) => plain === 'correcta'),
    verifyAgainstDummy: jest.fn(async () => false as const),
    needsRehash: jest.fn(() => false),
    hash: jest.fn(async () => 'hash-nuevo'),
    validate: jest.fn(() => ({ valid: true, errors: [] as string[] })),
  };
  const lockoutService = {
    reserveAttempt: jest.fn(
      async (): Promise<{ allowed: true; attemptNumber: number } | { allowed: false; lockedUntil: Date | null }> => ({
        allowed: true,
        attemptNumber: 1,
      }),
    ),
    registerFailure: jest.fn(async () => null as Date | null),
    registerSuccess: jest.fn(async () => undefined),
  };
  const sessionService = {
    startSession: jest.fn(async (userId: string) => ({
      sessionId: 'session-1',
      userId,
      refreshToken: 'refresh',
      expiresAt: new Date('2026-10-08T18:00:00.000Z'),
    })),
    rotate: jest.fn(),
    revokeAllForUser: jest.fn(async () => 1),
    endSession: jest.fn(async () => undefined),
  };
  const tokenService = {
    signAccessToken: jest.fn(async () => ({ accessToken: 'jwt', expiresAt: new Date('2026-10-08T10:15:00.000Z') })),
  };
  const initialCredentials = { isConfigured: jest.fn(() => true), assignDefaultPassword: jest.fn(async () => true) };
  const accessService = {
    getEffectiveAccess: jest.fn(async () => ({ roles: ['administrador'], permissions: ['usuarios.ver'] })),
    findUserIdForPrincipal: jest.fn(async () => 'admin-1'),
    assertActorIsAdministrador: jest.fn(async () => undefined),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };

  const service = new AuthService(
    repository as unknown as AuthRepository,
    passwordService as unknown as PasswordService,
    tokenService as unknown as TokenService,
    sessionService as unknown as SessionService,
    lockoutService as unknown as LockoutService,
    initialCredentials as unknown as InitialCredentialService,
    accessService as unknown as AccessService,
    logger as unknown as AppLogger,
  );

  return {
    service,
    repository,
    passwordService,
    lockoutService,
    sessionService,
    tokenService,
    initialCredentials,
    logger,
    accessService,
  };
}

async function errorOf(promise: Promise<unknown>): Promise<{ code: string; name: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; name: string };
  }
  throw new Error('Se esperaba un error');
}

describe('AuthService.login', () => {
  it('correo inexistente: verifica contra el hash ficticio y responde INVALID_CREDENTIALS', async () => {
    const { service, passwordService, repository } = setup(null);

    const error = await errorOf(service.login(EMAIL, 'lo-que-sea', CONTEXT));

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(passwordService.verifyAgainstDummy).toHaveBeenCalledTimes(1);
    expect(repository.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, succeeded: false, failureReason: 'unknown_account' }),
    );
  });

  it('cuenta sin credencial: mismo error y mismo coste que un correo inexistente', async () => {
    const { service, passwordService } = setup(account({ credential: null }));

    const error = await errorOf(service.login(EMAIL, 'lo-que-sea', CONTEXT));

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(passwordService.verifyAgainstDummy).toHaveBeenCalledTimes(1);
  });

  it('contraseña incorrecta: mismo error y anota el fallo para el bloqueo', async () => {
    const { service, lockoutService } = setup(account());

    const error = await errorOf(service.login(EMAIL, 'incorrecta', CONTEXT));

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(lockoutService.registerFailure).toHaveBeenCalledTimes(1);
  });

  it('durante el bloqueo no verifica la contraseña real, aunque sea la correcta', async () => {
    const { service, lockoutService, passwordService } = setup(account());
    lockoutService.reserveAttempt.mockResolvedValue({ allowed: false, lockedUntil: null });

    const error = await errorOf(service.login(EMAIL, 'correcta', CONTEXT));

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(passwordService.verify).not.toHaveBeenCalled();
    expect(passwordService.verifyAgainstDummy).toHaveBeenCalledTimes(1);
  });

  it('el fallo que bloquea la cuenta se audita como auth.lockout.triggered', async () => {
    const { service, lockoutService, repository } = setup(account());
    lockoutService.registerFailure.mockResolvedValue(new Date('2026-10-08T10:15:00.000Z'));

    await errorOf(service.login(EMAIL, 'incorrecta', CONTEXT));

    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ event: 'auth.lockout.triggered' }));
  });

  it.each(['SUSPENDED', 'LOCKED'] as const)('cuenta %s con la contraseña correcta: ACCOUNT_DISABLED', async (status) => {
    const { service, sessionService } = setup(account({ status }));

    const error = await errorOf(service.login(EMAIL, 'correcta', CONTEXT));

    expect(error.code).toBe('ACCOUNT_DISABLED');
    expect(sessionService.startSession).not.toHaveBeenCalled();
  });

  it('acierto: reinicia el bloqueo, abre sesión y devuelve roles y permisos de la base', async () => {
    const { service, lockoutService, repository } = setup(account());

    const session = await service.login(EMAIL, 'correcta', CONTEXT);

    expect(lockoutService.registerSuccess).toHaveBeenCalledTimes(1);
    expect(repository.recordSuccessfulLogin).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(session).toMatchObject({
      accessToken: 'jwt',
      refreshToken: 'refresh',
      passwordChangeRequired: false,
      user: { id: 'user-1', roles: ['administrador'], permissions: ['usuarios.ver'] },
    });
  });

  it('contraseña inicial: el token y la respuesta exigen cambiarla (D13)', async () => {
    const base = account();
    const { service, tokenService } = setup(account({ credential: { ...base.credential!, mustChangePassword: true } }));

    const session = await service.login(EMAIL, 'correcta', CONTEXT);

    expect(session.passwordChangeRequired).toBe(true);
    expect(tokenService.signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ passwordChangeRequired: true }));
  });

  it('migra el hash si los parámetros de Argon2 cambiaron', async () => {
    const { service, passwordService, repository } = setup(account());
    passwordService.needsRehash.mockReturnValue(true);

    await service.login(EMAIL, 'correcta', CONTEXT);

    expect(repository.updatePasswordHash).toHaveBeenCalledWith('cred-1', 'hash-nuevo');
  });

  it('nunca registra la contraseña en los logs', async () => {
    const { service, logger } = setup(account());

    await errorOf(service.login(EMAIL, 'incorrecta', CONTEXT));
    await service.login(EMAIL, 'correcta', CONTEXT);

    const logged = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(logged).not.toContain('correcta');
    expect(logged).not.toContain('incorrecta');
    expect(logged).not.toContain(EMAIL);
  });
});

describe('AuthService.refresh', () => {
  it('sin cookie: INVALID_REFRESH_TOKEN', async () => {
    const { service } = setup(account());

    await expect(errorOf(service.refresh(undefined, CONTEXT))).resolves.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('token reutilizado: INVALID_REFRESH_TOKEN y queda en la auditoría', async () => {
    const { service, sessionService, repository } = setup(account());
    sessionService.rotate.mockResolvedValue({ outcome: 'reused', userId: 'user-1' });

    const error = await errorOf(service.refresh('token', CONTEXT));

    expect(error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(repository.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.refresh.reused', subjectId: 'user-1' }),
    );
  });

  it('cuenta suspendida con la sesión abierta: cierra todas sus sesiones', async () => {
    const { service, sessionService } = setup(account({ status: 'SUSPENDED' }));
    sessionService.rotate.mockResolvedValue({
      outcome: 'rotated',
      session: { sessionId: 's2', userId: 'user-1', refreshToken: 'nuevo', expiresAt: new Date() },
    });

    const error = await errorOf(service.refresh('token', CONTEXT));

    expect(error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(sessionService.revokeAllForUser).toHaveBeenCalledWith('user-1', 'account_disabled');
  });
});

describe('AuthService.changePassword', () => {
  it('contraseña actual incorrecta: INVALID_CURRENT_PASSWORD, sin tocar la credencial', async () => {
    const { service, repository } = setup(account());

    const error = await errorOf(service.changePassword('user-1', 'incorrecta', 'una-nueva-larga', CONTEXT));

    expect(error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(repository.setPassword).not.toHaveBeenCalled();
  });

  it('nueva contraseña fuera de política: PASSWORD_POLICY_VIOLATION con los motivos', async () => {
    const { service, passwordService } = setup(account());
    passwordService.validate.mockReturnValue({ valid: false, errors: ['Muy corta.'] });

    const error = (await errorOf(service.changePassword('user-1', 'correcta', 'corta', CONTEXT))) as unknown as {
      code: string;
      details: unknown[];
    };

    expect(error.code).toBe('PASSWORD_POLICY_VIOLATION');
    expect(error.details).toEqual([{ field: 'newPassword', issue: 'Muy corta.' }]);
  });

  it('rechaza repetir la contraseña actual', async () => {
    const { service } = setup(account());

    const error = await errorOf(service.changePassword('user-1', 'correcta', 'correcta', CONTEXT));

    expect(error.code).toBe('PASSWORD_POLICY_VIOLATION');
  });

  it('acierto: activa la cuenta invitada, revoca las sesiones y abre una nueva sin cambio pendiente', async () => {
    const { service, repository, sessionService } = setup(account({ status: 'INVITED' }));

    const session = await service.changePassword('user-1', 'correcta', 'una-nueva-larga', CONTEXT);

    expect(repository.setPassword).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ mustChangePassword: false, expiresAt: null }),
    );
    expect(repository.activateInvitedAccount).toHaveBeenCalledWith('user-1');
    expect(sessionService.revokeAllForUser).toHaveBeenCalledWith('user-1', 'password_changed');
    expect(sessionService.startSession).toHaveBeenCalledTimes(1);
    expect(session.passwordChangeRequired).toBe(false);
  });
});

describe('AuthService.resetPasswordByAdmin', () => {
  const ADMIN = { subjectId: 'admin-1', type: 'user', providerRoles: [], issuedBy: 'local' } as const;

  it('sin AUTH_DEFAULT_PASSWORD: DEFAULT_PASSWORD_NOT_CONFIGURED', async () => {
    const { service, initialCredentials } = setup(account());
    initialCredentials.isConfigured.mockReturnValue(false);

    const error = await errorOf(service.resetPasswordByAdmin('user-1', ADMIN, CONTEXT));

    expect(error.code).toBe('DEFAULT_PASSWORD_NOT_CONFIGURED');
  });

  it('usuario inexistente: RESOURCE_NOT_FOUND', async () => {
    const { service } = setup(null);

    const error = await errorOf(service.resetPasswordByAdmin('user-x', ADMIN, CONTEXT));

    expect(error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('ADR-020: un actor que no es administrador recibe ADMIN_ONLY sin tocar la credencial', async () => {
    const { service, initialCredentials, accessService } = setup(account());
    accessService.assertActorIsAdministrador.mockRejectedValueOnce(Object.assign(new Error('admin only'), { code: 'ADMIN_ONLY' }));

    const error = await errorOf(service.resetPasswordByAdmin('user-1', ADMIN, CONTEXT));

    expect(error.code).toBe('ADMIN_ONLY');
    expect(accessService.assertActorIsAdministrador).toHaveBeenCalledWith('admin-1');
    expect(initialCredentials.assignDefaultPassword).not.toHaveBeenCalled();
  });

  it('asigna la contraseña inicial, cierra sus sesiones y lo audita con el actor', async () => {
    const { service, initialCredentials, sessionService, repository } = setup(account());

    await service.resetPasswordByAdmin('user-1', ADMIN, CONTEXT);

    expect(initialCredentials.assignDefaultPassword).toHaveBeenCalledWith('user-1');
    expect(sessionService.revokeAllForUser).toHaveBeenCalledWith('user-1', 'password_reset_by_admin');
    expect(repository.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.password.reset_by_admin', subjectId: 'admin-1', resourceId: 'user-1' }),
    );
  });
});
