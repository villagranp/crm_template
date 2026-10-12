import { randomUUID } from 'node:crypto';

import { type INestApplication, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request, { type Response } from 'supertest';

import { AppModule } from '@/app.module';
import { createValidationPipe } from '@/common/filters/validation-exception.factory';
import { PasswordService } from '@/modules/auth/password.service';

import { INTEGRATION_ENV } from './support/integration-env';

/**
 * Integración de la autenticación local contra PostgreSQL real
 * (PLAN-AUTH-LOCAL §7). El esquema `integration_test` lo prepara
 * global-setup.ts con migraciones y semilla.
 */

const PASSWORD = 'una-contrasena-de-prueba-larga';
const NEW_PASSWORD = 'otra-contrasena-de-prueba-larga';

let app: INestApplication;
let prisma: PrismaClient;
const passwordService = new PasswordService();

/** Una IP distinta por prueba: el límite de intentos es por IP. */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function api() {
  return request(app.getHttpServer());
}

interface TestUser {
  id: string;
  email: string;
}

async function createUser(
  options: {
    roleCode?: string;
    status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
    password?: string | null;
    mustChangePassword?: boolean;
  } = {},
): Promise<TestUser> {
  const email = `persona-${randomUUID()}@integration.test`;
  const role = await prisma.role.findUniqueOrThrow({ where: { code: options.roleCode ?? 'usuario' } });
  const password = options.password === undefined ? PASSWORD : options.password;

  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      firstName: 'Persona',
      lastName: 'De prueba',
      displayName: 'Persona De prueba',
      status: options.status ?? 'ACTIVE',
      roles: { create: { roleId: role.id } },
      credential: password
        ? {
            create: {
              passwordHash: await passwordService.hash(password),
              mustChangePassword: options.mustChangePassword ?? false,
            },
          }
        : undefined,
    },
  });
  return { id: user.id, email };
}

function login(email: string, password: string, ip = nextIp()) {
  return api().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password });
}

function refreshCookieOf(response: Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('refresh_token='));
  const value = cookie?.split(';')[0]?.slice('refresh_token='.length);
  return value ? value : undefined;
}

function refresh(cookie: string | undefined) {
  const call = api().post('/api/v1/auth/refresh').set('X-Forwarded-For', nextIp());
  return cookie ? call.set('Cookie', `refresh_token=${cookie}`) : call;
}

/** Cuerpo de error sin el correlationId, que cambia en cada petición. */
function errorShape(response: Response) {
  const body = { ...(response.body as Record<string, unknown>) };
  delete body['correlationId'];
  return { status: response.status, body };
}

beforeAll(async () => {
  prisma = new PrismaClient();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
  // Mismo arranque que main.ts en lo que afecta a estas pruebas.
  nestApp.set('trust proxy', 1);
  nestApp.setGlobalPrefix('api');
  nestApp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  nestApp.useGlobalPipes(createValidationPipe());
  await nestApp.init();
  app = nestApp;
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
});

