import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { INTEGRATION_SCHEMA, integrationDatabaseUrl } from './support/integration-database';
import { INTEGRATION_ENV } from './support/integration-env';

/**
 * Deja el esquema de integración recién creado, migrado y sembrado antes de
 * cada ejecución. Solo borra `integration_test`: nunca el esquema de la URL
 * original.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = integrationDatabaseUrl();
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${INTEGRATION_SCHEMA}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${INTEGRATION_SCHEMA}"`);
  } finally {
    await prisma.$disconnect();
  }

  const env = { ...process.env, ...INTEGRATION_ENV, DATABASE_URL: databaseUrl };
  const cwd = resolve(__dirname, '..');
  execSync('pnpm exec prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('pnpm exec ts-node --transpile-only prisma/seed.ts', { cwd, env, stdio: 'pipe' });
}
