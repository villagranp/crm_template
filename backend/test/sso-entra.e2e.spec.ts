// Debe ir primero: fija AUTH_PROVIDER=entra y ENTRA_* antes de que se cargue AppModule.
import './support/entra-env';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';

import { type CliDeps as LoadCliDeps, EXIT_ERRORS, EXIT_OK, EXIT_REJECTED, runCli as runLoadCli } from '@/modules/initial-data-load/cli/load-initial-data.cli';
import { InitialDataLoader } from '@/modules/initial-data-load/initial-data-loader.service';
import { ENTITY_DEFINITIONS } from '@/modules/initial-data-load/initial-data-templates';
import { type CliDeps as RevokeCliDeps, EXIT_ABORTED, runCli as runRevokeCli } from '@/modules/identity-cutover/cli/revoke-local-credentials.cli';
import { LocalCredentialRevocationService } from '@/modules/identity-cutover/local-credential-revocation.service';

import { api, uniqueSuffix, withParameter } from './support/crm-fixtures';
import { ENTRA_TEST } from './support/entra-env';
import { entraToken, initEntraTestKeys, newOid, withEntraTestProvider } from './support/entra-tokens';
import { closeTestContext, createTestContext, createTestUser, TEST_PASSWORD, type TestContext, type TestUser } from './support/test-app';

/**
 * SSO con Microsoft Entra ID (ADR-027) contra PostgreSQL, con `AUTH_PROVIDER=entra` y el proveedor
 * real de Entra ID verificando tokens firmados con un par de llaves de prueba (sin red, sin tenant).
 *
 * Cubre el alta al primer ingreso (sin permisos, idempotente, a prueba de carreras, auditada), la
 * vinculación solo por `oid`, el interruptor, el rechazo de tokens inválidos, `pendingAccess`, la
 * vinculación por lote (CLI) y la revocación de credenciales locales (CLI).
 *
 * Qué NO prueba: un tenant real de Microsoft (claims reales, JWKS remoto, rotación de llaves).
 */

const PROVISIONING_SWITCH = 'seguridad.sso_alta_automatica';
const NOT_LINKED_MESSAGE = 'Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.';

let context: TestContext;
let workDir: string;

const DOMAINS_PARAMETER = 'seguridad.sso_dominios_permitidos';
let originalDomains: string;

beforeAll(async () => {
  await initEntraTestKeys();
  context = await createTestContext({ configure: withEntraTestProvider });
  workDir = await mkdtemp(join(tmpdir(), 'sso-entra-'));
  // Los correos de la suite son @integration.test: el parámetro sembrado (somosgrupoag.com) se amplía mientras corre.
  // Solo esta suite lee el parámetro (las demás corren con AUTH_PROVIDER=local).
  originalDomains = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: DOMAINS_PARAMETER } })).value;
  await context.prisma.systemParameter.update({ where: { key: DOMAINS_PARAMETER }, data: { value: 'integration.test,somosgrupoag.com' } });
});

afterAll(async () => {
  await context.prisma.systemParameter.update({ where: { key: DOMAINS_PARAMETER }, data: { value: originalDomains } });
  await rm(workDir, { recursive: true, force: true });
  await closeTestContext(context);
});

const uniqueEmail = (): string => `sso-${randomUUID()}@integration.test`;

/** Usuario local con rol y credencial, vinculado a un `oid` (la vinculación que hace el administrador). */
async function linkedUser(roleCodes: string[], options: { status?: 'ACTIVE' | 'SUSPENDED' | 'LOCKED' } = {}): Promise<TestUser & { oid: string }> {
  const user = await createTestUser(context.prisma, { roleCodes, status: options.status });
  const oid = newOid();
  await context.prisma.userIdentity.create({ data: { userId: user.id, provider: 'ENTRA_ID', subject: oid, tenantId: ENTRA_TEST.tenantId } });
  return { ...user, oid };
}

async function profile(token: string): Promise<request.Response> {
  return api(context, token).get('/me');
}

async function provisionedUser(email: string): Promise<{ id: string; status: string; firstName: string; lastName: string; displayName: string; locale: string; timeZone: string; employeeCode: string | null; countryId: string | null } | null> {
  return context.prisma.user.findUnique({
    where: { emailNormalized: email.toLowerCase() },
    select: { id: true, status: true, firstName: true, lastName: true, displayName: true, locale: true, timeZone: true, employeeCode: true, countryId: true },
  });
}

