import { Inject, Injectable } from '@nestjs/common';

import {
  AccessDeniedError,
  AuthenticationFailedError,
  BusinessRuleViolationError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AccessService } from '@/modules/access/access.service';

import { InitialCredentialService } from './initial-credential.service';
import { LockoutService } from './lockout.service';
import { PasswordService } from './password.service';
import {
  AUTH_REPOSITORY,
  type AccountRecord,
  type AuthRepository,
  type CredentialRecord,
} from './ports/auth.repository.port';
import { type IssuedSession, SessionService } from './session.service';
import { TokenService } from './token.service';

/** Datos de la petición que se guardan para trazabilidad. */
export interface AuthRequestContext {
  correlationId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

/** Resultado de un login, refresh o cambio de contraseña. El controlador decide qué va a la cookie. */
export interface AuthSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  passwordChangeRequired: boolean;
  user: SessionUser;
}

const DISABLED_STATUSES: ReadonlySet<AccountRecord['status']> = new Set(['SUSPENDED', 'LOCKED']);

function invalidCredentials(): AuthenticationFailedError {
  return new AuthenticationFailedError('INVALID_CREDENTIALS', 'Invalid email or password');
}

function invalidRefreshToken(): AuthenticationFailedError {
  return new AuthenticationFailedError('INVALID_REFRESH_TOKEN', 'Session is no longer valid');
}

function accountDisabled(): AccessDeniedError {
  return new AccessDeniedError('ACCOUNT_DISABLED', 'This account is disabled');
}

