/**
 * Semilla del núcleo de gestión.
 *
 * Idempotente: se puede ejecutar cuantas veces haga falta. Usa `upsert` por
 * clave natural, así que no duplica ni pisa lo que un administrador haya
 * cambiado después (nombres y descripciones sí se actualizan; las asignaciones
 * de los roles de sistema se reponen a propósito).
 *
 * Ejecutar:  pnpm --filter @app/backend run prisma:seed
 *
 * Administrador inicial (PLAN-AUTH-LOCAL, D11): si `SEED_ADMIN_PASSWORD` tiene
 * valor y el administrador aún no tiene credencial, se le asigna con Argon2id y
 * `mustChangePassword = true`. Nunca sobrescribe una credencial existente:
 * volver a sembrar no restablece la contraseña de nadie. Con Entra ID basta con
 * que exista la cuenta.
 */
import { PrismaClient, type Prisma } from '@prisma/client';

import { PasswordService } from '../src/modules/auth/password.service';

import {
  ACTION_LABELS,
  MENU_OPTIONS,
  MODULES,
  PERMISSIONS,
  ROLES,
  SYSTEM_PARAMETERS,
  type ActionKey,
} from './seed/access-catalog';

loadEnvFiles(['.env', '../.env']);

const prisma = new PrismaClient();

/**
 * Carga los `.env` sin pisar lo que ya trae el entorno (CI, despliegue).
 * `process.loadEnvFile` es nativo de Node 22: no añade dependencias.
 */
function loadEnvFiles(paths: string[]): void {
  for (const path of paths) {
    try {
      process.loadEnvFile(path);
    } catch {
      // El archivo no existe: es normal en CI y en despliegue.
    }
  }
}

/** Correo del administrador inicial. Se puede fijar por entorno al desplegar. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_FIRST_NAME = process.env.SEED_ADMIN_FIRST_NAME ?? 'Administrador';
const ADMIN_LAST_NAME = process.env.SEED_ADMIN_LAST_NAME ?? 'del sistema';
/** Contraseña inicial del administrador (D11). Exenta de la política D6/D7 por decisión del responsable. */
const ADMIN_INITIAL_PASSWORD = process.env.SEED_ADMIN_PASSWORD || undefined;

function log(message: string): void {
  process.stdout.write(`  ${message}\n`);
}

async function seedModules(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const module of MODULES) {
    const saved = await prisma.appModule.upsert({
      where: { key: module.key },
      update: {
        name: module.name,
        description: module.description,
        icon: module.icon,
        sortOrder: module.sortOrder,
        isSystem: module.isSystem ?? false,
      },
      create: {
        key: module.key,
        name: module.name,
        description: module.description,
        icon: module.icon,
        sortOrder: module.sortOrder,
        isSystem: module.isSystem ?? false,
      },
    });
    ids.set(module.key, saved.id);
  }

  log(`módulos: ${ids.size}`);
  return ids;
}

async function seedPermissions(moduleIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const entry of PERMISSIONS) {
    for (const action of entry.actions) {
      const code = `${entry.resource}.${action}`;
      const name = `${ACTION_LABELS[action as ActionKey]} ${entry.resourceLabel}`;

      const saved = await prisma.permission.upsert({
        where: { code },
        update: { name, moduleId: moduleIds.get(entry.moduleKey) ?? null, isSystem: true },
        create: {
          code,
          resource: entry.resource,
          action,
          name,
          moduleId: moduleIds.get(entry.moduleKey) ?? null,
          isSystem: true,
        },
      });
      ids.set(code, saved.id);
    }
  }

  log(`permisos: ${ids.size}`);
  return ids;
}

async function seedMenuOptions(
  moduleIds: Map<string, string>,
  permissionIds: Map<string, string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  // Primero los nodos raíz; después los hijos, que necesitan el id del padre.
  const ordered = [...MENU_OPTIONS].sort((a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)));

  for (const option of ordered) {
    const moduleId = moduleIds.get(option.moduleKey);
    if (!moduleId) {
      throw new Error(`La opción "${option.key}" referencia un módulo inexistente: ${option.moduleKey}`);
    }

    const data = {
      moduleId,
      parentId: option.parentKey ? (ids.get(option.parentKey) ?? null) : null,
      label: option.label,
      icon: option.icon,
      path: option.path,
      kind: option.path === null ? ('GROUP' as const) : ('LINK' as const),
      sortOrder: option.sortOrder,
      requiredPermissionId: option.requiredPermission ? (permissionIds.get(option.requiredPermission) ?? null) : null,
      isPublic: option.isPublic ?? false,
      isSystem: true,
    };

    const saved = await prisma.menuOption.upsert({
      where: { key: option.key },
      update: data,
      create: { key: option.key, ...data },
    });
    ids.set(option.key, saved.id);
  }

  log(`opciones de menú: ${ids.size}`);
  return ids;
}