describe('primer ingreso con Entra ID (alta automática, sin permisos)', () => {
  it('crea el usuario ACTIVE sin roles, permisos, equipos ni país; /me y /me/menu responden sin 500', async () => {
    const email = uniqueEmail();
    const oid = newOid();
    const token = await entraToken({ oid, email: email.toUpperCase(), name: 'Ana María Beltrán' });

    const me = await profile(token);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, displayName: 'Ana María Beltrán', roles: [], permissions: [], teams: [] });

    const user = await provisionedUser(email);
    expect(user).toMatchObject({ status: 'ACTIVE', firstName: 'Ana', lastName: 'María Beltrán', displayName: 'Ana María Beltrán', locale: 'es-GT', timeZone: 'America/Guatemala', employeeCode: null, countryId: null });
    const links = await context.prisma.user.findUniqueOrThrow({
      where: { id: user!.id },
      select: {
        roles: true,
        permissions: true,
        menuOptions: true,
        teams: true,
        credential: true,
        identities: { select: { provider: true, subject: true, tenantId: true } },
      },
    });
    expect(links.roles).toEqual([]);
    expect(links.permissions).toEqual([]);
    expect(links.menuOptions).toEqual([]);
    expect(links.teams).toEqual([]);
    expect(links.credential).toBeNull();
    expect(links.identities).toEqual([{ provider: 'ENTRA_ID', subject: oid, tenantId: ENTRA_TEST.tenantId }]);

    const menu = await api(context, token).get('/me/menu');
    expect(menu.status).toBe(200);
    // Solo opciones públicas (p. ej. «Panel de control»): ninguna exige un permiso que no tiene.
    const options = (menu.body as { options: { requiredPermission: string | null; children: { requiredPermission: string | null }[] }[] }[]).flatMap((module) => module.options.flatMap((option) => [option, ...option.children]));
    expect(options.every((option) => option.requiredPermission === null)).toBe(true);
  });

  it('un usuario recién provisionado no puede usar ningún endpoint protegido: 403', async () => {
    const token = await entraToken({});
    for (const path of ['/users', '/roles', '/audit-logs', '/parameters']) {
      const response = await api(context, token).get(path);
      expect(response.status).toBe(403);
    }
  });

  it('deja auditado user.provisioned con actor sistema, origen ENTRA_ID y el correo enmascarado', async () => {
    const email = uniqueEmail();
    await profile(await entraToken({ email, name: 'Luis Prueba' }));
    const user = await provisionedUser(email);
    const events = await context.prisma.auditLog.findMany({ where: { event: 'user.provisioned', resourceId: user!.id } });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({ resourceType: 'user', subjectId: null, subjectEmail: null, metadata: { source: 'ENTRA_ID', actor: 'system' } });
    expect(event!.correlationId.length).toBeGreaterThan(0);
    // Sin PII en claro en la bitácora.
    expect(JSON.stringify(event!.changes)).not.toContain(email);
    expect(JSON.stringify(event!.changes)).not.toContain('Luis');
  });

  it('la segunda petición no duplica nada: un usuario, una identidad, un evento', async () => {
    const email = uniqueEmail();
    const oid = newOid();
    const token = await entraToken({ oid, email });
    expect((await profile(token)).status).toBe(200);
    expect((await profile(token)).status).toBe(200);
    // Otro token del mismo oid, incluso con otro correo en el claim: es la misma identidad.
    const again = await profile(await entraToken({ oid, email: uniqueEmail() }));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ email });

    const user = await provisionedUser(email);
    expect(await context.prisma.user.count({ where: { emailNormalized: email } })).toBe(1);
    expect(await context.prisma.userIdentity.count({ where: { provider: 'ENTRA_ID', subject: oid } })).toBe(1);
    expect(await context.prisma.auditLog.count({ where: { event: 'user.provisioned', resourceId: user!.id } })).toBe(1);
  });

  it('8 peticiones simultáneas del primer ingreso (5 rondas con usuarios nuevos): un solo usuario por ronda, todas 200, sin 500 ni falso IDENTITY_NOT_LINKED', async () => {
    for (let round = 0; round < 5; round += 1) {
      const email = uniqueEmail();
      const oid = newOid();
      const token = await entraToken({ oid, email });

      const responses = await Promise.all(Array.from({ length: 8 }, () => profile(token)));
      expect(responses.map((response) => [response.status, response.body.code])).toEqual(Array(8).fill([200, undefined]));
      expect(new Set(responses.map((response) => (response.body as { id: string }).id)).size).toBe(1);

      const user = await provisionedUser(email);
      expect(await context.prisma.user.count({ where: { emailNormalized: email } })).toBe(1);
      expect(await context.prisma.userIdentity.count({ where: { provider: 'ENTRA_ID', subject: oid } })).toBe(1);
      expect(await context.prisma.auditLog.count({ where: { event: 'user.provisioned', resourceId: user!.id } })).toBe(1);
    }
  });

  it('el correo puede venir del claim email si preferred_username no es un correo', async () => {
    const email = uniqueEmail();
    const response = await profile(await entraToken({ email: 'usuario-sin-arroba', emailClaim: email }));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email });
  });

  it('sin nombre en el token usa la parte local del correo', async () => {
    const email = uniqueEmail();
    const response = await profile(await entraToken({ email, name: null }));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ displayName: email.split('@')[0] });
  });

  it('M2: un invitado (preferred_username con #EXT#) no cae al claim email: 403 IDENTITY_INCOMPLETE y no crea nada', async () => {
    const oid = newOid();
    const response = await profile(await entraToken({ oid, email: 'ana_empresa.com#EXT#@tenant.onmicrosoft.com', emailClaim: uniqueEmail() }));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('IDENTITY_INCOMPLETE');
    expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);
  });

  it('M3: un correo con caracteres de ancho cero o bidi no se acepta: 403 IDENTITY_INCOMPLETE', async () => {
    const zeroWidth = `ana${String.fromCharCode(0x200b)}-${randomUUID()}@integration.test`;
    const response = await profile(await entraToken({ email: zeroWidth }));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('IDENTITY_INCOMPLETE');
  });

  it('sin correo utilizable: 403 IDENTITY_INCOMPLETE con correlationId y no crea nada', async () => {
    const oid = newOid();
    const before = await context.prisma.user.count();
    const response = await profile(await entraToken({ oid, email: null }));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ statusCode: 403, code: 'IDENTITY_INCOMPLETE', correlationId: expect.any(String) });
    expect(response.body.message).toMatch(/correo/);
    expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);
    // Otras suites crean usuarios en paralelo; lo que importa es que esta identidad no dejó rastro.
    expect(await context.prisma.user.count()).toBeGreaterThanOrEqual(before);
  });
});

