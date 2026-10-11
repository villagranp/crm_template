import { execSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { CRM_PERMISSIONS } from '../prisma/seed/crm-access';
import { evaluateDemoGuards } from '../prisma/seed/demo/demo-guard';

import { INTEGRATION_SCHEMA, integrationDatabaseUrl } from './support/integration-database';
import { INTEGRATION_ENV } from './support/integration-env';

/**
 * Semillas esencial y de demostración (00 §8). Corren como procesos hijos, igual
 * que en un despliegue, contra un esquema PROPIO (`<esquema>_seeds`): volver a
 * sembrar repone las asignaciones de los roles de sistema y la demo crea
 * usuarios, así que no deben compartir esquema con las demás suites, que se
 * ejecutan en paralelo.
 */
jest.setTimeout(300_000);

const SCHEMA = `${INTEGRATION_SCHEMA}_seeds`;
const cwd = resolve(__dirname, '..');

function schemaUrl(): string {
  const url = new URL(integrationDatabaseUrl());
  url.searchParams.set('schema', SCHEMA);
  return url.toString();
}

const DATABASE_URL = schemaUrl();
const TS_NODE_BIN = require.resolve('ts-node/dist/bin.js');
const baseEnv = { ...process.env, ...INTEGRATION_ENV, DATABASE_URL, SEED_DEMO: '', SEED_DEMO_PASSWORD: '' };

function run(script: string, env: Record<string, string> = {}, args: string[] = []): { status: number | null; output: string } {
  // Node + el bin de ts-node directamente: sin shell, igual en Windows y Linux.
  const result = spawnSync(process.execPath, [TS_NODE_BIN, '--transpile-only', script, ...args], {
    cwd,
    env: { ...baseEnv, ...env },
    encoding: 'utf-8',
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });

/** Conteos de todo lo que siembran las dos semillas. */
async function counts(): Promise<Record<string, number>> {
  const [
    modules, permissions, roles, rolePermissions, roleMenuOptions, menuOptions, parameters, catalogs, catalogItems, currencies, countries,
    exchangeRates, units, conversionRules, sequences, users, teams, teamMembers, customers, contacts, projects, phaseHistory, opportunities,
    stageHistory, results, resultHistory, projectProducts, forecastLines, visits, visitEvents, activities, participants, imports, importRows,
    salesTargets, products, families,
  ] = await Promise.all([
    prisma.appModule.count(), prisma.permission.count(), prisma.role.count(), prisma.rolePermission.count(), prisma.roleMenuOption.count(),
    prisma.menuOption.count(), prisma.systemParameter.count(), prisma.catalog.count(), prisma.catalogItem.count(), prisma.currency.count(),
    prisma.country.count(), prisma.exchangeRate.count(), prisma.unitOfMeasure.count(), prisma.unitConversionRule.count(), prisma.sequence.count(),
    prisma.user.count(), prisma.team.count(), prisma.teamMember.count(), prisma.customer.count(), prisma.contact.count(), prisma.project.count(),
    prisma.projectPhaseHistory.count(), prisma.opportunity.count(), prisma.opportunityStageHistory.count(), prisma.opportunityResult.count(),
    prisma.opportunityResultHistory.count(), prisma.projectProduct.count(), prisma.forecastLine.count(), prisma.visit.count(), prisma.visitEvent.count(),
    prisma.activity.count(), prisma.interactionParticipant.count(), prisma.customerImport.count(), prisma.customerImportRow.count(),
    prisma.salesTarget.count(), prisma.product.count(), prisma.productFamily.count(),
  ]);
  return {
    modules, permissions, roles, rolePermissions, roleMenuOptions, menuOptions, parameters, catalogs, catalogItems, currencies, countries,
    exchangeRates, units, conversionRules, sequences, users, teams, teamMembers, customers, contacts, projects, phaseHistory, opportunities,
    stageHistory, results, resultHistory, projectProducts, forecastLines, visits, visitEvents, activities, participants, imports, importRows,
    salesTargets, products, families,
  };
}

async function countByCode(model: 'visit' | 'activity' | 'opportunity', catalogKey: string): Promise<Record<string, number>> {
  const items = await prisma.catalogItem.findMany({ where: { catalog: { key: catalogKey } }, select: { id: true, code: true } });
  const result: Record<string, number> = {};
  for (const entry of items) {
    const where = model === 'opportunity' ? { stageId: entry.id } : { statusId: entry.id };
    const total =
      model === 'visit'
        ? await prisma.visit.count({ where })
        : model === 'activity'
          ? await prisma.activity.count({ where })
          : await prisma.opportunity.count({ where });
    result[entry.code] = total;
  }
  return result;
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
  execSync('pnpm exec prisma migrate deploy', { cwd, env: baseEnv, stdio: 'pipe' });
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await prisma.$disconnect();
});

describe('semilla esencial (00 §8.2)', () => {
  let afterFirstRun: Record<string, number>;

  beforeAll(() => {
    const first = run('prisma/seed.ts');
    expect(first.status).toBe(0);
  });

  it('siembra la configuración del CRM con los valores aprobados', async () => {
    afterFirstRun = await counts();

    expect(await prisma.currency.findMany({ orderBy: { code: 'asc' }, select: { code: true } })).toEqual(
      ['CRC', 'GTQ', 'HNL', 'USD', 'VES'].map((code) => ({ code })),
    );
    const countries = await prisma.country.findMany({ orderBy: { sortOrder: 'asc' }, select: { isoCode: true, currencyCode: true, taxIdLabel: true } });
    expect(countries).toEqual([
      { isoCode: 'GT', currencyCode: 'GTQ', taxIdLabel: 'NIT' },
      { isoCode: 'SV', currencyCode: 'USD', taxIdLabel: 'NIT' },
      { isoCode: 'HN', currencyCode: 'HNL', taxIdLabel: 'RTN' },
      { isoCode: 'CR', currencyCode: 'CRC', taxIdLabel: 'Cédula jurídica' },
      { isoCode: 'VE', currencyCode: 'VES', taxIdLabel: 'RIF' },
      { isoCode: 'EC', currencyCode: 'USD', taxIdLabel: 'RUC' },
    ]);
    // Las tasas reales las entrega el negocio: la esencial no inventa ninguna.
    expect(afterFirstRun.exchangeRates).toBe(0);
    expect(afterFirstRun.units).toBe(9);
    expect(afterFirstRun.conversionRules).toBe(4);
    expect(afterFirstRun.products).toBe(0);
    expect(afterFirstRun.teams).toBe(0);

    expect(await prisma.catalog.count({ where: { key: { startsWith: 'crm.' }, isSystem: true } })).toBe(17);
    const stage = await prisma.catalogItem.findFirstOrThrow({ where: { code: 'GANADO', catalog: { key: 'crm.etapa_oportunidad' } } });
    expect(stage.metadata).toEqual({ order: 3, isClosed: true, outcome: 'WON', inFunnel: true });
    const rescheduled = await prisma.catalogItem.findFirstOrThrow({ where: { code: 'REPROGRAMADA', catalog: { key: 'crm.estado_visita' } } });
    expect(rescheduled.metadata).toMatchObject({ isPending: true, isRescheduled: true, isDone: false });
    const task = await prisma.catalogItem.findFirstOrThrow({ where: { code: 'TAREA', catalog: { key: 'crm.tipo_actividad' } } });
    expect(task.metadata).toEqual({ isInteraction: false, fields: ['scheduledAt', 'resultId', 'resultNotes'] });

    const crmCodes = CRM_PERMISSIONS.flatMap((entry) => entry.actions.map((action) => `${entry.resource}.${action}`));
    expect(crmCodes).toHaveLength(41);
    expect(await prisma.permission.count({ where: { code: { in: crmCodes } } })).toBe(41);

    const roles = await prisma.role.findMany({
      where: { code: { in: ['asesor', 'manager', 'responsable-pais'] } },
      orderBy: { code: 'asc' },
      select: { code: true, dataScope: true, isSystem: true, _count: { select: { permissions: true } } },
    });
    expect(roles).toEqual([
      { code: 'asesor', dataScope: 'OWN', isSystem: true, _count: { permissions: 26 } },
      { code: 'manager', dataScope: 'TEAM', isSystem: true, _count: { permissions: 38 } },
      { code: 'responsable-pais', dataScope: 'COUNTRY', isSystem: true, _count: { permissions: 38 } },
    ]);
    const administrator = await prisma.role.findUniqueOrThrow({ where: { code: 'administrador' }, select: { _count: { select: { permissions: true } } } });
    expect(administrator._count.permissions).toBe(afterFirstRun.permissions);

    // DM-32: ninguna opción del CRM sin pantalla registrada.
    expect(await prisma.menuOption.count({ where: { key: { in: ['clientes-buscar', 'actividad-agenda', 'admin-tipos-cambio'] } } })).toBe(0);

    const parameters = await prisma.systemParameter.findMany({
      where: { key: { in: ['crm.moneda_base', 'crm.importaciones.habilitada', 'sistema.permite_datos_demo', 'crm.clientes.reglas_duplicidad'] } },
      select: { key: true, value: true },
    });
    expect(Object.fromEntries(parameters.map((parameter) => [parameter.key, parameter.value]))).toEqual({
      'crm.moneda_base': 'USD',
      'crm.importaciones.habilitada': 'false',
      'sistema.permite_datos_demo': 'false',
      'crm.clientes.reglas_duplicidad': '{"razonSocialNormalizada":"AVISAR","nit":"AVISAR"}',
    });
    expect(await prisma.sequence.count({ where: { key: { startsWith: 'crm.' }, currentValue: 0 } })).toBe(6);
  });

  it('es idempotente y no pisa lo que ajustó un administrador', async () => {
    await prisma.systemParameter.update({ where: { key: 'crm.alertas.proyecto_sin_actualizar_dias' }, data: { value: '45' } });
    const priority = await prisma.catalogItem.findFirstOrThrow({ where: { code: 'BAJA', catalog: { key: 'crm.prioridad' } } });
    await prisma.catalogItem.update({ where: { id: priority.id }, data: { label: 'Baja (editada)', isActive: false } });
    await prisma.sequence.update({ where: { key: 'crm.cliente' }, data: { currentValue: 12 } });

    const second = run('prisma/seed.ts');
    expect(second.status).toBe(0);

    // `auditLogs` no entra: cada ejecución deja su propia entrada.
    expect(await counts()).toEqual(afterFirstRun);
    expect((await prisma.systemParameter.findUniqueOrThrow({ where: { key: 'crm.alertas.proyecto_sin_actualizar_dias' } })).value).toBe('45');
    expect(await prisma.catalogItem.findUniqueOrThrow({ where: { id: priority.id } })).toMatchObject({ label: 'Baja (editada)', isActive: false });
    expect((await prisma.sequence.findUniqueOrThrow({ where: { key: 'crm.cliente' } })).currentValue).toBe(12);
  });
});

describe('semilla de demostración (00 §8.1, §8.3)', () => {
  it('la guardia exige no producción, SEED_DEMO=true y el parámetro en true', () => {
    const ok = { nodeEnv: 'development', seedDemo: 'true', parameterValue: 'true' };
    expect(evaluateDemoGuards(ok)).toEqual([]);
    expect(evaluateDemoGuards({ ...ok, nodeEnv: 'production' })).toHaveLength(1);
    expect(evaluateDemoGuards({ ...ok, nodeEnv: ' Production ' })).toHaveLength(1);
    expect(evaluateDemoGuards({ ...ok, seedDemo: undefined })).toHaveLength(1);
    expect(evaluateDemoGuards({ ...ok, seedDemo: '1' })).toHaveLength(1);
    expect(evaluateDemoGuards({ ...ok, parameterValue: 'false' })).toHaveLength(1);
    expect(evaluateDemoGuards({ ...ok, parameterValue: null })).toHaveLength(1);
  });

  it('se niega en producción, sin SEED_DEMO o con el parámetro en false, sin escribir nada', async () => {
    const before = await counts();

    const withoutFlag = run('prisma/seed-demo.ts');
    expect(withoutFlag.status).not.toBe(0);
    expect(withoutFlag.output).toContain('RECHAZADA');

    const parameterFalse = run('prisma/seed-demo.ts', { SEED_DEMO: 'true' });
    expect(parameterFalse.status).not.toBe(0);

    await prisma.systemParameter.update({ where: { key: 'sistema.permite_datos_demo' }, data: { value: 'true' } });
    const production = run('prisma/seed-demo.ts', { SEED_DEMO: 'true', NODE_ENV: 'production' });
    expect(production.status).not.toBe(0);
    expect(production.output).toContain('NODE_ENV=production');

    expect(await counts()).toEqual(before);
  });

  it('carga datos coherentes que cubren todos los estados y es idempotente', async () => {
    const first = run('prisma/seed-demo.ts', { SEED_DEMO: 'true', SEED_DEMO_PASSWORD: 'demo-inicial-pruebas' });
    expect(first.output).toContain('completada');
    expect(first.status).toBe(0);
    const afterFirst = await counts();

    expect(await countByCode('visit', 'crm.estado_visita')).toEqual({ PROGRAMADA: 3, REPROGRAMADA: 1, REALIZADA: 1, CONFIRMADA: 1, CANCELADA: 1 });
    expect(await countByCode('activity', 'crm.estado_actividad')).toEqual({ PENDIENTE: 4, EN_PROCESO: 1, COMPLETADA: 2, CANCELADA: 1 });
    expect(await countByCode('opportunity', 'crm.etapa_oportunidad')).toEqual({ CONTACTADO: 2, COTIZANDO: 3, GANADO: 4, PERDIDO: 1 });
    expect(await prisma.opportunityResult.groupBy({ by: ['outcome'], _count: true, orderBy: { outcome: 'asc' } })).toEqual([
      { outcome: 'WON', _count: 3 },
      { outcome: 'LOST', _count: 1 },
      { outcome: 'PARTIAL', _count: 1 },
    ]);

    // Dos establecimientos con el mismo NIT y distinto código (DM-4).
    const sharedTaxId = await prisma.customer.groupBy({ by: ['countryId', 'taxIdNormalized'], _count: true, having: { taxIdNormalized: { _count: { gt: 1 } } } });
    expect(sharedTaxId).toHaveLength(1);
    expect(await prisma.customer.count({ where: { deletedAt: { not: null } } })).toBe(1);
    expect(await prisma.customer.count({ where: { primaryContactId: { not: null } } })).toBe(8);

    // Forecast M+1…M+6 relativo a hoy y las tres precedencias de conversión.
    expect(afterFirst.forecastLines).toBeGreaterThan(30);
    expect(await prisma.unitConversionRule.groupBy({ by: ['scope'], _count: true, orderBy: { scope: 'asc' } })).toEqual([
      { scope: 'GLOBAL', _count: 4 },
      { scope: 'PRODUCT_FAMILY', _count: 1 },
      { scope: 'PRODUCT', _count: 4 },
      { scope: 'PROJECT_TYPE', _count: 1 },
    ]);
    expect(await prisma.projectProduct.count({ where: { conversionRuleId: null } })).toBe(3);

    // Estimación en moneda local con foto de tasa y equivalente USD.
    const gtq = await prisma.opportunity.findFirstOrThrow({ where: { currencyCode: 'GTQ' } });
    expect(gtq.exchangeRateDate).not.toBeNull();
    expect(gtq.estimatedAmountUsd?.toNumber()).toBeCloseTo(gtq.estimatedAmount!.div(gtq.exchangeRate!).toNumber(), 3);

    // Usuarios de los tres alcances, con país, código y credencial de cambio obligatorio.
    const demoUsers = await prisma.user.findMany({
      where: { emailNormalized: { endsWith: '@demo.invalid' } },
      select: { employeeCode: true, countryId: true, credential: { select: { mustChangePassword: true } }, roles: { select: { role: { select: { code: true } } } } },
    });
    expect(demoUsers).toHaveLength(8);
    expect(demoUsers.every((entry) => entry.employeeCode && entry.countryId && entry.credential?.mustChangePassword)).toBe(true);
    expect(new Set(demoUsers.flatMap((entry) => entry.roles.map((assignment) => assignment.role.code)))).toEqual(
      new Set(['asesor', 'manager', 'responsable-pais']),
    );

    const second = run('prisma/seed-demo.ts', { SEED_DEMO: 'true', SEED_DEMO_PASSWORD: 'demo-inicial-pruebas' });
    expect(second.status).toBe(0);
    expect(await counts()).toEqual(afterFirst);
  });

  it('--purge borra solo lo marcado como demo', async () => {
    const purge = run('prisma/seed-demo.ts', { SEED_DEMO: 'true' }, ['--purge']);
    expect(purge.status).toBe(0);

    const after = await counts();
    expect(after).toMatchObject({ customers: 0, projects: 0, visits: 0, activities: 0, products: 0, teams: 0, exchangeRates: 0, conversionRules: 4, users: 1 });
    expect(after.permissions).toBeGreaterThan(70);
  });
});