describe('POST /auth/login', () => {
  it('con credenciales correctas devuelve la sesión y fija la cookie de refresco', async () => {
    const user = await createUser({ roleCode: 'administrador' });

    const response = await login(user.email, PASSWORD).expect(200);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      passwordChangeRequired: false,
      user: { id: user.id, email: user.email, roles: ['administrador'] },
    });
    expect(response.body.user.permissions).toContain('usuarios.ver');
    expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('refresh_token='),
    );
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/Secure/);
    // El refresh token nunca va en el cuerpo.
    expect(JSON.stringify(response.body)).not.toContain(refreshCookieOf(response));
  });

  it('el access token emitido abre la API: GET /me/menu', async () => {
    const user = await createUser({ roleCode: 'administrador' });
    const { body } = await login(user.email, PASSWORD).expect(200);

    await api().get('/api/v1/me/menu').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
  });

  it('no distingue contraseña incorrecta, usuario inexistente ni cuenta sin credencial', async () => {
    const user = await createUser();
    const withoutCredential = await createUser({ password: null });

    const wrongPassword = await login(user.email, 'contrasena-incorrecta');
    const unknownUser = await login(`nadie-${randomUUID()}@integration.test`, 'contrasena-incorrecta');
    const noCredential = await login(withoutCredential.email, 'contrasena-incorrecta');

    expect(errorShape(wrongPassword)).toEqual(errorShape(unknownUser));
    expect(errorShape(noCredential)).toEqual(errorShape(unknownUser));
    expect(errorShape(unknownUser)).toMatchObject({ status: 401, body: { code: 'INVALID_CREDENTIALS' } });
  });

  it('acepta el correo con otras mayúsculas', async () => {
    const user = await createUser();

    await login(user.email.toUpperCase(), PASSWORD).expect(200);
  });

  it.each(['SUSPENDED', 'LOCKED'] as const)('una cuenta %s no entra aunque la contraseña sea correcta', async (status) => {
    const user = await createUser({ status });

    const response = await login(user.email, PASSWORD).expect(403);

    expect(response.body.code).toBe('ACCOUNT_DISABLED');
    expect(refreshCookieOf(response)).toBeUndefined();
  });

  it('bloquea tras 5 fallos: la contraseña correcta tampoco entra (D8)', async () => {
    const user = await createUser();
    const ip = nextIp();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(user.email, 'contrasena-incorrecta', ip).expect(401);
    }
    const blocked = await login(user.email, PASSWORD, ip).expect(401);

    expect(blocked.body.code).toBe('INVALID_CREDENTIALS');
    const credential = await prisma.userCredential.findUniqueOrThrow({ where: { userId: user.id } });
    expect(credential.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('peticiones simultáneas no superan el bloqueo: como mucho 5 contraseñas verificadas (D8)', async () => {
    const user = await createUser();

    // Cada una desde su propia IP: el límite por IP no interviene, solo el bloqueo.
    const responses = await Promise.all(
      Array.from({ length: 15 }, () => login(user.email, 'contrasena-incorrecta')),
    );

    expect(responses.every((response) => response.status === 401)).toBe(true);
    const verified = await prisma.loginAttempt.count({
      where: { userId: user.id, failureReason: 'invalid_password' },
    });
    expect(verified).toBeLessThanOrEqual(5);
    await login(user.email, PASSWORD).expect(401);
  });

  it('registra cada intento en login_attempts', async () => {
    const user = await createUser();

    await login(user.email, 'contrasena-incorrecta').expect(401);
    await login(user.email, PASSWORD).expect(200);

    const attempts = await prisma.loginAttempt.findMany({
      where: { userId: user.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(attempts.map((attempt) => [attempt.succeeded, attempt.failureReason])).toEqual([
      [false, 'invalid_password'],
      [true, null],
    ]);
  });

  it('limita a 10 intentos por minuto desde la misma IP', async () => {
    const ip = nextIp();
    const email = `nadie-${randomUUID()}@integration.test`;

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await login(email, 'contrasena-incorrecta', ip).expect(401);
    }
    await login(email, 'contrasena-incorrecta', ip).expect(429);
  });

  it('valida el cuerpo: 400 sin correo válido', async () => {
    await api().post('/api/v1/auth/login').set('X-Forwarded-For', nextIp()).send({ email: 'no-es-correo', password: 'x' }).expect(400);
  });
});

describe('POST /auth/refresh', () => {
  it('rota la cookie: la nueva sirve y la anterior ya no', async () => {
    const user = await createUser();
    const first = refreshCookieOf(await login(user.email, PASSWORD).expect(200));

    const rotated = await refresh(first).expect(200);
    const second = refreshCookieOf(rotated);

    expect(rotated.body.accessToken).toEqual(expect.any(String));
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    await refresh(second).expect(200);
  });

  it('reutilizar un refresh ya rotado revoca todas las sesiones del usuario (D4)', async () => {
    const user = await createUser();
    const otherDevice = refreshCookieOf(await login(user.email, PASSWORD).expect(200));
    const first = refreshCookieOf(await login(user.email, PASSWORD).expect(200));
    const second = refreshCookieOf(await refresh(first).expect(200));

    const reused = await refresh(first).expect(401);

    expect(reused.body.code).toBe('INVALID_REFRESH_TOKEN');
    await refresh(second).expect(401);
    await refresh(otherDevice).expect(401);
    const audit = await prisma.auditLog.findFirst({ where: { event: 'auth.refresh.reused', subjectId: user.id } });
    expect(audit).not.toBeNull();
  });

  it('sin cookie responde 401 INVALID_REFRESH_TOKEN', async () => {
    const response = await refresh(undefined).expect(401);

    expect(response.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('una cookie inválida se borra', async () => {
    const response = await refresh('A'.repeat(43)).expect(401);

    const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) =>
      value.startsWith('refresh_token='),
    );
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('si la cuenta se suspende con la sesión abierta, el refresh deja de funcionar', async () => {
    const user = await createUser();
    const cookie = refreshCookieOf(await login(user.email, PASSWORD).expect(200));

    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    await refresh(cookie).expect(401);
  });
});

describe('POST /auth/logout', () => {
  it('revoca la sesión: el refresh posterior falla', async () => {
    const user = await createUser();
    const cookie = refreshCookieOf(await login(user.email, PASSWORD).expect(200));

    await api().post('/api/v1/auth/logout').set('Cookie', `refresh_token=${cookie}`).expect(204);

    await refresh(cookie).expect(401);
  });

  it('responde 204 aunque no haya cookie', async () => {
    await api().post('/api/v1/auth/logout').expect(204);
  });
});

describe('Contraseña inicial y cambio obligatorio (D11–D14)', () => {
  it('el administrador sembrado entra con SEED_ADMIN_PASSWORD y debe cambiarla', async () => {
    const response = await login(INTEGRATION_ENV.SEED_ADMIN_EMAIL, INTEGRATION_ENV.SEED_ADMIN_PASSWORD).expect(200);

    expect(response.body.passwordChangeRequired).toBe(true);
  });

  it('con cambio pendiente, la API rechaza todo salvo el cambio de contraseña', async () => {
    const user = await createUser({ status: 'INVITED', mustChangePassword: true });
    const { body } = await login(user.email, PASSWORD).expect(200);

    const blocked = await api().get('/api/v1/me').set('Authorization', `Bearer ${body.accessToken}`).expect(403);

    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('al cambiarla: sesión nueva sin restricción, cuenta ACTIVE y la contraseña anterior deja de servir', async () => {
    const user = await createUser({ status: 'INVITED', mustChangePassword: true });
    const { body } = await login(user.email, PASSWORD).expect(200);

    const changed = await api()
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .set('X-Forwarded-For', nextIp())
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);

    expect(changed.body.passwordChangeRequired).toBe(false);
    expect(refreshCookieOf(changed)).toBeDefined();
    await api().get('/api/v1/me').set('Authorization', `Bearer ${changed.body.accessToken}`).expect(200);
    await login(user.email, PASSWORD).expect(401);
    await login(user.email, NEW_PASSWORD).expect(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.status).toBe('ACTIVE');
  });
});

describe('POST /auth/password/change', () => {
  it('sin sesión: 401', async () => {
    await api()
      .post('/api/v1/auth/password/change')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
  });

  it('contraseña actual incorrecta: 422 INVALID_CURRENT_PASSWORD', async () => {
    const user = await createUser();
    const { body } = await login(user.email, PASSWORD).expect(200);

    const response = await api()
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .set('X-Forwarded-For', nextIp())
      .send({ currentPassword: 'contrasena-incorrecta', newPassword: NEW_PASSWORD })
      .expect(422);

    expect(response.body.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('nueva contraseña fuera de política: 422 con los motivos', async () => {
    const user = await createUser();
    const { body } = await login(user.email, PASSWORD).expect(200);

    const response = await api()
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .set('X-Forwarded-For', nextIp())
      .send({ currentPassword: PASSWORD, newPassword: 'corta' })
      .expect(422);

    expect(response.body.code).toBe('PASSWORD_POLICY_VIOLATION');
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'newPassword', issue: expect.any(String) })]),
    );
  });

  it('revoca las demás sesiones del usuario', async () => {
    const user = await createUser();
    const otherDevice = refreshCookieOf(await login(user.email, PASSWORD).expect(200));
    const { body } = await login(user.email, PASSWORD).expect(200);

    await api()
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .set('X-Forwarded-For', nextIp())
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);

    await refresh(otherDevice).expect(401);
  });
});

describe('POST /users/{id}/password/reset', () => {
  async function tokenFor(roleCode: string): Promise<string> {
    const actor = await createUser({ roleCode });
    const { body } = await login(actor.email, PASSWORD).expect(200);
    return body.accessToken as string;
  }

  it('sin sesión: 401', async () => {
    const target = await createUser();

    await api().post(`/api/v1/users/${target.id}/password/reset`).expect(401);
  });

  it('sin el permiso usuarios.editar: 403', async () => {
    const target = await createUser();
    const token = await tokenFor('usuario');

    await api().post(`/api/v1/users/${target.id}/password/reset`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('usuario inexistente: 404', async () => {
    const token = await tokenFor('administrador');

    await api().post(`/api/v1/users/${randomUUID()}/password/reset`).set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('asigna la contraseña inicial con cambio obligatorio, levanta el bloqueo y cierra sus sesiones', async () => {
    const target = await createUser();
    const session = refreshCookieOf(await login(target.email, PASSWORD).expect(200));
    await prisma.userCredential.update({
      where: { userId: target.id },
      data: { lockedUntil: new Date(Date.now() + 3_600_000) },
    });
    const token = await tokenFor('administrador');

    await api().post(`/api/v1/users/${target.id}/password/reset`).set('Authorization', `Bearer ${token}`).expect(204);

    await refresh(session).expect(401);
    await login(target.email, PASSWORD).expect(401);
    const response = await login(target.email, INTEGRATION_ENV.AUTH_DEFAULT_PASSWORD).expect(200);
    expect(response.body.passwordChangeRequired).toBe(true);
  });
});

describe('POST /users (alta con contraseña inicial, D12)', () => {
  it('el usuario nuevo entra con AUTH_DEFAULT_PASSWORD y debe cambiarla', async () => {
    const admin = await createUser({ roleCode: 'administrador' });
    const { body } = await login(admin.email, PASSWORD).expect(200);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'usuario' } });
    const email = `alta-${randomUUID()}@integration.test`;

    await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ email, firstName: 'Alta', lastName: 'Nueva', roleIds: [role.id] })
      .expect(201);

    const response = await login(email, INTEGRATION_ENV.AUTH_DEFAULT_PASSWORD).expect(200);
    expect(response.body.passwordChangeRequired).toBe(true);
  });
});