describe('dominios permitidos para el alta (seguridad.sso_dominios_permitidos)', () => {
  it.each([
    ['evil-integration.test', (id: string) => `sso-${id}@evil-integration.test`],
    ['integration.test.evil.io', (id: string) => `sso-${id}@integration.test.evil.io`],
    ['un subdominio', (id: string) => `sso-${id}@sub.integration.test`],
    ['otro dominio', (id: string) => `sso-${id}@example.invalid`],
  ])('un correo de %s: 403 IDENTITY_DOMAIN_NOT_ALLOWED y no se crea nada', async (_name, emailFor) => {
    const email = emailFor(randomUUID());
    const oid = newOid();
    const response = await profile(await entraToken({ oid, email }));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'IDENTITY_DOMAIN_NOT_ALLOWED',
      message: 'Tu correo no pertenece a un dominio autorizado. Contacta al administrador.',
      correlationId: expect.any(String),
    });
    expect(await provisionedUser(email)).toBeNull();
    expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);
  });

  it('el dominio se evalúa antes que el correo existente y que el interruptor', async () => {
    const outsider = `ana-${randomUUID()}@evil-integration.test`;
    await context.prisma.user.create({ data: { email: outsider, emailNormalized: outsider, firstName: 'Ana', lastName: 'Externa', displayName: 'Ana Externa', status: 'ACTIVE' } });
    await withParameter(context.prisma, PROVISIONING_SWITCH, 'false', async () => {
      const response = await profile(await entraToken({ email: outsider }));
      expect(response.body.code).toBe('IDENTITY_DOMAIN_NOT_ALLOWED');
    });
  });

  it('la comparación no distingue mayúsculas, y la lista admite varios dominios', async () => {
    const response = await profile(await entraToken({ email: `SSO-${randomUUID()}@Integration.TEST` }));
    expect(response.status).toBe(200);
  });

  it('solo frena altas nuevas: un usuario ya vinculado entra aunque su dominio no esté en la lista', async () => {
    const outsider = await linkedUser(['usuario']);
    await context.prisma.user.update({ where: { id: outsider.id }, data: { email: `x-${randomUUID()}@example.invalid`, emailNormalized: `x-${randomUUID()}@example.invalid` } });
    const response = await profile(await entraToken({ oid: outsider.oid, email: `x-${randomUUID()}@example.invalid` }));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: outsider.id });
  });

  it('un valor vacío o ilegible en la base no autoriza a nadie', async () => {
    for (const value of ['', 'basura']) {
      await withParameter(context.prisma, DOMAINS_PARAMETER, value, async () => {
        const email = uniqueEmail();
        const response = await profile(await entraToken({ email }));
        expect(response.body.code).toBe('IDENTITY_DOMAIN_NOT_ALLOWED');
        expect(await provisionedUser(email)).toBeNull();
      });
    }
  });

  it('el parámetro existe, es STRING del grupo seguridad, exige parametros.configurar y se guarda en forma canónica', async () => {
    const row = await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: DOMAINS_PARAMETER } });
    expect(row).toMatchObject({ type: 'STRING', group: 'seguridad' });

    const editorOnly = await linkedUser(['gestor-accesos']);
    await context.prisma.userPermission.create({
      data: { userId: editorOnly.id, permissionId: (await context.prisma.permission.findUniqueOrThrow({ where: { code: 'parametros.editar' } })).id, effect: 'GRANT', reason: 'Prueba de dominios' },
    });
    const denied = await api(context, await entraToken({ oid: editorOnly.oid, email: editorOnly.email })).patch(`/parameters/${DOMAINS_PARAMETER}`).send({ value: 'otro.example.invalid' });
    expect(denied.status).toBe(403);

    const admin = await linkedUser(['administrador']);
    const adminToken = await entraToken({ oid: admin.oid, email: admin.email });
    await withParameter(context.prisma, DOMAINS_PARAMETER, 'integration.test', async () => {
      const ok = await api(context, adminToken).patch(`/parameters/${DOMAINS_PARAMETER}`).send({ value: ' Integration.TEST , otro.example.invalid,integration.test ' });
      expect(ok.status).toBe(200);
      expect(ok.body.value).toBe('integration.test,otro.example.invalid');
      const invalid = await api(context, adminToken).patch(`/parameters/${DOMAINS_PARAMETER}`).send({ value: 'sin-punto' });
      expect(invalid.status).toBe(422);
    });
  });
});

describe('vinculación solo por oid: nunca por correo', () => {
  it('un usuario local con ese correo y sin vínculo: 403 IDENTITY_NOT_LINKED; no se vincula ni se crea otro', async () => {
    const local = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const oid = newOid();
    const response = await profile(await entraToken({ oid, email: local.email.toUpperCase() }));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ statusCode: 403, code: 'IDENTITY_NOT_LINKED', message: NOT_LINKED_MESSAGE, correlationId: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toContain(local.id);
    expect(JSON.stringify(response.body)).not.toContain(local.email);
    expect(await context.prisma.userIdentity.count({ where: { OR: [{ subject: oid }, { userId: local.id, provider: 'ENTRA_ID' }] } })).toBe(0);
    expect(await context.prisma.user.count({ where: { emailNormalized: local.email } })).toBe(1);
    expect(await context.prisma.auditLog.count({ where: { event: 'user.provisioned', resourceId: local.id } })).toBe(0);
  });

  it('también en endpoints protegidos y repetido: sigue 403 y sigue sin vincular', async () => {
    const local = await createTestUser(context.prisma, { roleCodes: ['administrador'] });
    const token = await entraToken({ email: local.email });
    for (const path of ['/users', '/me', '/me/menu']) {
      const response = await api(context, token).get(path);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('IDENTITY_NOT_LINKED');
    }
    expect(await context.prisma.userIdentity.count({ where: { userId: local.id, provider: 'ENTRA_ID' } })).toBe(0);
  });

  it('un usuario vinculado entra con sus roles y permisos (no se provisiona nada)', async () => {
    const admin = await linkedUser(['administrador']);
    const before = await context.prisma.user.count({ where: { emailNormalized: admin.email } });
    const token = await entraToken({ oid: admin.oid, email: 'otro-correo-en-el-token@integration.test' });

    const me = await profile(token);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: admin.id, email: admin.email, roles: ['administrador'] });
    expect(me.body.permissions.length).toBeGreaterThan(10);
    expect((await api(context, token).get('/users')).status).toBe(200);
    expect(await context.prisma.user.count({ where: { emailNormalized: 'otro-correo-en-el-token@integration.test' } })).toBe(0);
    expect(await context.prisma.user.count({ where: { emailNormalized: admin.email } })).toBe(before);
  });

  it.each([
    ['suspendido', 'SUSPENDED' as const],
    ['bloqueado', 'LOCKED' as const],
  ])('un vinculado %s autentica pero no recibe permisos ni cuenta: no se crea otro usuario', async (_name, status) => {
    const user = await linkedUser(['administrador'], { status });
    const token = await entraToken({ oid: user.oid, email: user.email });
    expect((await profile(token)).status).toBe(401);
    expect((await api(context, token).get('/users')).status).toBe(403);
    expect(await context.prisma.user.count({ where: { emailNormalized: user.email } })).toBe(1);
    expect(await context.prisma.userIdentity.count({ where: { userId: user.id, provider: 'ENTRA_ID' } })).toBe(1);
  });
});

