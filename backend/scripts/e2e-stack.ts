/**
 * Stack aislado para los E2E de Playwright del CRM (TESTING.md §«E2E de Clientes»).
 *
 * Trabaja SOLO sobre un esquema propio (`E2E_SCHEMA`, por defecto
 * `integration_e2e`) dentro de la base de `DATABASE_URL`: nunca toca `public`
 * (desarrollo) ni `integration_test` (pruebas de integración del backend).
 *
 * Desde `backend/`:
 *   pnpm exec ts-node --transpile-only scripts/e2e-stack.ts prepare
 *     Borra y recrea el esquema, aplica migraciones, la semilla esencial,
 *     activa `sistema.permite_datos_demo` y siembra la demo.
 *     Exige SEED_DEMO_PASSWORD (12+) y ATTACHMENTS_STORAGE_PATH (carpeta temporal).
 *
 *   pnpm exec ts-node --transpile-only scripts/e2e-stack.ts activate
 *     Con el backend ya levantado en E2E_API_URL (p. ej. http://localhost:3100),
 *     cambia la contraseña inicial del asesor y del manager demo y escoge los
 *     clientes de los recorridos. Exige SEED_DEMO_PASSWORD, E2E_ASESOR_PASSWORD y
 *     E2E_MANAGER_PASSWORD. Busca además los datos demo de los recorridos de
 *     Actividad comercial y, con E2E_RESTRICTED_PASSWORD (12+), crea los dos
 *     usuarios con permisos recortados de PF-04.60. Imprime las variables E2E_*
 *     (sin contraseñas).
 *
 *   pnpm exec ts-node --transpile-only scripts/e2e-stack.ts drop
 *     Borra el esquema.
 *
 * Ninguna contraseña se escribe en archivos: todas llegan por el entorno.
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

import { type DataScope, PrismaClient } from '@prisma/client';

import { PasswordService } from '../src/modules/auth/password.service';

const BACKEND_DIR = resolve(__dirname, '..');
const SCHEMA = process.env.E2E_SCHEMA ?? 'integration_e2e';
const DEMO_PARAMETER_KEY = 'sistema.permite_datos_demo';
const DEFAULT_ASESOR_EMAIL = 'asesor1.gt@demo.invalid';
const DEFAULT_MANAGER_EMAIL = 'manager.gt@demo.invalid';
const MIN_PASSWORD_LENGTH = 12;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

/**
 * Usuarios con permisos recortados para el recorrido negativo de Actividad
 * comercial (04 §J, PF-04.60). Dominio `.invalid`, como la demo; solo existen
 * en el esquema del E2E. Rol propio (no de sistema) y sin cambio de contraseña
 * pendiente: la contraseña llega por E2E_RESTRICTED_PASSWORD.
 */
interface RestrictedProfile {
  /** Variable que `activate` imprime con el correo. */
  envKey: string;
  email: string;
  firstName: string;
  role: { code: string; name: string; dataScope: DataScope; permissions: string[]; menuOptions: string[] };
}

const RESTRICTED_PROFILES: RestrictedProfile[] = [
  {
    // Ve todas las visitas, pero sin `visitas.cerrar` (ni ningún otro permiso del módulo).
    envKey: 'E2E_VISIT_VIEWER_EMAIL',
    email: 'lector.visitas@e2e.invalid',
    firstName: 'Lector de visitas',
    role: {
      code: 'e2e-visitas-lectura',
      name: 'E2E · Visitas solo lectura',
      dataScope: 'ORGANIZATION',
      permissions: ['visitas.ver'],
      menuOptions: ['actividad-visitas'],
    },
  },
  {
    // Sin ninguna opción del módulo de Actividad comercial.
    envKey: 'E2E_NO_ACTIVITY_EMAIL',
    email: 'sin.actividad@e2e.invalid',
    firstName: 'Sin actividad comercial',
    role: {
      code: 'e2e-sin-actividad',
      name: 'E2E · Sin Actividad comercial',
      dataScope: 'OWN',
      permissions: ['clientes.ver'],
      menuOptions: ['clientes-buscar'],
    },
  },
];

// El nombre se interpola en DROP SCHEMA: solo un esquema de pruebas, nunca el de desarrollo.
if (!/^integration_[a-z0-9_]+$/.test(SCHEMA) || SCHEMA === 'integration_test') {
  throw new Error('E2E_SCHEMA debe empezar por integration_, contener solo [a-z0-9_] y no ser integration_test.');
}

function schemaDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    for (const file of ['.env', '../.env']) {
      try {
        process.loadEnvFile(resolve(BACKEND_DIR, file));
      } catch {
        // Sin archivo: la variable llega por el entorno.
      }
    }
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL no está definida.');
  }
  const url = new URL(base);
  url.searchParams.set('schema', SCHEMA);
  return url.toString();
}

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`Falta ${name}${minLength > 1 ? ` (${minLength}+ caracteres)` : ''}.`);
  }
  return value;
}

