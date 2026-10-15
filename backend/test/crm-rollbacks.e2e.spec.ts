import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { INTEGRATION_SCHEMA, integrationDatabaseUrl } from './support/integration-database';
import { INTEGRATION_ENV } from './support/integration-env';

/**
 * Rollback de las migraciones del CRM (las 8 de la Fase 0 y las posteriores, como
 * `20261014100000_audit_logs_append_only` de ADR-025) con el procedimiento
 * documentado en `docs/database/data-model.md` §10.3 y en la cabecera de cada
 * `prisma/rollbacks/*.down.sql`:
 *
 * 1. `prisma db execute --file <migración>.down.sql` en orden INVERSO;
 * 2. borrar la fila de cada migración revertida en `_prisma_migrations`
 *    (`prisma migrate resolve --rolled-back` solo acepta migraciones FALLIDAS:
 *    con una aplicada responde P3012).
 *
 * Esquema propio (`<esquema>_rb`): las demás suites corren en paralelo sobre el
 * esquema de integración. Al final, `migrate deploy` vuelve a aplicarlas, lo que
 * demuestra que el rollback deja el historial coherente.
 */
jest.setTimeout(240_000);

const SCHEMA = `${INTEGRATION_SCHEMA}_rb`;
const cwd = resolve(__dirname, '..');
const ROLLBACKS_DIR = resolve(cwd, 'prisma/rollbacks');
const PRISMA_BIN = require.resolve('prisma/build/index.js');

function schemaUrl(): string {
  const url = new URL(integrationDatabaseUrl());
  url.searchParams.set('schema', SCHEMA);
  return url.toString();
}

const DATABASE_URL = schemaUrl();
const env = { ...process.env, ...INTEGRATION_ENV, DATABASE_URL };
const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });

/** Node + el bin de Prisma directamente: sin shell, igual en Windows y Linux. */
function prismaCli(args: string[]): void {
  execFileSync(process.execPath, [PRISMA_BIN, ...args], { cwd, env, stdio: 'pipe' });
}

const CRM_TABLES = [
  'currencies', 'exchange_rates', 'countries', 'units_of_measure', 'product_families', 'products', 'unit_conversion_rules',
  'customers', 'contacts', 'projects', 'project_phase_history', 'opportunities', 'opportunity_stage_history',
  'opportunity_results', 'opportunity_result_history', 'project_products', 'forecast_lines', 'visits', 'visit_events',
  'activities', 'interaction_participants', 'attachments', 'customer_imports', 'customer_import_rows', 'sales_targets',
];

async function tablesPresent(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = ${SCHEMA} AND table_name = ANY(${CRM_TABLES}) ORDER BY 1`;
  return rows.map((row) => row.name);
}

async function viewExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pg_views WHERE schemaname = ${SCHEMA} AND viewname = 'crm_interactions_v'`;
  return (rows[0]?.n ?? 0) > 0;
}

async function dataScopeLabels(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ${SCHEMA} AND t.typname = 'data_scope' ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

/** Disparadores de inmutabilidad de `audit_logs` (ADR-025) y su función. */
async function auditTriggers(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT t.tgname AS name FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${SCHEMA} AND c.relname = 'audit_logs' AND NOT t.tgisinternal ORDER BY 1`;
  return rows.map((row) => row.name);
}

async function appendOnlyFunctionExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ${SCHEMA} AND p.proname = 'audit_logs_append_only'`;
  return (rows[0]?.n ?? 0) > 0;
}

const AUDIT_TRIGGERS = ['trg_audit_logs_delete_after_retention', 'trg_audit_logs_no_truncate', 'trg_audit_logs_no_update'];

async function userColumns(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT column_name AS name FROM information_schema.columns
    WHERE table_schema = ${SCHEMA} AND table_name = 'users' AND column_name IN ('employee_code', 'country_id') ORDER BY 1`;
  return rows.map((row) => row.name);
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
  prismaCli(['migrate', 'deploy']);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await prisma.$disconnect();
});

/** Primera migración del CRM: desde ella, toda migración tiene su `.down.sql`. */
const FIRST_CRM_MIGRATION = '20261010100000';

describe('rollback de las migraciones del CRM', () => {
  const downScripts = readdirSync(ROLLBACKS_DIR)
    .filter((file) => file.endsWith('.down.sql'))
    .sort()
    .reverse();

  it('hay un script inverso por cada migración del CRM', () => {
    const migrations = readdirSync(resolve(cwd, 'prisma/migrations'))
      .filter((name) => /^\d{14}_/.test(name) && name >= FIRST_CRM_MIGRATION)
      .sort();
    // Las 8 de la Fase 0 siguen ahí; las posteriores (ADR-025…) también tienen su script.
    expect(migrations.filter((name) => /^20261010\d+_crm_/.test(name))).toHaveLength(8);
    expect(migrations).toContain('20261014100000_audit_logs_append_only');
    expect([...downScripts].reverse()).toEqual(migrations.map((name) => `${name}.down.sql`));
  });

  it('aplicar los .down.sql en orden inverso y retirar sus filas de _prisma_migrations deja el esquema previo al CRM', async () => {
    expect(await tablesPresent()).toHaveLength(CRM_TABLES.length);
    expect(await auditTriggers()).toEqual(AUDIT_TRIGGERS);
    expect(await appendOnlyFunctionExists()).toBe(true);

    for (const script of downScripts) {
      prismaCli(['db', 'execute', '--url', DATABASE_URL, '--file', resolve(ROLLBACKS_DIR, script)]);
      const migration = script.replace(/\.down\.sql$/, '');
      await prisma.$executeRaw`DELETE FROM "_prisma_migrations" WHERE migration_name = ${migration}`;
    }

    expect(await tablesPresent()).toEqual([]);
    expect(await viewExists()).toBe(false);
    const labels = await dataScopeLabels();
    expect(labels).toContain('TERRITORY');
    expect(labels).not.toContain('COUNTRY');
    expect(await userColumns()).toEqual([]);
    expect(await auditTriggers()).toEqual([]);
    expect(await appendOnlyFunctionExists()).toBe(false);

    // Historial coherente: todas se vuelven a aplicar sin intervención.
    prismaCli(['migrate', 'deploy']);
    expect(await tablesPresent()).toHaveLength(CRM_TABLES.length);
    expect(await viewExists()).toBe(true);
    expect(await dataScopeLabels()).toContain('COUNTRY');
    expect(await userColumns()).toEqual(['country_id', 'employee_code']);
    expect(await auditTriggers()).toEqual(AUDIT_TRIGGERS);
    expect(await appendOnlyFunctionExists()).toBe(true);
  });
});