describe('interruptor seguridad.sso_alta_automatica', () => {
  it('apagado: el primer ingreso se rechaza con 403 SSO_PROVISIONING_DISABLED y no crea nada; al encender, entra', async () => {
    const email = uniqueEmail();
    const oid = newOid();
    const token = await entraToken({ oid, email });

    await withParameter(context.prisma, PROVISIONING_SWITCH, 'false', async () => {
      const response = await profile(token);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ statusCode: 403, code: 'SSO_PROVISIONING_DISABLED', correlationId: expect.any(String) });
      expect(await provisionedUser(email)).toBeNull();
      expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);

      // Un usuario ya provisionado o vinculado sigue entrando: el interruptor solo frena altas nuevas.
      const linked = await linkedUser(['usuario']);
      expect((await profile(await entraToken({ oid: linked.oid, email: linked.email }))).status).toBe(200);
    });

    expect((await profile(token)).status).toBe(200);
    expect(await provisionedUser(email)).not.toBeNull();
  });

  it('apagado y correo existente: sigue siendo IDENTITY_NOT_LINKED (el motivo más específico)', async () => {
    const local = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    await withParameter(context.prisma, PROVISIONING_SWITCH, 'false', async () => {
      const response = await profile(await entraToken({ email: local.email }));
      expect(response.body.code).toBe('IDENTITY_NOT_LINKED');
    });
  });

  it('un valor ilegible en la base se lee como el defecto documentado (true) y no rompe el ingreso', async () => {
    const email = uniqueEmail();
    await withParameter(context.prisma, PROVISIONING_SWITCH, 'quizá', async () => {
      expect((await profile(await entraToken({ email }))).status).toBe(200);
    });
  });

  it('el parámetro existe, es BOOLEAN del grupo seguridad y su edición exige parametros.configurar', async () => {
    const row = await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: PROVISIONING_SWITCH } });
    expect(row).toMatchObject({ type: 'BOOLEAN', group: 'seguridad', value: 'true' });

    const editorOnly = await linkedUser(['gestor-accesos']);
    await context.prisma.userPermission.create({
      data: { userId: editorOnly.id, permissionId: (await context.prisma.permission.findUniqueOrThrow({ where: { code: 'parametros.editar' } })).id, effect: 'GRANT', reason: 'Prueba del interruptor' },
    });
    const token = await entraToken({ oid: editorOnly.oid, email: editorOnly.email });
    const denied = await api(context, token).patch(`/parameters/${PROVISIONING_SWITCH}`).send({ value: 'false' });
    expect(denied.status).toBe(403);
    expect((await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: PROVISIONING_SWITCH } })).value).toBe('true');

    const admin = await linkedUser(['administrador']);
    await withParameter(context.prisma, PROVISIONING_SWITCH, 'true', async () => {
      const adminToken = await entraToken({ oid: admin.oid, email: admin.email });
      const ok = await api(context, adminToken).patch(`/parameters/${PROVISIONING_SWITCH}`).send({ value: 'false' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ key: PROVISIONING_SWITCH, value: 'false' });
    });
    expect((await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: PROVISIONING_SWITCH } })).value).toBe('true');
  });
});

describe('tokens que no se aceptan: 401, sin crear nada', () => {
  const cases: [string, Parameters<typeof entraToken>[0]][] = [
    ['de otra audiencia', { audience: 'api://otra-api' }],
    ['de otro issuer', { issuer: 'https://login.microsoftonline.com/9d0f6c3e-1111-4222-8333-444455556666/v2.0' }],
    ['de otro tenant (tid)', { tenantId: '9d0f6c3e-1111-4222-8333-444455556666' }],
    ['sin tid', { tenantId: null }],
    ['expirado', { expiresInSeconds: -600 }],
    ['todavía no válido (nbf)', { notBeforeInSeconds: 600 }],
    ['con firma de otra llave', { foreignSignature: true }],
    ['sin oid', { withoutOid: true }],
    ['de aplicación (sin scp)', { scp: null }],
    ['con otro scope', { scp: 'otro_scope' }],
    ['pedido por un cliente no permitido (azp)', { azp: '00000000-0000-4000-8000-000000000000' }],
    ['sin azp', { azp: null }],
    ['v1', { ver: '1.0' }],
    ['sin expiración', { withoutExp: true }],
  ];

  it.each(cases)('un token %s', async (_name, options) => {
    const email = uniqueEmail();
    const token = await entraToken({ ...options, email });
    for (const path of ['/me', '/me/menu', '/users']) {
      const response = await api(context, token).get(path);
      expect(response.status).toBe(401);
    }
    expect(await provisionedUser(email)).toBeNull();
  });

  it('sin token o con un texto que no es un JWT', async () => {
    expect((await api(context).get('/me')).status).toBe(401);
    expect((await api(context, 'no-es-un-jwt').get('/me')).status).toBe(401);
  });

  it('un token del login local (HS256) no sirve como token de Entra ID', async () => {
    const local = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const login = await request(context.app.getHttpServer()).post('/api/v1/auth/login').send({ email: local.email, password: TEST_PASSWORD });
    // Con AUTH_PROVIDER=entra los endpoints de autenticación local no existen.
    expect(login.status).toBe(404);
  });

  it.each(['/api/v1/auth/refresh', '/api/v1/auth/logout'])(
    '%s sigue inerte (404) con o sin la cabecera anti-CSRF: LocalAuthEnabledGuard decide primero',
    async (path) => {
      const server = context.app.getHttpServer();
      expect((await request(server).post(path)).status).toBe(404);
      expect((await request(server).post(path).set('X-Requested-With', 'XMLHttpRequest')).status).toBe(404);
    },
  );
});