async function withPrisma<T>(work: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasourceUrl: schemaDatabaseUrl() });
  try {
    return await work(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function dropSchema(): Promise<void> {
  await withPrisma((prisma) => prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`));
  console.log(`Esquema ${SCHEMA} borrado.`);
}

async function prepare(): Promise<void> {
  requireEnv('SEED_DEMO_PASSWORD', MIN_PASSWORD_LENGTH);
  const storage = resolve(requireEnv('ATTACHMENTS_STORAGE_PATH'));
  if (storage.startsWith(resolve(BACKEND_DIR, 'storage'))) {
    throw new Error('ATTACHMENTS_STORAGE_PATH debe ser una carpeta temporal, no backend/storage.');
  }

  await withPrisma(async (prisma) => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
  });

  const env = { ...process.env, NODE_ENV: 'development', AUTH_PROVIDER: 'local', DATABASE_URL: schemaDatabaseUrl() };
  const run = (command: string, extra: NodeJS.ProcessEnv = {}): void => {
    execSync(command, { cwd: BACKEND_DIR, env: { ...env, ...extra }, stdio: 'inherit' });
  };

  run('pnpm exec prisma migrate deploy');
  run('pnpm exec ts-node --transpile-only prisma/seed.ts');
  await withPrisma((prisma) =>
    prisma.systemParameter.update({ where: { key: DEMO_PARAMETER_KEY }, data: { value: 'true' } }),
  );
  run('pnpm exec ts-node --transpile-only prisma/seed-demo.ts', { SEED_DEMO: 'true', ATTACHMENTS_STORAGE_PATH: storage });
  console.log(`Esquema ${SCHEMA} preparado con la semilla esencial y la demo.`);
}

interface Session {
  accessToken: string;
}

async function api(baseUrl: string, path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return fetch(`${baseUrl}/api/v1${path}`, { ...init, headers });
}

async function login(baseUrl: string, email: string, password: string): Promise<Session | null> {
  const response = await api(baseUrl, '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return response.status === HTTP_OK ? ((await response.json()) as Session) : null;
}

/** Deja la contraseña final; si ya estaba cambiada (re-ejecución), solo comprueba que entra. */
async function activateUser(baseUrl: string, email: string, initial: string, final: string): Promise<string> {
  const current = await login(baseUrl, email, final);
  if (current) {
    return current.accessToken;
  }
  const session = await login(baseUrl, email, initial);
  if (!session) {
    throw new Error(`No se pudo iniciar sesión como ${email} con SEED_DEMO_PASSWORD.`);
  }
  const changed = await api(
    baseUrl,
    '/auth/password/change',
    { method: 'POST', body: JSON.stringify({ currentPassword: initial, newPassword: final }) },
    session.accessToken,
  );
  if (changed.status !== HTTP_OK) {
    throw new Error(`El cambio de contraseña de ${email} respondió ${changed.status}.`);
  }
  return ((await changed.json()) as Session).accessToken;
}

async function activate(): Promise<void> {
  const baseUrl = requireEnv('E2E_API_URL').replace(/\/$/, '');
  const initial = requireEnv('SEED_DEMO_PASSWORD');
  const asesorEmail = process.env.E2E_ASESOR_EMAIL ?? DEFAULT_ASESOR_EMAIL;
  const managerEmail = process.env.E2E_MANAGER_EMAIL ?? DEFAULT_MANAGER_EMAIL;
  const asesorToken = await activateUser(baseUrl, asesorEmail, initial, requireEnv('E2E_ASESOR_PASSWORD', MIN_PASSWORD_LENGTH));
  const managerToken = await activateUser(baseUrl, managerEmail, initial, requireEnv('E2E_MANAGER_PASSWORD', MIN_PASSWORD_LENGTH));

  // Clientes demo con proyectos (candidatos a «dependiente») y el resto (candidatos a «ajeno»).
  const customers = await withPrisma((prisma) =>
    prisma.customer.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true, _count: { select: { projects: true } } },
      orderBy: { crmCode: 'asc' },
    }),
  );

  const status = async (id: string, token: string): Promise<number> => (await api(baseUrl, `/customers/${id}`, {}, token)).status;

  let dependent: string | undefined;
  for (const customer of customers.filter((item) => item._count.projects > 0)) {
    if ((await status(customer.id, managerToken)) === HTTP_OK) {
      dependent = customer.legalName;
      break;
    }
  }
  let foreign: string | undefined;
  for (const customer of customers) {
    if ((await status(customer.id, asesorToken)) === HTTP_NOT_FOUND) {
      foreign = customer.id;
      break;
    }
  }
  if (!dependent || !foreign) {
    throw new Error('No se encontraron en la demo un cliente con proyectos visible al manager y uno ajeno al asesor.');
  }

  const activityFixtures = await commercialActivityFixtures(asesorEmail);
  const restrictedPassword = process.env.E2E_RESTRICTED_PASSWORD;
  if (restrictedPassword) {
    await createRestrictedUsers(requireEnv('E2E_RESTRICTED_PASSWORD', MIN_PASSWORD_LENGTH));
  }

  console.log(`E2E_ASESOR_EMAIL=${asesorEmail}`);
  console.log(`E2E_MANAGER_EMAIL=${managerEmail}`);
  console.log(`E2E_MANAGER_DEPENDENT_CUSTOMER=${dependent}`);
  console.log(`E2E_FOREIGN_CUSTOMER_ID=${foreign}`);
  for (const [key, value] of Object.entries(activityFixtures)) {
    console.log(`${key}=${value}`);
  }
  if (restrictedPassword) {
    for (const profile of RESTRICTED_PROFILES) {
      console.log(`${profile.envKey}=${profile.email}`);
    }
  } else {
    console.log('# Sin E2E_RESTRICTED_PASSWORD no se crean los usuarios de PF-04.60.');
  }
}

/**
 * Datos demo de los recorridos de Actividad comercial (04 §J, PF-04.58–61): un
 * proyecto del asesor con su cliente activo (también cliente de las visitas y
 * actividades del recorrido), el tipo "Llamada" y una visita `REALIZADA`.
 */
async function commercialActivityFixtures(asesorEmail: string): Promise<Record<string, string>> {
  return withPrisma(async (prisma) => {
    const project = await prisma.project.findFirst({
      where: {
        deletedAt: null,
        owner: { emailNormalized: asesorEmail.toLowerCase() },
        customer: { deletedAt: null, status: { code: 'ACTIVO' }, salesOwner: { emailNormalized: asesorEmail.toLowerCase() } },
      },
      select: { id: true, code: true, name: true, customer: { select: { id: true, legalName: true } } },
      orderBy: { code: 'asc' },
    });
    const callType = await prisma.catalogItem.findFirst({
      where: { catalog: { key: 'crm.tipo_actividad' }, code: 'LLAMADA', isActive: true },
      select: { id: true },
    });
    const doneVisit = await prisma.visit.findFirst({ where: { status: { code: 'REALIZADA' } }, select: { id: true }, orderBy: { code: 'asc' } });
    if (!project || !callType || !doneVisit) {
      throw new Error('La demo no tiene un proyecto activo del asesor, el tipo LLAMADA o una visita REALIZADA.');
    }
    return {
      E2E_PROJECT_ID: project.id,
      E2E_PROJECT_CODE: project.code,
      E2E_PROJECT_NAME: project.name,
      E2E_PROJECT_CUSTOMER_ID: project.customer.id,
      E2E_PROJECT_CUSTOMER_NAME: project.customer.legalName,
      E2E_CALL_TYPE_ID: callType.id,
      E2E_DONE_VISIT_ID: doneVisit.id,
    };
  });
}

/** Crea o repone los roles y usuarios de RESTRICTED_PROFILES (repetible). */
async function createRestrictedUsers(password: string): Promise<void> {
  const passwordHash = await new PasswordService().hash(password);
  await withPrisma((prisma) =>
    prisma.$transaction(async (tx) => {
      for (const profile of RESTRICTED_PROFILES) {
        const spec = profile.role;
        const permissions = await tx.permission.findMany({ where: { code: { in: spec.permissions } }, select: { id: true } });
        const options = await tx.menuOption.findMany({ where: { key: { in: spec.menuOptions }, deletedAt: null }, select: { id: true } });
        if (permissions.length !== spec.permissions.length || options.length !== spec.menuOptions.length) {
          throw new Error(`Faltan permisos u opciones de menú para el rol ${spec.code}.`);
        }
        const role = await tx.role.upsert({
          where: { code: spec.code },
          update: { name: spec.name, dataScope: spec.dataScope, isActive: true, deletedAt: null },
          create: { code: spec.code, name: spec.name, dataScope: spec.dataScope },
          select: { id: true },
        });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
        await tx.roleMenuOption.deleteMany({ where: { roleId: role.id } });
        await tx.roleMenuOption.createMany({ data: options.map((option) => ({ roleId: role.id, menuOptionId: option.id })) });

        const emailNormalized = profile.email.toLowerCase();
        const names = { firstName: profile.firstName, lastName: 'E2E', displayName: `${profile.firstName} E2E` };
        const user = await tx.user.upsert({
          where: { emailNormalized },
          update: { ...names, status: 'ACTIVE', deletedAt: null },
          create: { ...names, email: profile.email, emailNormalized, status: 'ACTIVE' },
          select: { id: true },
        });
        const credential = { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null };
        await tx.userCredential.upsert({ where: { userId: user.id }, update: credential, create: { userId: user.id, ...credential } });
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }
    }),
  );
}

const commands: Record<string, () => Promise<void>> = { prepare, activate, drop: dropSchema };
const command = commands[process.argv[2] ?? ''];
if (!command) {
  console.error('Uso: e2e-stack.ts prepare | activate | drop');
  process.exit(1);
}
command().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