/**
 * Casos de uso de autenticación local (PLAN-AUTH-LOCAL).
 *
 * Reglas transversales:
 *   - Correo inexistente, sin credencial, contraseña incorrecta y bloqueo
 *     temporal producen el mismo error y tardan lo mismo: siempre se ejecuta
 *     una verificación Argon2, real o contra el hash ficticio.
 *   - Nunca se registran contraseñas, hashes ni tokens; tampoco el correo en
 *     los logs (va a `login_attempts`, que es su sitio).
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly lockoutService: LockoutService,
    private readonly initialCredentials: InitialCredentialService,
    private readonly accessService: AccessService,
    private readonly logger: AppLogger,
  ) {}

  async login(email: string, password: string, context: AuthRequestContext): Promise<AuthSession> {
    const now = new Date();
    const account = await this.repository.findAccountByEmail(email);
    const credential = account?.credential ?? null;

    if (!account || !credential) {
      await this.passwordService.verifyAgainstDummy(password);
      await this.recordFailedLogin(email, account, account ? 'no_credential' : 'unknown_account', context);
      throw invalidCredentials();
    }

    // El turno se reserva antes de verificar (D8): ver LockoutService.
    const reservation = await this.lockoutService.reserveAttempt(credential.id, now);
    if (!reservation.allowed) {
      await this.passwordService.verifyAgainstDummy(password);
      await this.recordFailedLogin(email, account, 'locked_out', context);
      if (reservation.lockedUntil) {
        await this.recordLockout(account, reservation.lockedUntil, context);
      }
      throw invalidCredentials();
    }

    if (!(await this.passwordService.verify(credential.passwordHash, password))) {
      const lockedUntil = await this.lockoutService.registerFailure(credential.id, reservation.attemptNumber, now);
      await this.recordFailedLogin(email, account, 'invalid_password', context);
      if (lockedUntil) {
        await this.recordLockout(account, lockedUntil, context);
      }
      throw invalidCredentials();
    }

    // Solo quien conoce la contraseña llega aquí: revelar el estado no permite enumerar cuentas.
    if (DISABLED_STATUSES.has(account.status)) {
      await this.recordFailedLogin(email, account, 'account_disabled', context);
      throw accountDisabled();
    }

    await this.lockoutService.registerSuccess(credential.id);
    if (this.passwordService.needsRehash(credential.passwordHash)) {
      await this.repository.updatePasswordHash(credential.id, await this.passwordService.hash(password));
    }
    await this.repository.recordSuccessfulLogin(account.userId, now);
    await this.repository.recordLoginAttempt({
      userId: account.userId,
      emailAttempted: email,
      succeeded: true,
      failureReason: null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    this.logger.info('auth.login.succeeded', { correlationId: context.correlationId, userId: account.userId });
    await this.audit('auth.login.succeeded', account, context);

    const session = await this.sessionService.startSession(account.userId, context);
    return this.buildSession(account, credential, session, now);
  }

  async refresh(refreshToken: string | undefined, context: AuthRequestContext): Promise<AuthSession> {
    if (!refreshToken) {
      throw invalidRefreshToken();
    }

    const result = await this.sessionService.rotate(refreshToken, context);

    if (result.outcome === 'reused') {
      // SessionService ya revocó todo y lo registró en el log; aquí queda la auditoría.
      await this.repository.recordAudit({
        event: 'auth.refresh.reused',
        correlationId: context.correlationId,
        subjectId: result.userId,
        subjectEmail: null,
        ipAddress: context.ipAddress,
      });
      throw invalidRefreshToken();
    }

    if (result.outcome === 'invalid') {
      throw invalidRefreshToken();
    }

    const account = await this.repository.findAccountByUserId(result.session.userId);
    if (!account?.credential || DISABLED_STATUSES.has(account.status)) {
      // La cuenta se suspendió o se borró con la sesión abierta: se cierra todo.
      await this.sessionService.revokeAllForUser(result.session.userId, 'account_disabled');
      throw invalidRefreshToken();
    }

    return this.buildSession(account, account.credential, result.session, new Date());
  }

  /** Nunca falla: cerrar sesión con un token inválido o ausente es un no-op. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.sessionService.endSession(refreshToken);
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: AuthRequestContext,
  ): Promise<AuthSession> {
    const account = await this.repository.findAccountByUserId(userId);
    const credential = account?.credential;

    if (!account || !credential) {
      throw new BusinessRuleViolationError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }
    if (DISABLED_STATUSES.has(account.status)) {
      throw accountDisabled();
    }

    if (!(await this.passwordService.verify(credential.passwordHash, currentPassword))) {
      this.logger.warn('auth.password.change_failed', { correlationId: context.correlationId, userId });
      throw new BusinessRuleViolationError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }

    const policy = this.passwordService.validate(newPassword, account.email);
    const issues = [...policy.errors];
    if (newPassword === currentPassword) {
      issues.push('La nueva contraseña debe ser distinta de la actual.');
    }
    if (issues.length > 0) {
      throw new BusinessRuleViolationError(
        'PASSWORD_POLICY_VIOLATION',
        'New password does not meet the password policy',
        issues.map((issue) => ({ field: 'newPassword', issue })),
      );
    }

    const now = new Date();
    const settings = await this.repository.getSecuritySettings();
    await this.repository.setPassword(userId, {
      passwordHash: await this.passwordService.hash(newPassword),
      mustChangePassword: false,
      expiresAt: settings.passwordExpiryDays > 0 ? new Date(now.getTime() + settings.passwordExpiryDays * 86_400_000) : null,
      now,
    });
    await this.repository.activateInvitedAccount(userId);

    // Quien tuviera la contraseña anterior pierde cualquier sesión abierta con ella.
    await this.sessionService.revokeAllForUser(userId, 'password_changed');

    this.logger.info('auth.password.changed', { correlationId: context.correlationId, userId });
    await this.audit('auth.password.changed', account, context);

    const session = await this.sessionService.startSession(userId, context);
    return this.buildSession(
      { ...account, status: account.status === 'INVITED' ? 'ACTIVE' : account.status },
      { ...credential, mustChangePassword: false, expiresAt: null },
      session,
      now,
    );
  }

  /** D12: un administrador devuelve la cuenta a la contraseña inicial, con cambio obligatorio. */
  async resetPasswordByAdmin(
    targetUserId: string,
    actor: AuthenticatedPrincipal,
    context: AuthRequestContext,
  ): Promise<void> {
    const account = await this.repository.findAccountByUserId(targetUserId);
    if (!account) {
      throw new ResourceNotFoundError('User', targetUserId);
    }
    // ADR-020: devolver una cuenta a la contraseña inicial, que es conocida,
    // equivale a poder entrar con ella y quedarse sus permisos. Es dar acceso,
    // así que sólo un administrador puede hacerlo, sea quien sea el objetivo.
    // El actor se resuelve contra la cuenta local, no contra el token.
    const actorUserId = await this.accessService.findUserIdForPrincipal(actor);
    await this.accessService.assertActorIsAdministrador(actorUserId);
    if (!this.initialCredentials.isConfigured()) {
      throw new BusinessRuleViolationError(
        'DEFAULT_PASSWORD_NOT_CONFIGURED',
        'AUTH_DEFAULT_PASSWORD is not configured on the server',
      );
    }

    await this.initialCredentials.assignDefaultPassword(targetUserId);
    const revokedSessions = await this.sessionService.revokeAllForUser(targetUserId, 'password_reset_by_admin');

    this.logger.info('auth.password.reset_by_admin', {
      correlationId: context.correlationId,
      actorId: actor.subjectId,
      userId: targetUserId,
      revokedSessions,
    });
    await this.repository.recordAudit({
      event: 'auth.password.reset_by_admin',
      correlationId: context.correlationId,
      subjectId: actor.subjectId,
      subjectEmail: actor.email ?? null,
      resourceType: 'user',
      resourceId: targetUserId,
      ipAddress: context.ipAddress,
      metadata: { revokedSessions },
    });
  }

  private async buildSession(
    account: AccountRecord,
    credential: CredentialRecord,
    session: IssuedSession,
    now: Date,
  ): Promise<AuthSession> {
    const passwordChangeRequired =
      credential.mustChangePassword || (credential.expiresAt !== null && credential.expiresAt.getTime() <= now.getTime());

    const { accessToken, expiresAt } = await this.tokenService.signAccessToken({
      userId: account.userId,
      email: account.email,
      displayName: account.displayName,
      passwordChangeRequired,
    });
    const access = await this.accessService.getEffectiveAccess(account.userId);

    return {
      accessToken,
      accessTokenExpiresAt: expiresAt,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
      passwordChangeRequired,
      user: {
        id: account.userId,
        email: account.email,
        displayName: account.displayName,
        roles: access.roles,
        permissions: access.permissions,
      },
    };
  }

  private async recordFailedLogin(
    email: string,
    account: AccountRecord | null,
    reason: string,
    context: AuthRequestContext,
  ): Promise<void> {
    await this.repository.recordLoginAttempt({
      userId: account?.userId ?? null,
      emailAttempted: email,
      succeeded: false,
      failureReason: reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
    this.logger.warn('auth.login.failed', {
      correlationId: context.correlationId,
      userId: account?.userId ?? null,
      reason,
    });
  }

  private async recordLockout(account: AccountRecord, lockedUntil: Date, context: AuthRequestContext): Promise<void> {
    this.logger.warn('auth.lockout.triggered', {
      correlationId: context.correlationId,
      userId: account.userId,
      lockedUntil: lockedUntil.toISOString(),
    });
    await this.audit('auth.lockout.triggered', account, context, { lockedUntil: lockedUntil.toISOString() });
  }

  private audit(
    event: string,
    account: AccountRecord,
    context: AuthRequestContext,
    metadata?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    return this.repository.recordAudit({
      event,
      correlationId: context.correlationId,
      subjectId: account.userId,
      subjectEmail: account.email,
      ipAddress: context.ipAddress,
      metadata,
    });
  }
}
