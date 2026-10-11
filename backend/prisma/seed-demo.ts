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
 * Contraseña de los usuarios demo: `SEED_DEMO_PASSWORD` (o, si falta,
 * `AUTH_DEFAULT_PASSWORD`), con cambio obligatorio en el primer acceso. Sin
 * ninguna, las cuentas quedan INVITED sin credencial. Nunca se pisa una
 * credencial existente. Con AUTH_PROVIDER=entra no se crean credenciales locales.
 */
import { PrismaClient } from '@prisma/client';

import { PasswordService } from '../src/modules/auth/password.service';

import { DEMO_USERS } from './seed/demo/demo-data';
import { DEMO_PARAMETER_KEY, evaluateDemoGuards } from './seed/demo/demo-guard';
import { purgeDemoCommercialData, purgeDemoMasters, seedDemo } from './seed/demo/demo-seeder';

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
  const password = process.env.SEED_DEMO_PASSWORD || process.env.AUTH_DEFAULT_PASSWORD || undefined;
  if (!password || process.env.AUTH_PROVIDER === 'entra') {
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
    await prisma.$transaction(async (tx) => {
      await purgeDemoCommercialData(tx);
      await purgeDemoMasters(tx);
    }, TRANSACTION_OPTIONS);
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
