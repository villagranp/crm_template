import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type {
  AccountRecord,
  AuditEntryInput,
  AuthRepository,
  LoginAttemptInput,
  NewSessionInput,
  SecuritySettings,
  SessionRecord,
  SessionRevocationReason,
  SetPasswordInput,
} from '@/modules/auth/ports/auth.repository.port';
import { LOGIN_SECURITY_PARAMETERS } from '@/modules/parameters/authentication-settings';

import { PrismaService } from '../prisma.service';

/** Valores de respaldo si falta un parámetro: los mismos que siembra la semilla. */
const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  passwordExpiryDays: 0,
};

/** Clave de cada ajuste: la lista única del módulo de parámetros. */
const SECURITY_PARAMETER_KEYS: Readonly<Record<keyof SecuritySettings, string>> = LOGIN_SECURITY_PARAMETERS;

const SESSION_SELECT = {
  id: true,
  userId: true,
  expiresAt: true,
  revokedAt: true,
  replacedById: true,
} satisfies Prisma.UserSessionSelect;

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  deletedAt: true,
  credential: {
    select: {
      id: true,
      passwordHash: true,
      mustChangePassword: true,
      expiresAt: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  },
} satisfies Prisma.UserSelect;

/**
 * Adaptador Prisma del puerto de autenticación (ADR-004).
 *
 * Es el único archivo del módulo de autenticación que conoce Prisma. Las
 * reglas (bloqueo, rotación, reutilización) viven en los servicios; aquí solo
 * hay traducción y las garantías de atomicidad que el puerto exige.
 */
