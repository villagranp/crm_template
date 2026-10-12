/**
 * Semilla de DEMOSTRACIÓN del CRM (00 §8.1, §8.3). Datos ficticios para
 * desarrollo y QA. NUNCA en producción.
 *
 * Ejecutar (después de la semilla esencial):
 *   SEED_DEMO=true pnpm --filter @app/backend run prisma:seed:demo
 *   SEED_DEMO=true pnpm --filter @app/backend run prisma:seed:demo -- --purge   # borra solo lo marcado DEMO
 *
 * Guardia (todas deben cumplirse; si una falla, sale con código 1 sin escribir):
 *   1. NODE_ENV distinto de `production`.
 *   2. SEED_DEMO=true en el entorno.
 *   3. Parámetro `sistema.permite_datos_demo` = true en la base (la semilla
 *      esencial lo crea con false; se activa a mano en Administración → Parámetros).
 *   4. Este script no se referencia desde `package.json#prisma.seed`, pipelines ni Dockerfile.
 *
 * Contraseña de los usuarios demo: SOLO `SEED_DEMO_PASSWORD` (sin caída a
 * `AUTH_DEFAULT_PASSWORD`), con cambio obligatorio en el primer acceso. Sin ella,
 * las cuentas quedan INVITED sin credencial. Nunca se pisa una credencial
 * existente. Con AUTH_PROVIDER=entra no se crean credenciales locales.
 *
 * Parámetro `crm.importaciones.habilitada` (06 D-06.9): la siembra lo pone en
 * `true` solo si tenía otro valor, y deja en la bitácora un `parameter.updated`
 * sin actor (`subjectId` nulo, `correlationId = seed-demo`) con
 * `metadata.source = demo-seed`. `--purge` NO lo revierte: si hace falta, se
 * vuelve a `false` en Administración → Parámetros.
 *
 * `--purge` borra solo lo marcado demo. Antes de borrar los usuarios
 * `@demo.invalid` comprueba que ningún registro ajeno a la demo los referencie
 * por una FK `Restrict` (p. ej. un cliente real asignado a un asesor demo). Si
 * hay alguno, se niega con código 1, lista las tablas y columnas con su conteo
 * (sin datos personales) y revierte la transacción: no se purga nada. Hay que
 * reasignar o eliminar esos registros y repetir.
 *
 * Adjuntos demo (00 §8.3): APLAZADOS. Se sembrarán cuando existan el adaptador
 * `FileStorage` y `ATTACHMENTS_STORAGE_PATH` (Módulo 2, ADR-021); hoy no hay
 * dónde guardar el archivo.
 */
import { PrismaClient } from '@prisma/client';

import { PasswordService } from '../src/modules/auth/password.service';

import { DEMO_USERS } from './seed/demo/demo-data';
import { DEMO_PARAMETER_KEY, evaluateDemoGuards, resolveDemoPassword } from './seed/demo/demo-guard';
import { DemoPurgeBlockedError, purgeDemoCommercialData, purgeDemoMasters, seedDemo } from './seed/demo/demo-seeder';

for (const path of ['.env', '../.env']) {
  try {
    process.loadEnvFile(path);
  } catch {
    // Sin archivo: normal en CI.
  }
}

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 180_000 } as const;

async function hashPasswords(): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  const password = resolveDemoPassword(process.env);
  if (!password) {
    return hashes;
  }
  const service = new PasswordService();
  for (const user of DEMO_USERS) {
    hashes.set(user.email.toLowerCase(), await service.hash(password));
  }
  return hashes;
}

async function main(prisma: PrismaClient): Promise<void> {
  const parameter = await prisma.systemParameter.findUnique({ where: { key: DEMO_PARAMETER_KEY }, select: { value: true } });
  const failures = evaluateDemoGuards({
    nodeEnv: process.env.NODE_ENV,
    seedDemo: process.env.SEED_DEMO,
    parameterValue: parameter?.value ?? null,
  });
  if (failures.length > 0) {
    process.stderr.write(`Semilla de demostración RECHAZADA; no se escribió nada:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--purge')) {
    try {
      await prisma.$transaction(async (tx) => {
        await purgeDemoCommercialData(tx);
        await purgeDemoMasters(tx);
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (!(error instanceof DemoPurgeBlockedError)) throw error;
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write('Datos de demostración purgados.\n');
    return;
  }

  process.stdout.write('Sembrando datos de demostración…\n');
  const passwordHashes = await hashPasswords();
  const summary = await prisma.$transaction(async (tx) => {
    const result = await seedDemo(tx, { passwordHashes });
    await tx.auditLog.create({ data: { correlationId: 'seed-demo', event: 'system.seed.demo_executed', metadata: result } });
    return result;
  }, TRANSACTION_OPTIONS);

  for (const [key, value] of Object.entries(summary).sort(([a], [b]) => a.localeCompare(b))) {
    process.stdout.write(`  ${key}: ${value}\n`);
  }
  process.stdout.write(
    `Semilla de demostración completada. Usuarios: ${passwordHashes.size > 0 ? 'con contraseña inicial (cambio obligatorio)' : 'INVITED sin credencial (define SEED_DEMO_PASSWORD)'}.\n`,
  );
}

const prisma = new PrismaClient();
main(prisma)
  .catch((error: unknown) => {
    process.stderr.write(`La semilla de demostración falló: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