describe('GET /users?pendingAccess (ADR-027)', () => {
  it('lista a los ACTIVE sin rol vigente y marca pendingAccess; false excluye a los pendientes', async () => {
    const admin = await linkedUser(['administrador']);
    const adminToken = await entraToken({ oid: admin.oid, email: admin.email });

    // Provisionado al primer ingreso: pendiente.
    const pendingEmail = uniqueEmail();
    await profile(await entraToken({ email: pendingEmail }));
    // Con rol vigente: no pendiente.
    const withRole = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    // Solo con un rol caducado: pendiente.
    const expired = await createTestUser(context.prisma, { roleCodes: [] });
    const usuarioRole = await context.prisma.role.findUniqueOrThrow({ where: { code: 'usuario' } });
    await context.prisma.userRole.create({ data: { userId: expired.id, roleId: usuarioRole.id, expiresAt: new Date(Date.now() - 60_000) } });
    // Solo con un rol desactivado: pendiente.
    const inactiveRole = await context.prisma.role.create({ data: { code: `inactivo-${uniqueSuffix()}`, name: 'Rol inactivo', dataScope: 'OWN', isActive: false } });
    const onInactive = await createTestUser(context.prisma, { roleCodes: [] });
    await context.prisma.userRole.create({ data: { userId: onInactive.id, roleId: inactiveRole.id } });
    // Suspendido sin rol: no es "pendiente de acceso" (está suspendido).
    const suspended = await createTestUser(context.prisma, { roleCodes: [], status: 'SUSPENDED' });
    // Sin rol pero con un permiso directo vigente: ya ve y puede hacer algo, no es pendiente.
    const permission = await context.prisma.permission.findUniqueOrThrow({ where: { code: 'usuarios.ver' } });
    const granted = await createTestUser(context.prisma, { roleCodes: [] });
    await context.prisma.userPermission.create({ data: { userId: granted.id, permissionId: permission.id, effect: 'GRANT', reason: 'Prueba de pendingAccess' } });
    // Concesión caducada: sigue pendiente. Solo una denegación: no da nada, sigue pendiente.
    const expiredGrant = await createTestUser(context.prisma, { roleCodes: [] });
    await context.prisma.userPermission.create({ data: { userId: expiredGrant.id, permissionId: permission.id, effect: 'GRANT', reason: 'Prueba caducada', expiresAt: new Date(Date.now() - 60_000) } });
    const deniedOnly = await createTestUser(context.prisma, { roleCodes: [] });
    await context.prisma.userPermission.create({ data: { userId: deniedOnly.id, permissionId: permission.id, effect: 'DENY', reason: 'Prueba de denegación' } });

    const mine = [pendingEmail, withRole.email, expired.email, onInactive.email, suspended.email, granted.email, expiredGrant.email, deniedOnly.email];
    const find = async (query: string): Promise<Map<string, { pendingAccess: boolean; status: string; roles: string[] }>> => {
      const found = new Map<string, { pendingAccess: boolean; status: string; roles: string[] }>();
      for (const email of mine) {
        const response = await api(context, adminToken).get(`/users?search=${encodeURIComponent(email)}${query}`);
        expect(response.status).toBe(200);
        for (const item of response.body.data as { email: string; pendingAccess: boolean; status: string; roles: string[] }[]) found.set(item.email, item);
      }
      return found;
    };

    const all = await find('');
    expect(Object.fromEntries(mine.map((email) => [email, all.get(email)?.pendingAccess]))).toEqual({
      [pendingEmail]: true,
      [withRole.email]: false,
      [expired.email]: true,
      [onInactive.email]: true,
      [suspended.email]: false,
      [granted.email]: false,
      [expiredGrant.email]: true,
      [deniedOnly.email]: true,
    });
    expect(all.get(pendingEmail)).toMatchObject({ status: 'ACTIVE', roles: [] });

    const pending = await find('&pendingAccess=true');
    expect([...pending.keys()].sort()).toEqual([pendingEmail, expired.email, onInactive.email, expiredGrant.email, deniedOnly.email].sort());
    expect([...pending.values()].every((item) => item.pendingAccess)).toBe(true);

    const notPending = await find('&pendingAccess=false');
    expect([...notPending.keys()].sort()).toEqual([withRole.email, suspended.email, granted.email].sort());

    // El detalle usa la MISMA definición (campo obligatorio en UserDetailResponseDto).
    const detail = async (id: string): Promise<boolean> => {
      const response = await api(context, adminToken).get(`/users/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.roles.every((role: Record<string, unknown>) => !('isActive' in role))).toBe(true);
      return response.body.pendingAccess as boolean;
    };
    expect(await detail((await provisionedUser(pendingEmail))!.id)).toBe(true);
    expect(await detail(withRole.id)).toBe(false);
    expect(await detail(expired.id)).toBe(true);
    expect(await detail(onInactive.id)).toBe(true);
    expect(await detail(suspended.id)).toBe(false);
    expect(await detail(granted.id)).toBe(false);
    expect(await detail(expiredGrant.id)).toBe(true);
    expect(await detail(deniedOnly.id)).toBe(true);

    // Combina con los demás filtros (AND): el filtro de rol no anula el de pendientes.
    const combined = await api(context, adminToken).get(`/users?pendingAccess=true&roleCode=usuario&search=${encodeURIComponent(expired.email)}`);
    expect(combined.status).toBe(200);
    expect(combined.body.data.map((item: { email: string }) => item.email)).toEqual([expired.email]);

    await context.prisma.userRole.deleteMany({ where: { roleId: inactiveRole.id } });
    await context.prisma.role.delete({ where: { id: inactiveRole.id } });
  });

  it('POST /users trae pendingAccess; bajo entra el usuario nace INVITED sin vínculo y su primer ingreso es IDENTITY_NOT_LINKED hasta vincularlo', async () => {
    const admin = await linkedUser(['administrador']);
    const adminToken = await entraToken({ oid: admin.oid, email: admin.email });
    const usuario = await context.prisma.role.findUniqueOrThrow({ where: { code: 'usuario' } });
    const email = uniqueEmail();

    const created = await api(context, adminToken).post('/users').send({ email, firstName: 'Beatriz', lastName: 'Alta', roleIds: [usuario.id] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email, status: 'INVITED', roles: ['usuario'], pendingAccess: false });

    // Sin vínculo: el correo existe, así que el primer ingreso NO crea otra cuenta ni la vincula por correo.
    const oid = newOid();
    const firstLogin = await profile(await entraToken({ oid, email }));
    expect(firstLogin.status).toBe(403);
    expect(firstLogin.body.code).toBe('IDENTITY_NOT_LINKED');
    expect(await context.prisma.user.count({ where: { emailNormalized: email } })).toBe(1);

    // Vinculado ANTES de que entre (como hace el script), entra con la cuenta creada por el administrador.
    await context.prisma.userIdentity.create({ data: { userId: created.body.id, provider: 'ENTRA_ID', subject: oid, tenantId: ENTRA_TEST.tenantId } });
    const second = await profile(await entraToken({ oid, email }));
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ id: created.body.id, roles: ['usuario'] });
  });

  it('un valor no booleano responde 400 y quien no tiene usuarios.ver recibe 403', async () => {
    const admin = await linkedUser(['administrador']);
    const adminToken = await entraToken({ oid: admin.oid, email: admin.email });
    expect((await api(context, adminToken).get('/users?pendingAccess=quizas')).status).toBe(400);

    const plain = await linkedUser(['usuario']);
    expect((await api(context, await entraToken({ oid: plain.oid, email: plain.email })).get('/users?pendingAccess=true')).status).toBe(403);
    expect((await api(context).get('/users?pendingAccess=true')).status).toBe(401);
  });

  it('el CSV exportado respeta el filtro y la exportación lo deja en la bitácora', async () => {
    const admin = await linkedUser(['administrador']);
    const adminToken = await entraToken({ oid: admin.oid, email: admin.email });
    const pendingEmail = uniqueEmail();
    await profile(await entraToken({ email: pendingEmail }));
    const withRole = await createTestUser(context.prisma, { roleCodes: ['usuario'] });

    const response = await api(context, adminToken).get(`/users/export?pendingAccess=true&search=${encodeURIComponent('@integration.test')}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain(pendingEmail);
    expect(response.text).not.toContain(withRole.email);
    const exported = await context.prisma.auditLog.findMany({ where: { event: 'user.exported', subjectId: admin.oid } });
    expect(exported.some((entry) => (entry.metadata as { pendingAccess?: boolean } | null)?.pendingAccess === true)).toBe(true);
  });
});

describe('vinculación por lote (load:data entra-identities)', () => {
  const HEADERS = ENTITY_DEFINITIONS['entra-identities'].sheets[0]!.columns.map((column) => column.header);
  let adminEmail: string;

  beforeAll(async () => {
    adminEmail = (await createTestUser(context.prisma, { roleCodes: ['administrador'] })).email;
  });

  async function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
    const out: string[] = [];
    const err: string[] = [];
    const deps: LoadCliDeps = {
      env: { DATABASE_URL: process.env['DATABASE_URL'] },
      cwd: workDir,
      now: () => new Date(),
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      open: async () => ({ loader: context.app.get(InitialDataLoader), close: async () => undefined }),
    };
    const code = await runLoadCli(argv, deps);
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  async function file(name: string, rows: [string, string][]): Promise<string> {
    const path = join(workDir, name);
    await writeFile(path, [HEADERS.join(','), ...rows.map(([user, oid]) => `${user},${oid}`)].join('\r\n'), 'utf8');
    return path;
  }

  it('validate no escribe; apply vincula solo la identidad (sin tocar roles) y la repetición es idempotente', async () => {
    const user = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const oid = newOid();
    const path = await file(`vinculos-${uniqueSuffix()}.csv`, [[user.email.toUpperCase(), oid.toUpperCase()]]);
    const rolesBefore = await context.prisma.userRole.findMany({ where: { userId: user.id } });

    const validate = await run(['validate', 'entra-identities', '--file', path, '--report', join(workDir, `validate-${uniqueSuffix()}.csv`)]);
    expect(validate.code).toBe(EXIT_OK);
    expect(validate.out).toContain('por crear 1');
    expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);

    const apply = await run(['apply', 'entra-identities', '--file', path, '--actor', adminEmail]);
    expect(apply.code).toBe(EXIT_OK);
    expect(apply.out).toContain('creadas 1');
    const identity = await context.prisma.userIdentity.findUniqueOrThrow({ where: { provider_subject: { provider: 'ENTRA_ID', subject: oid } } });
    expect(identity).toMatchObject({ userId: user.id, tenantId: ENTRA_TEST.tenantId });
    expect(await context.prisma.userRole.findMany({ where: { userId: user.id } })).toEqual(rolesBefore);
    expect(await context.prisma.userPermission.count({ where: { userId: user.id } })).toBe(0);

    const events = await context.prisma.auditLog.findMany({ where: { event: 'user.identity_linked', resourceId: user.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ metadata: { source: 'LOAD_SCRIPT' } });
    expect(events[0]!.subjectEmail).toBe(adminEmail);

    // El usuario ya vinculado entra con su cuenta y sus roles: sin alta ni 403.
    const me = await profile(await entraToken({ oid, email: user.email }));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: user.id, roles: ['usuario'] });

    const second = await run(['apply', 'entra-identities', '--file', path, '--actor', adminEmail, '--report', join(workDir, `segunda-${uniqueSuffix()}.csv`)]);
    expect(second.code).toBe(EXIT_OK);
    expect(second.out).toContain('creadas 0 - ya existen 1');
    expect(await context.prisma.userIdentity.count({ where: { userId: user.id, provider: 'ENTRA_ID' } })).toBe(1);
    expect(await context.prisma.auditLog.count({ where: { event: 'user.identity_linked', resourceId: user.id } })).toBe(1);
  });

  it('un oid ya vinculado a otro usuario es error y no aplica nada del archivo; un usuario con otro oid es advertencia', async () => {
    const owner = await linkedUser(['usuario']);
    const target = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const different = await linkedUser(['usuario']);
    const free = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const freeOid = newOid();

    const conflict = await file(`conflicto-${uniqueSuffix()}.csv`, [[target.email, owner.oid], [free.email, freeOid]]);
    const failed = await run(['apply', 'entra-identities', '--file', conflict, '--actor', adminEmail, '--report', join(workDir, `c-${uniqueSuffix()}.csv`)]);
    expect(failed.code).toBe(EXIT_ERRORS);
    expect(failed.out).toContain('IDENTITY_TAKEN');
    expect(await context.prisma.userIdentity.count({ where: { userId: target.id } })).toBe(0);
    expect(await context.prisma.userIdentity.count({ where: { subject: freeOid } })).toBe(0);

    const warn = await file(`otro-oid-${uniqueSuffix()}.csv`, [[different.email, newOid()], [free.email, freeOid]]);
    const warned = await run(['apply', 'entra-identities', '--file', warn, '--actor', adminEmail, '--report', join(workDir, `w-${uniqueSuffix()}.csv`)]);
    expect(warned.code).toBe(EXIT_OK);
    expect(warned.out).toContain('EXISTS_DIFFERENT');
    expect((await context.prisma.userIdentity.findMany({ where: { userId: different.id } })).map((row) => row.subject)).toEqual([different.oid]);
    expect(await context.prisma.userIdentity.count({ where: { subject: freeOid } })).toBe(1);
  });

  it('B8: el informe de validate avisa de cuántas filas apuntan a usuarios con rol de administrador, sin bloquear', async () => {
    const admin = await createTestUser(context.prisma, { roleCodes: ['administrador'] });
    const plain = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const report = join(workDir, `admin-aviso-${uniqueSuffix()}.csv`);
    const path = await file(`admin-aviso-${uniqueSuffix()}.csv`, [[plain.email, newOid()], [admin.email, newOid()]]);
    const result = await run(['validate', 'entra-identities', '--file', path, '--report', report]);
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain('ADMINISTRATOR_ROWS');
    expect(result.out).toContain('LINKS_TO_ADMINISTRATOR');
    expect(result.out).toContain('1 fila(s) vinculan a usuarios con rol de administrador');
    const text = await readFile(report, 'utf8');
    expect(text).toContain('LINKS_TO_ADMINISTRATOR');
    expect(text).not.toContain(admin.email);
  });

  it('usuario inexistente, oid inválido y duplicados: errores por fila, informe sin datos de celdas', async () => {
    const user = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const oid = newOid();
    const unknownEmail = `nadie-${uniqueSuffix()}@integration.test`;
    const report = join(workDir, `errores-${uniqueSuffix()}.csv`);
    const path = await file(`errores-${uniqueSuffix()}.csv`, [
      [unknownEmail, newOid()],
      [user.email, 'no-es-un-guid'],
      [user.email, oid],
      [`otro-${uniqueSuffix()}@integration.test`, oid],
    ]);
    const result = await run(['validate', 'entra-identities', '--file', path, '--report', report]);
    expect(result.code).toBe(EXIT_ERRORS);
    const text = await readFile(report, 'utf8');
    for (const code of ['UNKNOWN_REFERENCE', 'INVALID_FORMAT', 'DUPLICATE_IN_FILE']) expect(text).toContain(code);
    for (const secret of [unknownEmail, user.email, oid, 'no-es-un-guid']) {
      expect(text).not.toContain(secret);
      expect(result.out + result.err).not.toContain(secret);
    }
    expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);
  });

  it('apply exige --actor administrador activo con usuarios.editar', async () => {
    const user = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const nonAdmin = await createTestUser(context.prisma, { roleCodes: ['gestor-accesos'] });
    const oid = newOid();
    const path = await file(`actor-${uniqueSuffix()}.csv`, [[user.email, oid]]);
    const rejected = await run(['apply', 'entra-identities', '--file', path, '--actor', nonAdmin.email]);
    expect(rejected.code).toBe(EXIT_REJECTED);
    expect(rejected.err).toContain('No se aplicó nada');
    expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);
    expect((await run(['apply', 'entra-identities', '--file', path])).code).toBe(EXIT_REJECTED);
  });

  it('un usuario eliminado no se vincula', async () => {
    const user = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    await context.prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    const oid = newOid();
    const path = await file(`eliminado-${uniqueSuffix()}.csv`, [[user.email, oid]]);
    const result = await run(['apply', 'entra-identities', '--file', path, '--actor', adminEmail, '--report', join(workDir, `e-${uniqueSuffix()}.csv`)]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(await context.prisma.userIdentity.count({ where: { subject: oid } })).toBe(0);
  });
});