@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountByEmail(email: string): Promise<AccountRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: email.trim().toLowerCase() },
      select: ACCOUNT_SELECT,
    });
    return toAccount(user);
  }

  async findAccountByUserId(userId: string): Promise<AccountRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
    return toAccount(user);
  }

  async setPassword(userId: string, input: SetPasswordInput): Promise<void> {
    const data = {
      passwordHash: input.passwordHash,
      algorithm: 'argon2id',
      mustChangePassword: input.mustChangePassword,
      // Una contraseña asignada por otro no cuenta como cambio del usuario.
      passwordChangedAt: input.mustChangePassword ? null : input.now,
      expiresAt: input.expiresAt,
      failedAttempts: 0,
      lockedUntil: null,
    };

    await this.prisma.userCredential.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async updatePasswordHash(credentialId: string, passwordHash: string): Promise<void> {
    await this.prisma.userCredential.update({ where: { id: credentialId }, data: { passwordHash } });
  }

  async activateInvitedAccount(userId: string): Promise<void> {
    await this.prisma.user.updateMany({ where: { id: userId, status: 'INVITED' }, data: { status: 'ACTIVE' } });
  }

  async recordSuccessfulLogin(userId: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userIdentity.upsert({
        where: { provider_subject: { provider: 'LOCAL', subject: userId } },
        create: { userId, provider: 'LOCAL', subject: userId, lastLoginAt: now },
        update: { lastLoginAt: now },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now } }),
    ]);
  }

  async reserveLoginAttempt(credentialId: string, now: Date): Promise<number | null> {
    // Una sola sentencia: la condición y el incremento se evalúan juntos bajo
    // el bloqueo de fila, así que dos peticiones nunca obtienen el mismo número.
    // Prisma no expresa CASE en un update; es SQL parametrizado, sin interpolar.
    const rows = await this.prisma.$queryRaw<{ failed_attempts: number }[]>`
      UPDATE "user_credentials"
      SET "failed_attempts" = CASE WHEN "locked_until" IS NOT NULL THEN 1 ELSE "failed_attempts" + 1 END,
          "locked_until" = NULL,
          "updated_at" = ${now}
      WHERE "id" = ${credentialId}::uuid
        AND ("locked_until" IS NULL OR "locked_until" <= ${now})
      RETURNING "failed_attempts"`;
    return rows[0]?.failed_attempts ?? null;
  }

  async lockCredential(credentialId: string, until: Date, now: Date): Promise<boolean> {
    const result = await this.prisma.userCredential.updateMany({
      where: { id: credentialId, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { lockedUntil: until },
    });
    return result.count > 0;
  }

  async clearFailedAttempts(credentialId: string): Promise<void> {
    await this.prisma.userCredential.update({
      where: { id: credentialId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  async getSecuritySettings(): Promise<SecuritySettings> {
    const rows = await this.prisma.systemParameter.findMany({
      where: { key: { in: Object.values(SECURITY_PARAMETER_KEYS) } },
      select: { key: true, value: true },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    const read = (field: keyof SecuritySettings): number => {
      const parsed = Number.parseInt(byKey.get(SECURITY_PARAMETER_KEYS[field]) ?? '', 10);
      // Un valor corrupto no debe desactivar el bloqueo: se usa el de respaldo.
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_SECURITY_SETTINGS[field];
    };

    return {
      maxFailedAttempts: Math.max(1, read('maxFailedAttempts')),
      lockoutMinutes: Math.max(1, read('lockoutMinutes')),
      passwordExpiryDays: read('passwordExpiryDays'),
    };
  }

  async recordLoginAttempt(input: LoginAttemptInput): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        userId: input.userId,
        emailAttempted: input.emailAttempted.slice(0, 320),
        provider: 'LOCAL',
        succeeded: input.succeeded,
        failureReason: input.failureReason,
        ipAddress: input.ipAddress?.slice(0, 45) ?? null,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
        correlationId: input.correlationId?.slice(0, 64) ?? null,
      },
    });
  }

  async recordAudit(entry: AuditEntryInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        correlationId: entry.correlationId.slice(0, 64),
        event: entry.event,
        subjectId: entry.subjectId,
        subjectEmail: entry.subjectEmail,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.ipAddress?.slice(0, 45) ?? null,
        metadata: entry.metadata ?? undefined,
      },
    });
  }

  async createSession(input: NewSessionInput): Promise<SessionRecord> {
    return this.prisma.userSession.create({ data: input, select: SESSION_SELECT });
  }

  async findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.userSession.findUnique({ where: { refreshTokenHash }, select: SESSION_SELECT });
  }

  async rotateSession(currentSessionId: string, next: NewSessionInput, now: Date): Promise<SessionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await lockUserSessions(tx, next.userId);

      // El UPDATE condicional bloquea la fila. Una transacción concurrente
      // sobre la misma sesión espera, y al reevaluar la condición ya no la
      // encuentra vigente: solo una de las dos rota.
      const claimed = await tx.userSession.updateMany({
        where: { id: currentSessionId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'rotated' satisfies SessionRevocationReason, lastUsedAt: now },
      });

      if (claimed.count === 0) {
        return null;
      }

      const created = await tx.userSession.create({ data: next, select: SESSION_SELECT });
      await tx.userSession.update({ where: { id: currentSessionId }, data: { replacedById: created.id } });
      return created;
    });
  }

  async revokeSession(sessionId: string, reason: SessionRevocationReason, now: Date): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }

  async revokeAllUserSessions(userId: string, reason: SessionRevocationReason, now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await lockUserSessions(tx, userId);
      const result = await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: reason },
      });
      return result.count;
    });
  }
}

/**
 * Serializa, por usuario, las rotaciones y las revocaciones masivas.
 *
 * Sin esto, una rotación en curso podía crear su sesión sucesora justo
 * después de que `revokeAllUserSessions` tomara su foto de las sesiones
 * vigentes: tras un cambio de contraseña o un robo detectado, quien tuviera la
 * cookie anterior conservaba una sesión válida. Con el bloqueo de la fila del
 * usuario, la revocación ve la sucesora ya confirmada, o la rotación encuentra
 * la sesión ya revocada.
 */
async function lockUserSessions(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
}

function toAccount(
  user: Prisma.UserGetPayload<{ select: typeof ACCOUNT_SELECT }> | null,
): AccountRecord | null {
  if (!user || user.deletedAt) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    credential: user.credential,
  };
}
