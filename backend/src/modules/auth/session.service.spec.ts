import { randomUUID } from 'node:crypto';

import type { AppConfigService } from '@/config/app-config.service';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import type {
  NewSessionInput,
  SessionRecord,
  SessionRevocationReason,
  SessionStore,
} from './ports/auth.repository.port';
import { hashRefreshToken, type RefreshResult, SessionService } from './session.service';

interface StoredSession extends SessionRecord {
  refreshTokenHash: string;
  revokedReason: SessionRevocationReason | null;
  userAgent: string | null;
  ipAddress: string | null;
}

/**
 * Repositorio en memoria con la misma garantía que se exige al adaptador
 * real: `rotateSession` solo rota una sesión que sigue sin revocar.
 */
class InMemoryAuthRepository implements SessionStore {
  readonly sessions = new Map<string, StoredSession>();

  async createSession(input: NewSessionInput): Promise<SessionRecord> {
    return toRecord(this.insert(input));
  }

  async findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    const found = [...this.sessions.values()].find((session) => session.refreshTokenHash === refreshTokenHash);
    return found ? toRecord(found) : null;
  }

  async rotateSession(currentSessionId: string, next: NewSessionInput, now: Date): Promise<SessionRecord | null> {
    const current = this.sessions.get(currentSessionId);
    if (!current || current.revokedAt) {
      return null;
    }
    const created = this.insert(next);
    current.revokedAt = now;
    current.revokedReason = 'rotated';
    current.replacedById = created.id;
    return toRecord(created);
  }

  async revokeSession(sessionId: string, reason: SessionRevocationReason, now: Date): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && !session.revokedAt) {
      session.revokedAt = now;
      session.revokedReason = reason;
    }
  }

  async revokeAllUserSessions(userId: string, reason: SessionRevocationReason, now: Date): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now;
        session.revokedReason = reason;
        revoked += 1;
      }
    }
    return revoked;
  }

  activeSessionsOf(userId: string): StoredSession[] {
    return [...this.sessions.values()].filter((session) => session.userId === userId && !session.revokedAt);
  }

  private insert(input: NewSessionInput): StoredSession {
    const stored: StoredSession = {
      id: randomUUID(),
      revokedAt: null,
      revokedReason: null,
      replacedById: null,
      ...input,
    };
    this.sessions.set(stored.id, stored);
    return stored;
  }
}

function toRecord(session: StoredSession): SessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    replacedById: session.replacedById,
  };
}

function rotatedSession(result: RefreshResult) {
  if (result.outcome !== 'rotated') {
    throw new Error(`Se esperaba una rotación y se obtuvo "${result.outcome}"`);
  }
  return result.session;
}

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const EIGHT_HOURS_MS = 8 * 3_600_000;
const START = new Date('2026-10-08T08:00:00.000Z');