async function seedRoles(permissionIds: Map<string, string>, menuOptionIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, dataScope: role.dataScope, isSystem: true },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        dataScope: role.dataScope,
        isSystem: true,
      },
    });
    ids.set(role.code, saved.id);

    const permissionCodes = role.permissions === '*' ? [...permissionIds.keys()] : role.permissions;
    const optionKeys = role.menuOptions === '*' ? [...menuOptionIds.keys()] : role.menuOptions;

    // Las asignaciones de los roles de sistema se reponen enteras: si alguien
    // le quitó un permiso al administrador, el seed lo devuelve.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: saved.id } }),
      prisma.rolePermission.createMany({
        data: permissionCodes
          .map((code) => permissionIds.get(code))
          .filter((permissionId): permissionId is string => Boolean(permissionId))
          .map((permissionId) => ({ roleId: saved.id, permissionId })),
        skipDuplicates: true,
      }),
      prisma.roleMenuOption.deleteMany({ where: { roleId: saved.id } }),
      prisma.roleMenuOption.createMany({
        data: optionKeys
          .map((key) => menuOptionIds.get(key))
          .filter((menuOptionId): menuOptionId is string => Boolean(menuOptionId))
          .map((menuOptionId) => ({ roleId: saved.id, menuOptionId })),
        skipDuplicates: true,
      }),
    ]);
  }

  log(`roles: ${ids.size}`);
  return ids;
}

async function seedSystemParameters(): Promise<void> {
  for (const parameter of SYSTEM_PARAMETERS) {
    await prisma.systemParameter.upsert({
      where: { key: parameter.key },
      // El valor NO se pisa: puede haber sido ajustado por un administrador.
      update: { name: parameter.name, description: parameter.description, group: parameter.group, isSystem: true },
      create: { ...parameter, isSystem: true },
    });
  }

  log(`parámetros del sistema: ${SYSTEM_PARAMETERS.length}`);
}

async function seedAdminUser(roleIds: Map<string, string>): Promise<void> {
  const administradorRoleId = roleIds.get('administrador');
  if (!administradorRoleId) {
    throw new Error('No existe el rol administrador; la semilla de roles falló.');
  }

  const email = ADMIN_EMAIL.trim();
  const user = await prisma.user.upsert({
    where: { emailNormalized: email.toLowerCase() },
    update: {},
    create: {
      email,
      emailNormalized: email.toLowerCase(),
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      displayName: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
      jobTitle: 'Administrador del sistema',
      // INVITED, no ACTIVE: la cuenta no tiene credencial utilizable todavía.
      status: 'INVITED',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: administradorRoleId } },
    update: {},
    create: { userId: user.id, roleId: administradorRoleId },
  });

  const credential = await seedAdminCredential(user.id);
  log(`usuario administrador: ${user.email} (estado ${user.status}, ${credential})`);
}

/** Devuelve una descripción del resultado para el log. Nunca incluye la contraseña. */
async function seedAdminCredential(userId: string): Promise<string> {
  const existing = await prisma.userCredential.findUnique({ where: { userId }, select: { id: true } });
  if (existing) {
    return 'credencial existente, sin cambios';
  }
  if (process.env.AUTH_PROVIDER === 'entra') {
    return 'sin credencial local: AUTH_PROVIDER=entra';
  }
  if (!ADMIN_INITIAL_PASSWORD) {
    return 'sin credencial: define SEED_ADMIN_PASSWORD para asignarle una';
  }

  await prisma.userCredential.create({
    data: {
      userId,
      passwordHash: await new PasswordService().hash(ADMIN_INITIAL_PASSWORD),
      mustChangePassword: true,
    },
  });
  return 'credencial inicial asignada, cambio obligatorio en el primer acceso';
}

async function main(): Promise<void> {
  process.stdout.write('Sembrando el núcleo de gestión…\n');

  const moduleIds = await seedModules();
  const permissionIds = await seedPermissions(moduleIds);
  const menuOptionIds = await seedMenuOptions(moduleIds, permissionIds);
  const roleIds = await seedRoles(permissionIds, menuOptionIds);
  await seedSystemParameters();
  await seedAdminUser(roleIds);

  const auditEntry: Prisma.AuditLogCreateInput = {
    correlationId: 'seed',
    event: 'system.seed.executed',
    metadata: {
      modules: moduleIds.size,
      permissions: permissionIds.size,
      menuOptions: menuOptionIds.size,
      roles: roleIds.size,
    },
  };
  await prisma.auditLog.create({ data: auditEntry });

  process.stdout.write('Semilla completada.\n');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`La semilla falló: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