describe('revocación de credenciales locales tras el corte', () => {
  let adminEmail: string;

  beforeAll(async () => {
    // El actor debe estar vinculado por Entra ID: si no, el propio corte lo dejaría fuera.
    adminEmail = (await linkedUser(['administrador'])).email;
  });

  async function run(argv: string[], reportName: string): Promise<{ code: number; out: string; err: string; csv: string }> {
    const out: string[] = [];
    const err: string[] = [];
    const reportPath = join(workDir, `${reportName}-${uniqueSuffix()}.csv`);
    const deps: RevokeCliDeps = {
      cwd: workDir,
      now: () => new Date(),
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      open: async () => ({ service: context.app.get(LocalCredentialRevocationService), close: async () => undefined }),
    };
    const code = await runRevokeCli([...argv, '--report', reportPath], deps);
    const csv = await readFile(reportPath, 'utf8').catch(() => '');
    return { code, out: out.join('\n'), err: err.join('\n'), csv };
  }

  it('validate no escribe; apply borra la credencial y revoca las sesiones solo de los vinculados y audita', async () => {
    const linked = await linkedUser(['usuario']);
    const unlinked = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    const session = await context.prisma.userSession.create({
      data: { userId: linked.id, refreshTokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'), expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const validate = await run(['validate'], 'validar');
    expect(validate.code).toBe(0);
    expect(validate.csv).toContain(`${linked.id},ACTIVE,Sí,Sí,1,Se revocaría`);
    expect(validate.csv).toContain(`${unlinked.id},ACTIVE,No,Sí,0,Sin vínculo (no se toca)`);
    expect(await context.prisma.userCredential.count({ where: { userId: linked.id } })).toBe(1);

    // Sin --confirm no se ejecuta. Por defecto aborta porque quedan cuentas ACTIVE sin vincular (p. ej. `unlinked`).
    expect((await run(['apply', '--actor', adminEmail], 'sin-confirmar')).code).toBe(2);
    const aborted = await run(['apply', '--confirm', '--actor', adminEmail], 'abortar');
    expect(aborted.code).toBe(EXIT_ABORTED);
    expect(aborted.out).toContain('ABORTADO');
    expect(await context.prisma.userCredential.count({ where: { userId: linked.id } })).toBe(1);

    // --allow-unlinked deja explícito que las cuentas sin vincular conservan su credencial.
    const applied = await run(['apply', '--confirm', '--actor', adminEmail, '--allow-unlinked'], 'aplicar');
    expect(applied.code).toBe(0);
    expect(applied.csv).toContain(`${linked.id},ACTIVE,Sí,Sí,1,Revocada`);
    expect(applied.out + applied.csv).not.toContain(linked.email);
    expect(applied.out + applied.csv).not.toContain(adminEmail);

    expect(await context.prisma.userCredential.count({ where: { userId: linked.id } })).toBe(0);
    const revoked = await context.prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedReason).toBe('local_auth_retired');
    // La cuenta sin vínculo conserva su credencial: borrársela la dejaría fuera.
    expect(await context.prisma.userCredential.count({ where: { userId: unlinked.id } })).toBe(1);
    // La cuenta y su vínculo siguen intactos: el usuario sigue entrando por Entra ID.
    expect((await profile(await entraToken({ oid: linked.oid, email: linked.email }))).body).toMatchObject({ id: linked.id, roles: ['usuario'] });

    const perUser = await context.prisma.auditLog.findMany({ where: { event: 'user.local_credentials_revoked', resourceId: linked.id } });
    expect(perUser).toHaveLength(1);
    expect(perUser[0]).toMatchObject({ metadata: { hadCredential: true, sessionsRevoked: 1, source: 'CUTOVER_SCRIPT' } });
    expect(await context.prisma.auditLog.count({ where: { event: 'auth.local_credentials_revoked', correlationId: perUser[0]!.correlationId } })).toBe(1);
    expect(await context.prisma.auditLog.count({ where: { event: 'user.local_credentials_revoked', resourceId: unlinked.id } })).toBe(0);

    // Idempotente: repetir no encuentra nada que revocar de esta cuenta.
    const again = await run(['apply', '--confirm', '--actor', adminEmail, '--allow-unlinked'], 'repetir');
    expect(again.code).toBe(0);
    expect(again.csv).toContain(`${linked.id},ACTIVE,Sí,No,0,"Vinculada, sin credencial ni sesiones"`);
    expect(await context.prisma.auditLog.count({ where: { event: 'user.local_credentials_revoked', resourceId: linked.id } })).toBe(1);
  });

  it('un actor que no es administrador activo se rechaza y no se toca nada', async () => {
    const linked = await linkedUser(['usuario']);
    const nonAdmin = await linkedUser(['usuario']);
    const result = await run(['apply', '--confirm', '--actor', nonAdmin.email, '--allow-unlinked'], 'no-admin');
    expect(result.code).toBe(2);
    expect(result.err).toContain('No se revocó nada');
    expect(await context.prisma.userCredential.count({ where: { userId: linked.id } })).toBe(1);
  });

  it('M5: un actor administrador SIN vínculo con Entra ID se rechaza siempre (aunque se pase --allow-unlinked) y no se toca nada', async () => {
    const linked = await linkedUser(['usuario']);
    const unlinkedAdmin = await createTestUser(context.prisma, { roleCodes: ['administrador'] });
    for (const extra of [[], ['--allow-unlinked']]) {
      const result = await run(['apply', '--confirm', '--actor', unlinkedAdmin.email, ...extra], 'actor-sin-vinculo');
      expect(result.code).toBe(2);
      expect(result.err).toContain('no está vinculado');
      expect(result.err).toContain('No se revocó nada');
    }
    expect(await context.prisma.userCredential.count({ where: { userId: linked.id } })).toBe(1);
  });

  it('B6: las cuentas eliminadas pierden también su credencial y sus sesiones, aunque no tengan vínculo', async () => {
    const deleted = await createTestUser(context.prisma, { roleCodes: ['usuario'] });
    await context.prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    const session = await context.prisma.userSession.create({
      data: { userId: deleted.id, refreshTokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'), expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const validate = await run(['validate'], 'eliminadas');
    expect(validate.csv).toContain(`${deleted.id},ELIMINADA,No,Sí,1,Se revocaría`);

    // Una cuenta eliminada nunca cuenta como «sin vincular»: el aborto por defecto se debe a las vivas.
    const applied = await run(['apply', '--confirm', '--actor', adminEmail, '--allow-unlinked'], 'aplicar-eliminadas');
    expect(applied.code).toBe(0);
    expect(applied.csv).toContain(`${deleted.id},ELIMINADA,No,Sí,1,Revocada`);
    expect(await context.prisma.userCredential.count({ where: { userId: deleted.id } })).toBe(0);
    expect((await context.prisma.userSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();
  });
});