describe('SessionService', () => {
  let repository: InMemoryAuthRepository;
  let logger: { warn: jest.Mock };
  let service: SessionService;

  beforeEach(() => {
    jest.useFakeTimers({ now: START, doNotFake: ['nextTick', 'setImmediate'] });
    repository = new InMemoryAuthRepository();
    logger = { warn: jest.fn() };
    const config = { get: (key: string) => (key === 'JWT_REFRESH_TOKEN_TTL' ? '8h' : undefined) };
    service = new SessionService(repository, config as unknown as AppConfigService, logger as unknown as AppLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startSession', () => {
    it('emite un token opaco de 256 bits y guarda solo su hash', async () => {
      const issued = await service.startSession(USER_ID, { userAgent: 'Navegador', ipAddress: '10.0.0.1' });

      expect(issued.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = repository.sessions.get(issued.sessionId);
      expect(stored?.refreshTokenHash).toBe(hashRefreshToken(issued.refreshToken));
      // Una fuga de la tabla no debe entregar tokens utilizables.
      expect(JSON.stringify(stored)).not.toContain(issued.refreshToken);
    });

    it('fija la caducidad a 8 horas desde el inicio (D2)', async () => {
      const issued = await service.startSession(USER_ID);

      expect(issued.expiresAt.getTime()).toBe(START.getTime() + EIGHT_HOURS_MS);
    });

    it('recorta user agent e IP a lo que admiten las columnas', async () => {
      const issued = await service.startSession(USER_ID, { userAgent: 'x'.repeat(1_000), ipAddress: '1'.repeat(100) });

      const stored = repository.sessions.get(issued.sessionId);
      expect(stored?.userAgent).toHaveLength(400);
      expect(stored?.ipAddress).toHaveLength(45);
    });
  });

  describe('rotate (D3)', () => {
    it('sustituye el token y encadena la sesión anterior con replacedById', async () => {
      const first = await service.startSession(USER_ID);

      const second = rotatedSession(await service.rotate(first.refreshToken));

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.userId).toBe(USER_ID);
      const previous = repository.sessions.get(first.sessionId);
      expect(previous?.replacedById).toBe(second.sessionId);
      expect(previous?.revokedReason).toBe('rotated');
      expect(repository.activeSessionsOf(USER_ID).map((session) => session.id)).toEqual([second.sessionId]);
    });

    it('no alarga la sesión: la sucesora hereda la caducidad original (D2)', async () => {
      const first = await service.startSession(USER_ID);
      jest.advanceTimersByTime(3 * 3_600_000);

      const second = rotatedSession(await service.rotate(first.refreshToken));

      expect(second.expiresAt.getTime()).toBe(first.expiresAt.getTime());
    });

    it('permite encadenar rotaciones con el token más reciente', async () => {
      const first = await service.startSession(USER_ID);
      const second = rotatedSession(await service.rotate(first.refreshToken));
      const third = rotatedSession(await service.rotate(second.refreshToken));

      expect(repository.sessions.get(second.sessionId)?.replacedById).toBe(third.sessionId);
    });

    it('rechaza una sesión caducada sin tratarla como robo', async () => {
      const first = await service.startSession(USER_ID);
      jest.advanceTimersByTime(EIGHT_HOURS_MS);

      await expect(service.rotate(first.refreshToken)).resolves.toEqual({ outcome: 'invalid' });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('rechaza un token desconocido', async () => {
      await expect(service.rotate('A'.repeat(43))).resolves.toEqual({ outcome: 'invalid' });
    });

    it('rechaza un token mal formado sin consultar la base', async () => {
      const lookup = jest.spyOn(repository, 'findSessionByRefreshTokenHash');

      await expect(service.rotate('no-es-un-token')).resolves.toEqual({ outcome: 'invalid' });
      await expect(service.rotate('')).resolves.toEqual({ outcome: 'invalid' });
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  describe('reutilización de un token ya rotado (D4)', () => {
    it('revoca todas las sesiones del usuario, incluida la sucesora legítima', async () => {
      const first = await service.startSession(USER_ID);
      const second = rotatedSession(await service.rotate(first.refreshToken));

      const result = await service.rotate(first.refreshToken);

      expect(result).toEqual({ outcome: 'reused', userId: USER_ID });
      expect(repository.activeSessionsOf(USER_ID)).toHaveLength(0);
      expect(repository.sessions.get(second.sessionId)?.revokedReason).toBe('refresh_reuse_detected');
      await expect(service.rotate(second.refreshToken)).resolves.toEqual({ outcome: 'invalid' });
    });

    it('detecta un token antiguo de la cadena, no solo el inmediatamente anterior', async () => {
      const first = await service.startSession(USER_ID);
      const second = rotatedSession(await service.rotate(first.refreshToken));
      rotatedSession(await service.rotate(second.refreshToken));

      await expect(service.rotate(first.refreshToken)).resolves.toEqual({ outcome: 'reused', userId: USER_ID });
      expect(repository.activeSessionsOf(USER_ID)).toHaveLength(0);
    });

    it('cierra también las sesiones del usuario en otros dispositivos, pero no las de otros usuarios', async () => {
      const laptop = await service.startSession(USER_ID);
      await service.startSession(USER_ID);
      await service.startSession(OTHER_USER_ID);
      rotatedSession(await service.rotate(laptop.refreshToken));

      await service.rotate(laptop.refreshToken);

      expect(repository.activeSessionsOf(USER_ID)).toHaveLength(0);
      expect(repository.activeSessionsOf(OTHER_USER_ID)).toHaveLength(1);
    });

    it('lo detecta aunque la sesión ya haya caducado', async () => {
      const first = await service.startSession(USER_ID);
      rotatedSession(await service.rotate(first.refreshToken));
      jest.advanceTimersByTime(EIGHT_HOURS_MS + 1);

      await expect(service.rotate(first.refreshToken)).resolves.toEqual({ outcome: 'reused', userId: USER_ID });
    });

    it('registra auth.refresh.reused sin el token ni su hash', async () => {
      const first = await service.startSession(USER_ID);
      rotatedSession(await service.rotate(first.refreshToken));

      await service.rotate(first.refreshToken, { correlationId: 'corr-1' });

      expect(logger.warn).toHaveBeenCalledWith(
        'auth.refresh.reused',
        expect.objectContaining({ correlationId: 'corr-1', userId: USER_ID, sessionId: first.sessionId }),
      );
      const logged = JSON.stringify(logger.warn.mock.calls);
      expect(logged).not.toContain(first.refreshToken);
      expect(logged).not.toContain(hashRefreshToken(first.refreshToken));
    });

    it('dos peticiones simultáneas con el mismo token: una rota y la otra cuenta como reutilización', async () => {
      const first = await service.startSession(USER_ID);

      const results = await Promise.all([service.rotate(first.refreshToken), service.rotate(first.refreshToken)]);

      expect(results.map((result) => result.outcome).sort()).toEqual(['reused', 'rotated']);
      // Nunca quedan dos sesiones válidas nacidas del mismo token.
      expect(repository.activeSessionsOf(USER_ID)).toHaveLength(0);
    });

    it('si un logout se adelanta a la rotación, el token es inválido pero no se trata como robo', async () => {
      const first = await service.startSession(USER_ID);
      await service.startSession(USER_ID);
      const originalRotate = repository.rotateSession.bind(repository);
      jest.spyOn(repository, 'rotateSession').mockImplementation(async (id, next, now) => {
        await service.endSession(first.refreshToken);
        return originalRotate(id, next, now);
      });

      await expect(service.rotate(first.refreshToken)).resolves.toEqual({ outcome: 'invalid' });
      expect(repository.activeSessionsOf(USER_ID)).toHaveLength(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    it('revoca la sesión y el token deja de servir, sin considerarlo robo', async () => {
      const first = await service.startSession(USER_ID);

      await service.endSession(first.refreshToken);

      expect(repository.sessions.get(first.sessionId)?.revokedReason).toBe('logout');
      await expect(service.rotate(first.refreshToken)).resolves.toEqual({ outcome: 'invalid' });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('no falla con un token desconocido o mal formado', async () => {
      await expect(service.endSession('A'.repeat(43))).resolves.toBeUndefined();
      await expect(service.endSession('basura')).resolves.toBeUndefined();
    });

    it('no reescribe el motivo de una sesión ya revocada', async () => {
      const first = await service.startSession(USER_ID);
      rotatedSession(await service.rotate(first.refreshToken));

      await service.endSession(first.refreshToken);

      expect(repository.sessions.get(first.sessionId)?.revokedReason).toBe('rotated');
    });
  });

  describe('revokeAllForUser', () => {
    it('revoca todas las sesiones vigentes del usuario y devuelve cuántas', async () => {
      await service.startSession(USER_ID);
      await service.startSession(USER_ID);
      await service.startSession(OTHER_USER_ID);

      await expect(service.revokeAllForUser(USER_ID, 'password_changed')).resolves.toBe(2);
      expect(repository.activeSessionsOf(USER_ID)).toHaveLength(0);
      expect(repository.activeSessionsOf(OTHER_USER_ID)).toHaveLength(1);
    });
  });
});
