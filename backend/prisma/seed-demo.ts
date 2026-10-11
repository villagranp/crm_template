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
 * Adjuntos demo (00 §8.3, ADR-021): 3 archivos ficticios generados por el script
 * (2 PDF y 1 PNG, < 10 KiB, con firma real) en clientes demo. Los binarios se
 * escriben con el adaptador real `LocalFileSystemStorage` en
 * `ATTACHMENTS_STORAGE_PATH` (por defecto `./storage/attachments`, relativo al
 * directorio de trabajo del backend) ANTES de la transacción; si la transacción
 * falla, se borran (compensación). Re-sembrar y `--purge` borran en la
 * transacción las filas `attachments` + `stored_files` de los clientes demo, y
 * sus binarios solo DESPUÉS del commit (un binario que ya no existe no es
 * error). Nunca se toca un archivo que no cuelgue de un cliente `DEMO-`.
 */
// Primero: alias `@/*` del código de `src/` que reutiliza la semilla.
import './seed/register-path-aliases';

import { PrismaClient } from '@prisma/client';

import type { FileStorage } from '../src/infrastructure/storage/file-storage.port';
import { PasswordService } from '../src/modules/auth/password.service';

import { deleteStoredBinaries, openDemoStorage, writeDemoAttachmentFiles } from './seed/demo/demo-attachments';
import { DEMO_USERS } from './seed/demo/demo-data';
import { DEMO_PARAMETER_KEY, evaluateDemoGuards, resolveDemoPassword } from './seed/demo/demo-guard';
import { type DemoSeedResult, DemoPurgeBlockedError, purgeDemoCommercialData, purgeDemoMasters, seedDemo } from './seed/demo/demo-seeder';

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

/** Borra tras el commit los binarios de filas ya eliminadas; si alguno falla, avisa (sin rutas ni nombres). */
async function removeBinariesAfterCommit(storage: FileStorage, storageKeys: string[]): Promise<void> {
  const failed = await deleteStoredBinaries(storage, storageKeys);
  if (failed > 0) {
    process.stderr.write(`Aviso: ${failed} binario(s) de adjuntos demo purgados no se pudieron borrar de ATTACHMENTS_STORAGE_PATH; quedan huérfanos.\n`);
  }
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

  const storage = await openDemoStorage();

  if (process.argv.includes('--purge')) {
    let purgedStorageKeys: string[];
    try {
      purgedStorageKeys = await prisma.$transaction(async (tx) => {
        const keys = await purgeDemoCommercialData(tx);
        await purgeDemoMasters(tx);
        return keys;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (!(error instanceof DemoPurgeBlockedError)) throw error;
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    await removeBinariesAfterCommit(storage, purgedStorageKeys);
    process.stdout.write('Datos de demostración purgados.\n');
    return;
  }

  process.stdout.write('Sembrando datos de demostración…\n');
  const passwordHashes = await hashPasswords();
  // Binarios primero, fuera de la transacción; si la transacción falla, se borran (compensación).
  const attachments = await writeDemoAttachmentFiles(storage);
  let result: DemoSeedResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const seeded = await seedDemo(tx, { passwordHashes, attachments });
      await tx.auditLog.create({ data: { correlationId: 'seed-demo', event: 'system.seed.demo_executed', metadata: seeded.summary } });
      return seeded;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    await deleteStoredBinaries(storage, attachments.map((entry) => entry.storageKey));
    throw error;
  }
  await removeBinariesAfterCommit(storage, result.purgedStorageKeys);
  const { summary } = result;

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
