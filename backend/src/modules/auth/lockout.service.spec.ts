import { LockoutService } from './lockout.service';
import type { AuthRepository, SecuritySettings } from './ports/auth.repository.port';

const NOW = new Date('2026-10-08T10:00:00.000Z');
const CREDENTIAL_ID = 'cred-1';

/** Credencial en memoria con la misma semántica atómica que el SQL del adaptador. */
function setup(settings: SecuritySettings = { maxFailedAttempts: 5, lockoutMinutes: 15, passwordExpiryDays: 0 }) {
  const state = { failedAttempts: 0, lockedUntil: null as Date | null };

  const repository = {
    getSecuritySettings: jest.fn(async () => settings),
    reserveLoginAttempt: jest.fn(async (_id: string, now: Date) => {
      if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
        return null;
      }
      state.failedAttempts = state.lockedUntil ? 1 : state.failedAttempts + 1;
      state.lockedUntil = null;
      return state.failedAttempts;
    }),
    lockCredential: jest.fn(async (_id: string, until: Date, now: Date) => {
      if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
        return false;
      }
      state.lockedUntil = until;
      return true;
    }),
    clearFailedAttempts: jest.fn(async () => {
      state.failedAttempts = 0;
      state.lockedUntil = null;
    }),
  };

  const service = new LockoutService(repository as unknown as AuthRepository);

  /** Un intento completo con contraseña incorrecta, como lo hace AuthService. */
  async function failedLogin(now = NOW): Promise<'rejected' | 'verified'> {
    const reservation = await service.reserveAttempt(CREDENTIAL_ID, now);
    if (!reservation.allowed) {
      return 'rejected';
    }
    await service.registerFailure(CREDENTIAL_ID, reservation.attemptNumber, now);
    return 'verified';
  }

  return { service, repository, state, failedLogin };
}

describe('LockoutService (D8)', () => {
  it('permite verificar los cinco primeros intentos', async () => {
    const { failedLogin } = setup();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(failedLogin()).resolves.toBe('verified');
    }
  });

  it('bloquea al quinto fallo durante los minutos configurados', async () => {
    const { failedLogin, state } = setup();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await failedLogin();
    }

    expect(state.lockedUntil).toEqual(new Date(NOW.getTime() + 15 * 60_000));
    await expect(failedLogin()).resolves.toBe('rejected');
  });

  it('el fallo que bloquea devuelve la fecha de desbloqueo, para auditarlo una sola vez', async () => {
    const { service } = setup();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await service.registerFailure(CREDENTIAL_ID, attempt, NOW);
    }

    await expect(service.registerFailure(CREDENTIAL_ID, 5, NOW)).resolves.toEqual(
      new Date(NOW.getTime() + 15 * 60_000),
    );
    await expect(service.registerFailure(CREDENTIAL_ID, 5, NOW)).resolves.toBeNull();
  });

  it('peticiones simultáneas: solo las cinco primeras llegan a verificar una contraseña', async () => {
    const { failedLogin, state } = setup();

    const results = await Promise.all(Array.from({ length: 20 }, () => failedLogin()));

    expect(results.filter((result) => result === 'verified')).toHaveLength(5);
    expect(state.lockedUntil).not.toBeNull();
  });

  it('libera la cuenta pasados los minutos y la ventana vuelve a empezar', async () => {
    const { failedLogin } = setup();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await failedLogin();
    }
    const later = new Date(NOW.getTime() + 15 * 60_000);

    await expect(failedLogin(new Date(later.getTime() - 1))).resolves.toBe('rejected');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(failedLogin(later)).resolves.toBe('verified');
    }
  });

  it('un acierto reinicia el contador', async () => {
    const { service, failedLogin, state } = setup();
    await failedLogin();
    await failedLogin();

    await service.registerSuccess(CREDENTIAL_ID);

    expect(state.failedAttempts).toBe(0);
  });

  it('respeta los umbrales de system_parameters', async () => {
    const { failedLogin, state } = setup({ maxFailedAttempts: 2, lockoutMinutes: 1, passwordExpiryDays: 0 });

    await failedLogin();
    await failedLogin();

    expect(state.lockedUntil).toEqual(new Date(NOW.getTime() + 60_000));
  });
});
