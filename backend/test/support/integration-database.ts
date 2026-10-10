import { resolve } from 'node:path';

/**
 * Las pruebas de integración usan un esquema propio, `integration_test`, dentro
 * de la base configurada. Así nunca tocan los datos de desarrollo y no hace
 * falta un usuario con permiso para crear bases: basta con ser dueño de la base.
 */
// Sobrescribible para ejecutar varias suites a la vez sin que una borre el
// esquema de otra. Solo letras minúsculas, dígitos y guion bajo: el nombre se
// interpola en DROP SCHEMA.
export const INTEGRATION_SCHEMA = process.env.INTEGRATION_SCHEMA ?? 'integration_test';
if (!/^integration_[a-z0-9_]+$/.test(INTEGRATION_SCHEMA)) {
  throw new Error('INTEGRATION_SCHEMA debe empezar por integration_ y contener solo [a-z0-9_].');
}

export function integrationDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    for (const file of ['.env', '../.env']) {
      try {
        process.loadEnvFile(resolve(__dirname, '../..', file));
      } catch {
        // Sin archivo: en CI la variable llega por el entorno.
      }
    }
  }

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL no está definida: las pruebas de integración necesitan PostgreSQL.');
  }

  const url = new URL(base);
  url.searchParams.set('schema', INTEGRATION_SCHEMA);
  return url.toString();
}
