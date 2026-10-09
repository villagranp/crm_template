import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '@/config/app-config.service';
import { parseDurationMs } from '@/config/duration';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import {
  AUTH_REPOSITORY,
  type NewSessionInput,
  type SessionRecord,
  type SessionRevocationReason,
  type SessionStore,
} from './ports/auth.repository.port';

/**
 * Sesiones con refresh token rotativo (PLAN-AUTH-LOCAL, D2–D4).
 *
 * El refresh token es un valor opaco y aleatorio, no un JWT: su validez la
 * decide la base de datos, que es lo que permite rotarlo y revocarlo. Solo se
 * guarda su SHA-256. Con 256 bits de entropía no hace falta sal ni un hash
 * lento: no hay diccionario posible contra un valor aleatorio.
 *
 * Reglas:
 *   - D2: la sesión dura lo que fija `JWT_REFRESH_TOKEN_TTL` desde el login.
 *     Rotar **no** la alarga: la sucesora hereda la caducidad.
 *   - D3: cada uso del refresh lo sustituye por uno nuevo.
 *   - D4: presentar un refresh que ya se rotó revoca todas las sesiones del
 *     usuario. Solo pueden tenerlo el usuario legítimo y quien se lo robó, y
 *     no hay forma de saber cuál de los dos es.
 *
 * Nada de lo que entra o sale de aquí se registra: ni el token ni su hash.
 */

export const REFRESH_TOKEN_BYTES = 32;

/** 32 bytes en base64url sin relleno = 43 caracteres. */
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Límites de las columnas de `user_sessions`. */
const USER_AGENT_MAX_LENGTH = 400;
const IP_ADDRESS_MAX_LENGTH = 45;

export interface SessionRequestContext {
  userAgent?: string | null;
  ipAddress?: string | null;
  correlationId?: string;
}

export interface IssuedSession {
  sessionId: string;
  userId: string;
  /** Valor para la cookie. Es la única vez que existe en claro. */
  refreshToken: string;
  expiresAt: Date;
}

export type RefreshResult =
  | { outcome: 'rotated'; session: IssuedSession }
  /** No existe, caducó o se revocó (logout). Sin indicios de robo. */
  | { outcome: 'invalid' }
  /** D4: el token ya se había rotado. Todas las sesiones del usuario quedan revocadas. */
  | { outcome: 'reused'; userId: string };

@Injectable()
export class SessionService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: SessionStore,
    private readonly config: AppConfigService,
    private readonly logger: AppLogger,
  ) {}

  async startSession(userId: string, context: SessionRequestContext = {}): Promise<IssuedSession> {
    const expiresAt = new Date(Date.now() + parseDurationMs(this.config.get('JWT_REFRESH_TOKEN_TTL')));
    const refreshToken = generateRefreshToken();

    const session = await this.repository.createSession(
      newSessionInput(userId, refreshToken, expiresAt, context),
    );

    return toIssuedSession(session, refreshToken);
  }

  async rotate(refreshToken: string, context: SessionRequestContext = {}): Promise<RefreshResult> {
    const current = await this.findByToken(refreshToken);
    if (!current) {
      return { outcome: 'invalid' };
    }

    const now = new Date();

    // Se comprueba antes que la caducidad: un token rotado que reaparece es
    // sospechoso aunque su sesión ya haya caducado.
    if (current.replacedById) {
      return this.handleReuse(current, now, context);
    }

    if (current.revokedAt || current.expiresAt.getTime() <= now.getTime()) {
      return { outcome: 'invalid' };
    }

    const nextToken = generateRefreshToken();
    const next = await this.repository.rotateSession(
      current.id,
      newSessionInput(current.userId, nextToken, current.expiresAt, context),
      now,
    );

    if (!next) {
      // Otra petición se adelantó. Si fue una rotación, este token ya está
      // rotado y es reutilización; si fue un logout, simplemente no vale.
      const latest = await this.repository.findSessionByRefreshTokenHash(hashRefreshToken(refreshToken));
      return latest?.replacedById ? this.handleReuse(latest, now, context) : { outcome: 'invalid' };
    }

    return { outcome: 'rotated', session: toIssuedSession(next, nextToken) };
  }

  /** Logout: revoca la sesión del token si existe. Nunca falla por un token inválido. */
  async endSession(refreshToken: string): Promise<void> {
    const session = await this.findByToken(refreshToken);
    if (session && !session.revokedAt) {
      await this.repository.revokeSession(session.id, 'logout', new Date());
    }
  }

  /** Cierra todas las sesiones del usuario, por ejemplo al cambiar la contraseña. */
  revokeAllForUser(userId: string, reason: SessionRevocationReason): Promise<number> {
    return this.repository.revokeAllUserSessions(userId, reason, new Date());
  }

  private async findByToken(refreshToken: string): Promise<SessionRecord | null> {
    // Lo que no tiene la forma de un token emitido aquí no llega a la base.
    if (!REFRESH_TOKEN_PATTERN.test(refreshToken)) {
      return null;
    }
    return this.repository.findSessionByRefreshTokenHash(hashRefreshToken(refreshToken));
  }

  private async handleReuse(
    session: SessionRecord,
    now: Date,
    context: SessionRequestContext,
  ): Promise<RefreshResult> {
    const revokedSessions = await this.repository.revokeAllUserSessions(
      session.userId,
      'refresh_reuse_detected',
      now,
    );

    this.logger.warn('auth.refresh.reused', {
      correlationId: context.correlationId,
      userId: session.userId,
      sessionId: session.id,
      revokedSessions,
    });

    return { outcome: 'reused', userId: session.userId };
  }
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function newSessionInput(
  userId: string,
  refreshToken: string,
  expiresAt: Date,
  context: SessionRequestContext,
): NewSessionInput {
  return {
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt,
    userAgent: context.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
    ipAddress: context.ipAddress?.slice(0, IP_ADDRESS_MAX_LENGTH) ?? null,
  };
}

function toIssuedSession(session: SessionRecord, refreshToken: string): IssuedSession {
  return {
    sessionId: session.id,
    userId: session.userId,
    refreshToken,
    expiresAt: session.expiresAt,
  };
}
