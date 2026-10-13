/**
 * Escritura de la semilla de demostración (00 §8.3). Se ejecuta dentro de UNA
 * transacción (ver `prisma/seed-demo.ts`).
 *
 * Idempotencia:
 * - Equipos, usuarios, familias, productos, reglas y tipos de cambio demo:
 *   `upsert` por clave natural (ids estables; no se toca la credencial de un
 *   usuario demo que ya la tenga).
 * - Datos comerciales (clientes, proyectos, oportunidades, forecast, visitas,
 *   actividades, importación, metas): se purgan los marcados `DEMO-` y se
 *   recrean con fechas relativas a hoy. Re-ejecutar no duplica y "recoloca" las
 *   fechas (forecast M+1…M+6, vencidas, próximas).
 *
 * Todo respeta los CHECK reales de la base (migraciones 1-8).
 *
 * Adjuntos demo (00 §8.3): los binarios los escribe ANTES `prisma/seed-demo.ts`
 * (ver `demo-attachments.ts`); aquí solo se crean sus filas `stored_files` +
 * `attachments`. La purga devuelve las claves de los `stored_files` demo que
 * borró para que el orquestador elimine sus binarios DESPUÉS del commit.
 */
import { Prisma } from '@prisma/client';

import type { PreparedDemoAttachment } from './demo-attachments';

import {
  DEMO_EMAIL_DOMAIN,
  DEMO_FAMILIES,
  DEMO_FAMILY_RULE,
  DEMO_PREFIX,
  DEMO_PRODUCTS,
  DEMO_PROJECT_TYPE_RULE,
  DEMO_RATE_SOURCE,
  DEMO_RATES,
  DEMO_TAG,
  DEMO_TEAMS,
  DEMO_USERS,
} from './demo-data';

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;
const D = (value: Prisma.Decimal.Value): Decimal => new Prisma.Decimal(value);

export interface DemoSeedOptions {
  /** Hash Argon2id ya calculado (fuera de la transacción) por correo; vacío = cuentas INVITED sin credencial. */
  passwordHashes: Map<string, string>;
  /** "Ahora" de referencia; parametrizable para pruebas. */
  now?: Date;
  /** Binarios demo ya guardados (fuera de la transacción); se crean sus filas. */
  attachments?: readonly PreparedDemoAttachment[];
}

export type DemoSummary = Record<string, number>;

export interface DemoSeedResult {
  summary: DemoSummary;
  /** Claves de los binarios de los `stored_files` demo purgados: se borran tras el commit. */
  purgedStorageKeys: string[];
}

// -----------------------------------------------------------------------------
// Fechas relativas (día de negocio en America/Guatemala, UTC-6 sin horario de verano)
// -----------------------------------------------------------------------------

const BUSINESS_UTC_OFFSET_HOURS = -6;

class Clock {
  private readonly y: number;
  private readonly m: number;
  private readonly d: number;

  constructor(readonly now: Date) {
    const local = new Date(now.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000);
    this.y = local.getUTCFullYear();
    this.m = local.getUTCMonth();
    this.d = local.getUTCDate();
  }

  /** Instante: día relativo a hoy, a la hora local de negocio indicada. */
  at(days: number, localHour = 9, minutes = 0): Date {
    return new Date(Date.UTC(this.y, this.m, this.d + days, localHour - BUSINESS_UTC_OFFSET_HOURS, minutes));
  }

  /** Fecha de calendario (`@db.Date`). */
  date(days: number): Date {
    return new Date(Date.UTC(this.y, this.m, this.d + days));
  }

  /** Año y mes (1-12) desplazados `offset` meses del actual. */
  month(offset: number): { year: number; month: number } {
    const first = new Date(Date.UTC(this.y, this.m + offset, 1));
    return { year: first.getUTCFullYear(), month: first.getUTCMonth() + 1 };
  }

  firstOfMonth(offset: number): Date {
    return new Date(Date.UTC(this.y, this.m + offset, 1));
  }
}

// -----------------------------------------------------------------------------
// Normalización (misma regla que 00 §6.2)
// -----------------------------------------------------------------------------

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTaxId(value: string): string {
  return value.toUpperCase().replace(/[\s.-]/g, '');
}

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

// -----------------------------------------------------------------------------
// Purga
// -----------------------------------------------------------------------------

/**
 * Borra los datos comerciales marcados `DEMO-` (orden inverso de dependencias).
 * Devuelve las claves de almacenamiento de los `stored_files` borrados: el
 * llamador elimina esos binarios SOLO después del commit.
 */
export async function purgeDemoCommercialData(tx: Tx): Promise<string[]> {
  const customers = await tx.customer.findMany({ where: { crmCode: { startsWith: DEMO_PREFIX } }, select: { id: true } });
  const customerIds = customers.map((customer) => customer.id);
  const byCustomer = { customerId: { in: customerIds } };
  const byProject = { project: byCustomer };
  // Adjuntos de un cliente demo, directos o de sus proyectos, visitas, eventos y actividades.
  const demoAttachments: Prisma.AttachmentWhereInput = {
    OR: [byCustomer, { project: byCustomer }, { visit: byCustomer }, { activity: byCustomer }, { visitEvent: { visit: byCustomer } }],
  };

  await tx.interactionParticipant.deleteMany({ where: byCustomer });
  const demoFiles = await tx.attachment.findMany({ where: demoAttachments, select: { storedFileId: true } });
  await tx.attachment.deleteMany({ where: demoAttachments });
  await tx.visitEvent.deleteMany({ where: { visit: byCustomer } });
  await tx.visit.deleteMany({ where: byCustomer });
  await tx.activity.deleteMany({ where: byCustomer });
  await tx.forecastLine.deleteMany({ where: byProject });
  await tx.projectProduct.deleteMany({ where: byProject });
  await tx.opportunityResultHistory.deleteMany({ where: { opportunity: byProject } });
  await tx.opportunityResult.deleteMany({ where: { opportunity: byProject } });
  await tx.opportunityStageHistory.deleteMany({ where: { opportunity: byProject } });
  await tx.opportunity.deleteMany({ where: byProject });
  await tx.projectPhaseHistory.deleteMany({ where: byProject });
  await tx.project.updateMany({ where: byCustomer, data: { duplicatedFromId: null } });
  await tx.project.deleteMany({ where: byCustomer });
  await tx.customer.updateMany({ where: { id: { in: customerIds } }, data: { primaryContactId: null } });
  await tx.contact.deleteMany({ where: byCustomer });
  await tx.customerImport.deleteMany({ where: { code: { startsWith: DEMO_PREFIX } } });
  await tx.customer.deleteMany({ where: { id: { in: customerIds } } });
  await tx.salesTarget.deleteMany({ where: { notes: { startsWith: DEMO_TAG } } });
  return purgeDemoStoredFiles(tx, demoFiles.map((file) => file.storedFileId));
}

/**
 * Borra los `stored_files` que pertenecían a los adjuntos demo recién borrados
 * (`attachments.stored_file_id` es único: el archivo era solo de ese adjunto).
 * Por seguridad, solo los que ya no tienen adjunto ni los usa una importación:
 * nunca un archivo ajeno a la demo. Devuelve sus claves de almacenamiento.
 */
async function purgeDemoStoredFiles(tx: Tx, storedFileIds: string[]): Promise<string[]> {
  if (storedFileIds.length === 0) {
    return [];
  }
  const files = await tx.storedFile.findMany({
    where: { id: { in: storedFileIds }, attachment: null, importsAsSource: { none: {} }, importsAsErrors: { none: {} } },
    select: { id: true, storageKey: true },
  });
  await tx.storedFile.deleteMany({ where: { id: { in: files.map((file) => file.id) } } });
  return files.map((file) => file.storageKey);
}

/** `--purge`: además de lo comercial, borra maestros, equipos y usuarios demo. */
export async function purgeDemoMasters(tx: Tx): Promise<void> {
  await tx.unitConversionRule.deleteMany({ where: { description: { startsWith: DEMO_TAG } } });
  await tx.product.deleteMany({ where: { sku: { startsWith: DEMO_PREFIX } } });
  await tx.productFamily.deleteMany({ where: { code: { startsWith: DEMO_PREFIX } } });
  await tx.exchangeRate.deleteMany({ where: { source: DEMO_RATE_SOURCE } });
  await tx.teamMember.deleteMany({ where: { team: { code: { startsWith: DEMO_PREFIX } } } });
  await tx.team.deleteMany({ where: { code: { startsWith: DEMO_PREFIX }, parentId: { not: null } } });
  await tx.team.deleteMany({ where: { code: { startsWith: DEMO_PREFIX } } });

  const demoUsers = await tx.user.findMany({ where: { emailNormalized: { endsWith: DEMO_EMAIL_DOMAIN } }, select: { id: true } });
  const demoUserIds = demoUsers.map((demo) => demo.id);
  const blockers = await findUserReferenceBlockers(tx, demoUserIds);
  if (blockers.length > 0) {
    throw new DemoPurgeBlockedError(blockers);
  }
  await tx.user.deleteMany({ where: { id: { in: demoUserIds } } });
}

/** Tabla y columna que referencia a `users` con `ON DELETE RESTRICT/NO ACTION`, y cuántas filas apuntan a usuarios demo. */
export interface UserReferenceBlocker {
  table: string;
  column: string;
  count: number;
}

/**
 * `--purge` no puede borrar los usuarios demo porque registros que NO son de la
 * demo los referencian. El mensaje lista solo tablas, columnas y conteos: nunca
 * nombres, correos ni ids (sin datos personales).
 */
export class DemoPurgeBlockedError extends Error {
  constructor(readonly blockers: readonly UserReferenceBlocker[]) {
    super(
      [
        'Purga de demostración RECHAZADA; no se borró nada (transacción revertida).',
        'Hay registros que no son de demostración asociados a usuarios @demo.invalid.',
        'Reasígnalos a otro usuario o elimínalos y vuelve a ejecutar --purge:',
        ...blockers.map((blocker) => `  - ${blocker.table}.${blocker.column}: ${blocker.count}`),
      ].join('\n'),
    );
    this.name = 'DemoPurgeBlockedError';
  }
}

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Busca en el catálogo de PostgreSQL TODAS las FK hacia `users.id` que impiden
 * el borrado (`RESTRICT` o `NO ACTION`) y cuenta las filas que apuntan a los
 * usuarios demo. Se ejecuta después de purgar los datos comerciales y maestros
 * demo, así que lo que queda son registros ajenos a la demo. Al leer las FK del
 * catálogo, una tabla nueva de un módulo futuro queda cubierta sin tocar esto.
 */
async function findUserReferenceBlockers(tx: Tx, demoUserIds: string[]): Promise<UserReferenceBlocker[]> {
  if (demoUserIds.length === 0) {
    return [];
  }
  const references = await tx.$queryRaw<Array<{ table: string; column: string }>>`
    SELECT DISTINCT cl.relname AS "table", a.attname AS "column"
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(attnum, fattnum)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = k.fattnum
    WHERE c.contype = 'f'
      AND c.confrelid = to_regclass('users')
      AND c.confdeltype IN ('r', 'a')
      AND fa.attname = 'id'
    ORDER BY 1, 2`;

  const blockers: UserReferenceBlocker[] = [];
  for (const reference of references) {
    if (!SQL_IDENTIFIER.test(reference.table) || !SQL_IDENTIFIER.test(reference.column)) {
      throw new Error(`Semilla demo: identificador inesperado en el catálogo (${reference.table}.${reference.column}).`);
    }
    // Identificadores validados y leídos del catálogo; los ids van como parámetro.
    const [row] = await tx.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT count(*)::int AS total FROM "${reference.table}" WHERE "${reference.column}" = ANY($1::uuid[])`,
      demoUserIds,
    );
    const count = row?.total ?? 0;
    if (count > 0) {
      blockers.push({ table: reference.table, column: reference.column, count });
    }
  }
  return blockers;
}

// -----------------------------------------------------------------------------
// Siembra
// -----------------------------------------------------------------------------

interface Rule {
  id: string;
  factor: Decimal;
  fromUnitId: string;
}

interface Context {
  tx: Tx;
  clock: Clock;
  countries: Map<string, string>;
  units: Map<string, string>;
  users: Map<string, string>;
  products: Map<string, { id: string; baseUnit: string; familyCode: string }>;
  productRules: Map<string, Rule>;
  globalRules: Map<string, Rule>;
  familyRules: Map<string, Rule>;
  projectTypeRule: Rule;
  items: Map<string, string>;
  summary: DemoSummary;
}

function need<T>(map: Map<string, T>, key: string, kind: string): T {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Semilla demo: falta ${kind} "${key}". ¿Se ejecutó la semilla esencial?`);
  }
  return value;
}

function bump(ctx: Context, key: string, by = 1): void {
  ctx.summary[key] = (ctx.summary[key] ?? 0) + by;
}

const item = (ctx: Context, catalogKey: string, code: string): string => need(ctx.items, `${catalogKey}:${code}`, 'elemento de catálogo');
const user = (ctx: Context, employeeCode: string): string => need(ctx.users, employeeCode, 'usuario demo');

export async function seedDemo(tx: Tx, options: DemoSeedOptions): Promise<DemoSeedResult> {
  const clock = new Clock(options.now ?? new Date());
  const ctx = await loadContext(tx, clock);

  const purgedStorageKeys = await purgeDemoCommercialData(tx);
  await seedUsersAndTeams(ctx, options.passwordHashes);
  await seedProducts(ctx);
  await seedExchangeRates(ctx);

  const customers = await seedCustomers(ctx);
  await seedAttachments(ctx, customers, options.attachments ?? []);
  const projects = await seedProjects(ctx, customers);
  const opportunities = await seedOpportunities(ctx, projects);
  await seedProjectProducts(ctx, projects, opportunities);
  await seedForecast(ctx, projects);
  await seedVisits(ctx, customers, projects);
  await seedActivities(ctx, customers, projects, opportunities);
  await seedImport(ctx, customers);
  await seedSalesTargets(ctx);

  // 06 D-06.9: fuera de producción la demo habilita la carga masiva.
  if (await enableImportsForDemo(tx)) {
    bump(ctx, 'parametersUpdated');
  }

  return { summary: ctx.summary, purgedStorageKeys };
}

export const IMPORTS_PARAMETER_KEY = 'crm.importaciones.habilitada';

/**
 * Pone `crm.importaciones.habilitada = true` solo si tenía otro valor y lo deja
 * en la bitácora como cualquier cambio de parámetro (`parameter.updated`, mismo
 * formato `changes` que `AuditService`), sin actor: lo hizo la semilla
 * (`correlationId = seed-demo`, `metadata.source = demo-seed`). `--purge` no lo
 * revierte (ver cabecera de `prisma/seed-demo.ts`).
 */
async function enableImportsForDemo(tx: Tx): Promise<boolean> {
  const parameter = await tx.systemParameter.findUnique({ where: { key: IMPORTS_PARAMETER_KEY }, select: { value: true } });
  if (!parameter || parameter.value === 'true') {
    return false;
  }
  await tx.systemParameter.update({ where: { key: IMPORTS_PARAMETER_KEY }, data: { value: 'true', updatedById: null } });
  await tx.auditLog.create({
    data: {
      correlationId: 'seed-demo',
      event: 'parameter.updated',
      resourceType: 'system_parameter',
      resourceId: IMPORTS_PARAMETER_KEY,
      changes: { value: { before: parameter.value, after: 'true' } },
      metadata: { source: 'demo-seed' },
    },
  });
  return true;
}

async function loadContext(tx: Tx, clock: Clock): Promise<Context> {
  const [countries, units, catalogItems, globalRules] = await Promise.all([
    tx.country.findMany({ select: { id: true, isoCode: true } }),
    tx.unitOfMeasure.findMany({ select: { id: true, code: true } }),
    tx.catalogItem.findMany({ where: { catalog: { key: { startsWith: 'crm.' } } }, select: { id: true, code: true, catalog: { select: { key: true } } } }),
    tx.unitConversionRule.findMany({ where: { scope: 'GLOBAL' }, select: { id: true, factor: true, fromUnitId: true, fromUnit: { select: { code: true } } } }),
  ]);

  return {
    tx,
    clock,
    countries: new Map(countries.map((country) => [country.isoCode, country.id])),
    units: new Map(units.map((unit) => [unit.code, unit.id])),
    users: new Map(),
    products: new Map(),
    productRules: new Map(),
    globalRules: new Map(globalRules.map((rule) => [rule.fromUnit.code, { id: rule.id, factor: rule.factor, fromUnitId: rule.fromUnitId }])),
    familyRules: new Map(),
    projectTypeRule: { id: '', factor: D(0), fromUnitId: '' },
    items: new Map(catalogItems.map((entry) => [`${entry.catalog.key}:${entry.code}`, entry.id])),
    summary: {},
  };
}

async function seedUsersAndTeams(ctx: Context, passwordHashes: Map<string, string>): Promise<void> {
  const { tx } = ctx;
  const roles = await tx.role.findMany({ where: { code: { in: ['asesor', 'manager', 'responsable-pais'] } }, select: { id: true, code: true } });
  const roleIds = new Map(roles.map((role) => [role.code, role.id]));

  for (const demo of DEMO_USERS) {
    const emailNormalized = demo.email.toLowerCase();
    const data = {
      firstName: demo.firstName,
      lastName: demo.lastName,
      displayName: `${demo.firstName} ${demo.lastName}`,
      jobTitle: demo.jobTitle,
      employeeCode: demo.employeeCode,
      countryId: need(ctx.countries, demo.country, 'país'),
      deletedAt: null,
    };
    const saved = await tx.user.upsert({
      where: { emailNormalized },
      update: data,
      create: { ...data, email: demo.email, emailNormalized, status: 'INVITED' },
      select: { id: true, credential: { select: { id: true } } },
    });
    ctx.users.set(demo.employeeCode, saved.id);

    const hash = passwordHashes.get(emailNormalized);
    if (!saved.credential && hash) {
      await tx.userCredential.create({ data: { userId: saved.id, passwordHash: hash, mustChangePassword: true } });
      await tx.user.update({ where: { id: saved.id }, data: { status: 'ACTIVE' } });
    }

    await tx.userRole.deleteMany({ where: { userId: saved.id } });
    await tx.userRole.create({ data: { userId: saved.id, roleId: need(roleIds, demo.role, 'rol') } });
    bump(ctx, 'users');
  }

  const teamIds = new Map<string, string>();
  for (const team of DEMO_TEAMS) {
    const data = {
      name: team.name,
      parentId: team.parentCode ? need(teamIds, team.parentCode, 'equipo') : null,
      managerId: team.managerEmployeeCode ? user(ctx, team.managerEmployeeCode) : null,
      isActive: true,
      deletedAt: null,
    };
    const saved = await tx.team.upsert({ where: { code: team.code }, update: data, create: { code: team.code, ...data } });
    teamIds.set(team.code, saved.id);
    bump(ctx, 'teams');
  }

  await tx.teamMember.deleteMany({ where: { teamId: { in: [...teamIds.values()] } } });
  await tx.teamMember.createMany({
    data: DEMO_USERS.map((demo) => ({ teamId: need(teamIds, demo.team, 'equipo'), userId: user(ctx, demo.employeeCode), isPrimary: true })),
  });
}

async function upsertRule(
  ctx: Context,
  input: { fromUnit: string; scope: 'PRODUCT' | 'PRODUCT_FAMILY' | 'PROJECT_TYPE'; scopeId: string; factor: string; description: string },
): Promise<Rule> {
  const fromUnitId = need(ctx.units, input.fromUnit, 'unidad');
  const toUnitId = need(ctx.units, 'TON', 'unidad');
  const scopeColumns = {
    productId: input.scope === 'PRODUCT' ? input.scopeId : null,
    productFamilyId: input.scope === 'PRODUCT_FAMILY' ? input.scopeId : null,
    projectTypeId: input.scope === 'PROJECT_TYPE' ? input.scopeId : null,
  };
  const saved = await ctx.tx.unitConversionRule.upsert({
    where: { fromUnitId_toUnitId_scopeKey: { fromUnitId, toUnitId, scopeKey: input.scopeId } },
    update: { factor: input.factor, description: input.description, isActive: true },
    create: { fromUnitId, toUnitId, factor: input.factor, scope: input.scope, scopeKey: input.scopeId, description: input.description, ...scopeColumns },
  });
  bump(ctx, 'conversionRules');
  return { id: saved.id, factor: saved.factor, fromUnitId };
}

async function seedProducts(ctx: Context): Promise<void> {
  const familyIds = new Map<string, string>();
  for (const [index, family] of DEMO_FAMILIES.entries()) {
    const saved = await ctx.tx.productFamily.upsert({
      where: { code: family.code },
      update: { name: family.name, isActive: true },
      create: { code: family.code, name: family.name, sortOrder: (index + 1) * 10, description: `${DEMO_TAG} Familia ficticia` },
    });
    familyIds.set(family.code, saved.id);
    bump(ctx, 'productFamilies');
  }

  for (const product of DEMO_PRODUCTS) {
    const data = {
      description: product.description,
      familyId: need(familyIds, product.family, 'familia'),
      baseUnitId: need(ctx.units, product.baseUnit, 'unidad'),
      isActive: true,
    };
    const saved = await ctx.tx.product.upsert({ where: { sku: product.sku }, update: data, create: { sku: product.sku, ...data } });
    ctx.products.set(product.sku, { id: saved.id, baseUnit: product.baseUnit, familyCode: product.family });
    bump(ctx, 'products');

    if (product.productFactor) {
      ctx.productRules.set(
        product.sku,
        await upsertRule(ctx, {
          fromUnit: product.baseUnit,
          scope: 'PRODUCT',
          scopeId: saved.id,
          factor: product.productFactor,
          description: `${DEMO_TAG} ${product.sku} a toneladas (factor ilustrativo)`,
        }),
      );
    }
  }

  ctx.familyRules.set(
    DEMO_FAMILY_RULE.family,
    await upsertRule(ctx, {
      fromUnit: DEMO_FAMILY_RULE.fromUnit,
      scope: 'PRODUCT_FAMILY',
      scopeId: need(familyIds, DEMO_FAMILY_RULE.family, 'familia'),
      factor: DEMO_FAMILY_RULE.factor,
      description: `${DEMO_TAG} Metro de perfil a toneladas (factor ilustrativo)`,
    }),
  );
  ctx.projectTypeRule = await upsertRule(ctx, {
    fromUnit: DEMO_PROJECT_TYPE_RULE.fromUnit,
    scope: 'PROJECT_TYPE',
    scopeId: item(ctx, 'crm.tipo_proyecto', DEMO_PROJECT_TYPE_RULE.projectType),
    factor: DEMO_PROJECT_TYPE_RULE.factor,
    description: `${DEMO_TAG} m² de vivienda a toneladas (estimación ilustrativa)`,
  });
}

async function seedExchangeRates(ctx: Context): Promise<void> {
  for (const [currencyCode, values] of Object.entries(DEMO_RATES)) {
    for (const [index, ratePerUsd] of values.entries()) {
      const effectiveDate = ctx.clock.firstOfMonth(index - 2);
      const key = { currencyCode_effectiveDate: { currencyCode, effectiveDate } };
      const existing = await ctx.tx.exchangeRate.findUnique({ where: key, select: { source: true } });
      if (existing && existing.source !== DEMO_RATE_SOURCE) {
        continue; // Nunca se pisa una tasa real.
      }
      await ctx.tx.exchangeRate.upsert({
        where: key,
        update: { ratePerUsd },
        create: { currencyCode, effectiveDate, ratePerUsd, source: DEMO_RATE_SOURCE, notes: `${DEMO_TAG} Tasa ficticia para demostración` },
      });
      bump(ctx, 'exchangeRates');
    }
  }
}

// --- Clientes y contactos ------------------------------------------------------

interface DemoCustomer {
  key: string;
  legalName: string;
  tradeName: string;
  country: 'GT' | 'SV';
  customerCode: string | null;
  taxId: string;
  city: string;
  companyType: string;
  status: string;
  rating: string;
  owner: string;
  deleted?: boolean;
  contacts: { firstName: string; lastName: string; jobTitle: string; primary?: boolean; inactive?: boolean }[];
}

// C1 y C2: dos establecimientos del mismo cliente con el MISMO NIT (DM-4) y distinto código.
const CUSTOMERS: DemoCustomer[] = [
  {
    key: 'C1', legalName: 'Constructora Demo Alfa, S.A.', tradeName: 'Alfa Construcciones (Zona 10)', country: 'GT', customerCode: 'DEMO-GT-001', taxId: '1234567-8',
    city: 'Ciudad de Guatemala', companyType: 'CONSTRUCTORA', status: 'ACTIVO', rating: 'A', owner: 'DEMO-E005',
    contacts: [
      { firstName: 'Paula', lastName: 'Ortiz Demo', jobTitle: 'Gerente de compras', primary: true },
      { firstName: 'Mario', lastName: 'Gómez Demo', jobTitle: 'Ingeniero residente' },
      { firstName: 'Elena', lastName: 'Ruiz Demo', jobTitle: 'Asistente administrativa', inactive: true },
    ],
  },
  {
    key: 'C2', legalName: 'Constructora Demo Alfa, S.A.', tradeName: 'Alfa Construcciones (Mixco)', country: 'GT', customerCode: 'DEMO-GT-002', taxId: '1234567-8',
    city: 'Mixco', companyType: 'CONSTRUCTORA', status: 'ACTIVO', rating: 'A', owner: 'DEMO-E006',
    contacts: [
      { firstName: 'Jorge', lastName: 'Pérez Demo', jobTitle: 'Jefe de obra', primary: true },
      { firstName: 'Lucía', lastName: 'Méndez Demo', jobTitle: 'Compras' },
    ],
  },
  {
    key: 'C3', legalName: 'Desarrolladora Demo Beta, S.A.', tradeName: 'Beta Desarrollos', country: 'GT', customerCode: 'DEMO-GT-003', taxId: '2345678-9',
    city: 'Antigua Guatemala', companyType: 'DESARROLLADORA', status: 'PROSPECTO', rating: 'B', owner: 'DEMO-E005',
    contacts: [
      { firstName: 'Andrés', lastName: 'Soto Demo', jobTitle: 'Director de proyectos', primary: true },
      { firstName: 'Carmen', lastName: 'Vega Demo', jobTitle: 'Arquitecta' },
    ],
  },
  {
    key: 'C4', legalName: 'Distribuidora Demo Gamma, S.A.', tradeName: 'Gamma Distribución', country: 'GT', customerCode: null, taxId: '3456789-0',
    city: 'Escuintla', companyType: 'DISTRIBUIDOR', status: 'ACTIVO', rating: 'B', owner: 'DEMO-E007',
    contacts: [
      { firstName: 'Raúl', lastName: 'Cruz Demo', jobTitle: 'Gerente general', primary: true },
      { firstName: 'Sofía', lastName: 'Lara Demo', jobTitle: 'Compras', inactive: true },
    ],
  },
  {
    key: 'C5', legalName: 'Ferretería Demo Delta', tradeName: 'Ferre Delta', country: 'GT', customerCode: 'DEMO-GT-005', taxId: '4567890-1',
    city: 'Mazatenango', companyType: 'FERRETERIA', status: 'INACTIVO', rating: 'C', owner: 'DEMO-E007',
    contacts: [
      { firstName: 'Tomás', lastName: 'Ramos Demo', jobTitle: 'Propietario', primary: true },
      { firstName: 'Inés', lastName: 'Barrios Demo', jobTitle: 'Encargada de tienda' },
    ],
  },
  {
    key: 'C6', legalName: 'Industrias Demo Épsilon, S.A. de C.V.', tradeName: 'Épsilon Industrial', country: 'SV', customerCode: 'DEMO-SV-001', taxId: '0614-010101-101-1',
    city: 'San Salvador', companyType: 'INDUSTRIA', status: 'ACTIVO', rating: 'A', owner: 'DEMO-E008',
    contacts: [
      { firstName: 'Gabriel', lastName: 'Núñez Demo', jobTitle: 'Gerente de planta', primary: true },
      { firstName: 'Patricia', lastName: 'Rosales Demo', jobTitle: 'Compras' },
      { firstName: 'Hugo', lastName: 'Aguilar Demo', jobTitle: 'Mantenimiento' },
    ],
  },
  {
    key: 'C7', legalName: 'Municipalidad Demo Zeta', tradeName: 'Municipalidad Zeta', country: 'SV', customerCode: 'DEMO-SV-002', taxId: '0614-020202-102-2',
    city: 'Santa Ana', companyType: 'GOBIERNO', status: 'PROSPECTO', rating: 'C', owner: 'DEMO-E008',
    contacts: [
      { firstName: 'Verónica', lastName: 'Campos Demo', jobTitle: 'Jefa de obras públicas', primary: true },
      { firstName: 'Óscar', lastName: 'Molina Demo', jobTitle: 'Técnico' },
    ],
  },
  {
    key: 'C8', legalName: 'Comercial Demo Eta', tradeName: 'Eta', country: 'SV', customerCode: 'DEMO-SV-003', taxId: '0614-030303-103-3',
    city: 'San Miguel', companyType: 'OTRO', status: 'ACTIVO', rating: 'B', owner: 'DEMO-E008', deleted: true,
    contacts: [
      { firstName: 'Ramiro', lastName: 'Fuentes Demo', jobTitle: 'Propietario', primary: true },
      { firstName: 'Diana', lastName: 'Salazar Demo', jobTitle: 'Administración' },
    ],
  },
];

interface CreatedCustomer {
  id: string;
  countryId: string;
  owner: string;
  contactIds: string[];
}

function customerRow(ctx: Context, input: Omit<DemoCustomer, 'contacts' | 'key'>, crmCode: string, extra: Partial<Prisma.CustomerUncheckedCreateInput> = {}): Prisma.CustomerUncheckedCreateInput {
  const slug = normalizeName(input.tradeName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    crmCode,
    customerCode: input.customerCode,
    customerCodeNormalized: input.customerCode ? normalizeCode(input.customerCode) : null,
    legalName: input.legalName,
    legalNameNormalized: normalizeName(input.legalName),
    tradeName: input.tradeName,
    taxId: input.taxId,
    taxIdNormalized: normalizeTaxId(input.taxId),
    countryId: need(ctx.countries, input.country, 'país'),
    city: input.city,
    address: `${input.city}, dirección ficticia`,
    phone: input.country === 'GT' ? '+502 2200 0000' : '+503 2200 0000',
    email: `contacto@${slug}.demo.invalid`,
    companyTypeId: item(ctx, 'crm.tipo_empresa', input.companyType),
    statusId: item(ctx, 'crm.estado_cliente', input.status),
    ratingId: item(ctx, 'crm.calificacion_cliente', input.rating),
    salesOwnerId: user(ctx, input.owner),
    deletedAt: input.deleted ? ctx.clock.at(-15) : null,
    createdAt: ctx.clock.at(-180),
    ...extra,
  };
}

async function seedCustomers(ctx: Context): Promise<Map<string, CreatedCustomer>> {
  const created = new Map<string, CreatedCustomer>();
  for (const [index, demo] of CUSTOMERS.entries()) {
    const { contacts, key, ...input } = demo;
    const customer = await ctx.tx.customer.create({ data: customerRow(ctx, input, `DEMO-CLI-${String(index + 1).padStart(4, '0')}`) });
    bump(ctx, 'customers');
    if (demo.deleted) bump(ctx, 'customersDeleted');

    const contactIds: string[] = [];
    let primaryId: string | null = null;
    for (const contact of contacts) {
      const email = `${normalizeName(contact.firstName)}.${normalizeName(contact.lastName).split(' ')[0]}@cliente${index + 1}.demo.invalid`;
      const saved = await ctx.tx.contact.create({
        data: {
          customerId: customer.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          jobTitle: contact.jobTitle,
          phone: demo.country === 'GT' ? '+502 5500 0000' : '+503 7700 0000',
          email,
          emailNormalized: email.toLowerCase(),
          isActive: !contact.inactive,
        },
      });
      contactIds.push(saved.id);
      bump(ctx, 'contacts');
      if (contact.inactive) bump(ctx, 'contactsInactive');
      if (contact.primary) primaryId = saved.id;
    }
    if (primaryId) {
      await ctx.tx.customer.update({ where: { id: customer.id }, data: { primaryContactId: primaryId } });
      bump(ctx, 'contactsPrimary');
    }
    created.set(key, { id: customer.id, countryId: customer.countryId, owner: demo.owner, contactIds });
  }
  return created;
}

// --- Adjuntos ---------------------------------------------------------------------

/**
 * Filas de los adjuntos demo cuyo binario ya está guardado. Lo sube el
 * responsable del cliente; `owner_type`/`owner_id` quedan nulos (la pertenencia
 * la da `attachments.customer_id`, 00 §2.11).
 */
async function seedAttachments(ctx: Context, customers: Map<string, CreatedCustomer>, attachments: readonly PreparedDemoAttachment[]): Promise<void> {
  for (const [index, file] of attachments.entries()) {
    const customer = need(customers, file.customer, 'cliente demo');
    const uploaderId = user(ctx, customer.owner);
    const createdAt = ctx.clock.at(-(20 - index * 5));
    const stored = await ctx.tx.storedFile.create({
      data: {
        storageKey: file.storageKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
        uploadedById: uploaderId,
        createdAt,
      },
    });
    bump(ctx, 'storedFiles');
    await ctx.tx.attachment.create({
      data: { storedFileId: stored.id, customerId: customer.id, description: file.description, createdById: uploaderId, createdAt },
    });
    bump(ctx, 'attachments');
  }
}

// --- Proyectos -------------------------------------------------------------------

const PHASE_FLOW = ['DISENO', 'COTIZACION', 'CONSTRUCCION', 'FINALIZADO'] as const;
type Phase = (typeof PHASE_FLOW)[number];

interface DemoProject {
  key: string;
  customer: string;
  name: string;
  type: string;
  sector: string;
  phase: Phase;
  progress: number;
  duplicatedFrom?: string;
  /** Días desde la última actividad (alerta si > 30). */
  idleDays: number;
  estimate?: { unit: 'M2'; quantity: string };
}

const PROJECTS: DemoProject[] = [
  { key: 'P1', customer: 'C1', name: 'Residencial Los Pinos (demo)', type: 'VIVIENDA', sector: 'RESIDENCIAL', phase: 'CONSTRUCCION', progress: 45, idleDays: 2, estimate: { unit: 'M2', quantity: '12000' } },
  { key: 'P2', customer: 'C1', name: 'Torre Empresarial Alfa (demo)', type: 'EDIFICIO', sector: 'COMERCIAL', phase: 'COTIZACION', progress: 60, idleDays: 5 },
  { key: 'P3', customer: 'C2', name: 'Bodega Industrial Norte (demo)', type: 'INDUSTRIAL', sector: 'INDUSTRIAL', phase: 'DISENO', progress: 20, idleDays: 45 },
  { key: 'P4', customer: 'C3', name: 'Condominio Vista Verde (demo)', type: 'VIVIENDA', sector: 'RESIDENCIAL', phase: 'DISENO', progress: 10, idleDays: 3, estimate: { unit: 'M2', quantity: '8500' } },
  { key: 'P5', customer: 'C4', name: 'Centro Comercial Sur (demo)', type: 'COMERCIAL', sector: 'COMERCIAL', phase: 'CONSTRUCCION', progress: 70, idleDays: 1 },
  { key: 'P6', customer: 'C4', name: 'Ampliación Centro Comercial Sur (demo)', type: 'COMERCIAL', sector: 'COMERCIAL', phase: 'COTIZACION', progress: 30, idleDays: 4, duplicatedFrom: 'P5' },
  { key: 'P7', customer: 'C5', name: 'Puente Río Claro (demo)', type: 'INFRAESTRUCTURA', sector: 'PUBLICO', phase: 'FINALIZADO', progress: 100, idleDays: 20 },
  { key: 'P8', customer: 'C6', name: 'Planta Procesadora Oriente (demo)', type: 'INDUSTRIAL', sector: 'INDUSTRIAL', phase: 'CONSTRUCCION', progress: 55, idleDays: 2 },
  { key: 'P9', customer: 'C7', name: 'Escuela Municipal Zeta (demo)', type: 'EDIFICIO', sector: 'PUBLICO', phase: 'COTIZACION', progress: 40, idleDays: 6 },
  { key: 'P10', customer: 'C6', name: 'Nave Logística Épsilon (demo)', type: 'INDUSTRIAL', sector: 'MIXTO', phase: 'FINALIZADO', progress: 100, idleDays: 12 },
];

interface CreatedProject {
  id: string;
  /** Código de `crm.tipo_proyecto` (precedencia PROJECT_TYPE de las líneas). */
  type: string;
  customerId: string;
  customerKey: string;
  owner: string;
  country: 'GT' | 'SV';
}

async function seedProjects(ctx: Context, customers: Map<string, CreatedCustomer>): Promise<Map<string, CreatedProject>> {
  const created = new Map<string, CreatedProject>();
  for (const [index, demo] of PROJECTS.entries()) {
    const customer = need(customers, demo.customer, 'cliente');
    const country = CUSTOMERS.find((entry) => entry.key === demo.customer)?.country ?? 'GT';
    const ownerId = user(ctx, customer.owner);

    // Historial: alta en DISENO y un cambio por cada fase hasta la vigente; si solo
    // hay una fase, una actualización de porcentaje (2-4 filas por proyecto).
    const path = PHASE_FLOW.slice(0, PHASE_FLOW.indexOf(demo.phase) + 1);
    const steps: { phase: Phase; progress: number }[] = path.map((phase, step) => ({ phase, progress: step === path.length - 1 ? demo.progress : 100 }));
    if (steps.length === 1) {
      steps.unshift({ phase: demo.phase, progress: 0 });
    } else {
      steps[0] = { phase: 'DISENO', progress: 0 };
      if (steps.length < 4) steps.splice(1, 0, { phase: 'DISENO', progress: 100 });
    }
    const historyStart = -150;
    const changedAt = (step: number): Date => ctx.clock.at(historyStart + Math.round(((-demo.idleDays - historyStart) * step) / Math.max(steps.length - 1, 1)));

    const estimate = demo.estimate
      ? {
          measureUnitId: need(ctx.units, demo.estimate.unit, 'unidad'),
          estimatedQuantity: demo.estimate.quantity,
          conversionRuleId: ctx.projectTypeRule.id,
          conversionFactor: ctx.projectTypeRule.factor,
          estimatedTonnage: D(demo.estimate.quantity).mul(ctx.projectTypeRule.factor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
        }
      : {};

    const project = await ctx.tx.project.create({
      data: {
        code: `DEMO-PRY-${String(index + 1).padStart(4, '0')}`,
        name: demo.name,
        customerId: customer.id,
        countryId: customer.countryId,
        city: country === 'GT' ? 'Guatemala' : 'San Salvador',
        description: 'Proyecto ficticio de demostración.',
        estimatedStartDate: ctx.clock.date(-120),
        estimatedEndDate: ctx.clock.date(240),
        estimatedDecisionDate: ctx.clock.date(30 + index * 7),
        ownerId,
        projectTypeId: item(ctx, 'crm.tipo_proyecto', demo.type),
        sectorId: item(ctx, 'crm.sector_proyecto', demo.sector),
        phaseId: item(ctx, 'crm.fase_cliente', demo.phase),
        phaseProgress: demo.progress,
        phaseUpdatedAt: changedAt(steps.length - 1),
        lastActivityAt: ctx.clock.at(-demo.idleDays),
        duplicatedFromId: demo.duplicatedFrom ? need(created, demo.duplicatedFrom, 'proyecto').id : null,
        createdAt: changedAt(0),
        ...estimate,
      },
    });
    bump(ctx, 'projects');
    bump(ctx, `projectsPhase_${demo.phase}`);

    let previous: { phase: Phase; progress: number } | null = null;
    for (const [step, entry] of steps.entries()) {
      await ctx.tx.projectPhaseHistory.create({
        data: {
          projectId: project.id,
          fromPhaseId: previous ? item(ctx, 'crm.fase_cliente', previous.phase) : null,
          toPhaseId: item(ctx, 'crm.fase_cliente', entry.phase),
          fromProgress: previous ? previous.progress : null,
          toProgress: entry.progress,
          comment: step === 0 ? 'Alta del proyecto' : 'Actualización de fase (demo)',
          changedById: ownerId,
          changedAt: changedAt(step),
        },
      });
      bump(ctx, 'projectPhaseHistory');
      previous = entry;
    }

    created.set(demo.key, { id: project.id, type: demo.type, customerId: customer.id, customerKey: demo.customer, owner: customer.owner, country });
  }
  return created;
}

// --- Oportunidades ---------------------------------------------------------------

interface DemoOpportunity {
  key: string;
  project: string;
  stage: 'CONTACTADO' | 'COTIZANDO' | 'GANADO' | 'PERDIDO';
  amount?: { value: string; currency: 'USD' | 'GTQ' };
  tonnage?: string;
  nextAction?: { text: string; days: number };
  result?: { outcome: 'WON' | 'LOST' | 'PARTIAL'; reason?: string; percent?: number; changedFrom?: { outcome: 'PARTIAL'; percent: number } };
}

const OPPORTUNITIES: DemoOpportunity[] = [
  // Proyecto en construcción con oportunidad abierta: fase y etapa son independientes.
  { key: 'O1', project: 'P1', stage: 'COTIZANDO', amount: { value: '850000', currency: 'GTQ' }, tonnage: '120', nextAction: { text: 'Enviar cotización revisada', days: 5 } },
  // Sin siguiente acción: alerta.
  { key: 'O2', project: 'P2', stage: 'COTIZANDO', amount: { value: '1200000', currency: 'GTQ' }, tonnage: '210' },
  { key: 'O3', project: 'P5', stage: 'GANADO', amount: { value: '2300000', currency: 'GTQ' }, tonnage: '380', result: { outcome: 'WON' } },
  { key: 'O4', project: 'P8', stage: 'GANADO', amount: { value: '450000', currency: 'USD' }, tonnage: '520', result: { outcome: 'PARTIAL', percent: 60, reason: 'COMPETENCIA' } },
  { key: 'O5', project: 'P9', stage: 'PERDIDO', amount: { value: '180000', currency: 'USD' }, result: { outcome: 'LOST', reason: 'PRECIO' } },
  // Resultado cambiado: Parcial 50 % → Ganado (2 filas de historial).
  { key: 'O6', project: 'P7', stage: 'GANADO', amount: { value: '950000', currency: 'GTQ' }, result: { outcome: 'WON', changedFrom: { outcome: 'PARTIAL', percent: 50 } } },
  { key: 'O7', project: 'P4', stage: 'CONTACTADO', nextAction: { text: 'Agendar reunión técnica', days: 3 } },
  { key: 'O8', project: 'P10', stage: 'GANADO', amount: { value: '300000', currency: 'USD' }, tonnage: '410', result: { outcome: 'WON' } },
  { key: 'O9', project: 'P6', stage: 'CONTACTADO', amount: { value: '75000', currency: 'USD' }, nextAction: { text: 'Presentar catálogo de productos', days: 7 } },
  // Siguiente acción vencida.
  { key: 'O10', project: 'P3', stage: 'COTIZANDO', amount: { value: '400000', currency: 'GTQ' }, nextAction: { text: 'Llamar para seguimiento', days: -2 } },
];

const STAGE_PATH: Record<DemoOpportunity['stage'], string[]> = {
  CONTACTADO: ['CONTACTADO'],
  COTIZANDO: ['CONTACTADO', 'COTIZANDO'],
  GANADO: ['CONTACTADO', 'COTIZANDO', 'GANADO'],
  PERDIDO: ['CONTACTADO', 'COTIZANDO', 'PERDIDO'],
};

interface CreatedOpportunity {
  id: string;
  projectId: string;
}

async function seedOpportunities(ctx: Context, projects: Map<string, CreatedProject>): Promise<Map<string, CreatedOpportunity>> {
  const created = new Map<string, CreatedOpportunity>();
  for (const [index, demo] of OPPORTUNITIES.entries()) {
    const project = need(projects, demo.project, 'proyecto');
    const ownerId = user(ctx, project.owner);
    const opportunityDay = -50 + index;
    const stages = STAGE_PATH[demo.stage];
    const stageDay = (step: number): number => opportunityDay + step * 12;
    const lastStageAt = ctx.clock.at(stageDay(stages.length - 1), 11);
    const isClosed = demo.stage === 'GANADO' || demo.stage === 'PERDIDO';

    const opportunity = await ctx.tx.opportunity.create({
      data: {
        code: `DEMO-OPO-${String(index + 1).padStart(4, '0')}`,
        projectId: project.id,
        stageId: item(ctx, 'crm.etapa_oportunidad', demo.stage),
        opportunityDate: ctx.clock.date(opportunityDay),
        ownerId,
        ...(demo.amount ? await estimate(ctx, demo.amount, ctx.clock.date(opportunityDay)) : {}),
        estimatedTonnage: demo.tonnage ?? null,
        description: 'Oportunidad ficticia de demostración.',
        nextAction: demo.nextAction?.text ?? null,
        nextActionDate: demo.nextAction ? ctx.clock.date(demo.nextAction.days) : null,
        stageChangedAt: lastStageAt,
        closedAt: isClosed ? lastStageAt : null,
        createdAt: ctx.clock.at(opportunityDay, 10),
      },
    });
    bump(ctx, 'opportunities');
    bump(ctx, `opportunitiesStage_${demo.stage}`);

    let from: string | null = null;
    for (const [step, stage] of stages.entries()) {
      await ctx.tx.opportunityStageHistory.create({
        data: {
          opportunityId: opportunity.id,
          fromStageId: from ? item(ctx, 'crm.etapa_oportunidad', from) : null,
          toStageId: item(ctx, 'crm.etapa_oportunidad', stage),
          comment: step === 0 ? 'Alta de la oportunidad' : null,
          changedById: ownerId,
          changedAt: ctx.clock.at(stageDay(step), 11),
        },
      });
      bump(ctx, 'opportunityStageHistory');
      from = stage;
    }

    if (demo.result) {
      const decisionDate = ctx.clock.date(stageDay(stages.length - 1));
      const reasonId = demo.result.reason ? item(ctx, 'crm.motivo_resultado', demo.result.reason) : null;
      const awardedPercent = demo.result.percent ?? null;
      await ctx.tx.opportunityResult.create({
        data: {
          opportunityId: opportunity.id,
          outcome: demo.result.outcome,
          reasonId,
          awardedPercent,
          decisionDate,
          comments: 'Resultado ficticio de demostración.',
          recordedById: ownerId,
          recordedAt: lastStageAt,
        },
      });
      bump(ctx, `opportunityResults_${demo.result.outcome}`);

      if (demo.result.changedFrom) {
        await ctx.tx.opportunityResultHistory.create({
          data: {
            opportunityId: opportunity.id,
            action: 'RECORDED',
            outcome: demo.result.changedFrom.outcome,
            awardedPercent: demo.result.changedFrom.percent,
            decisionDate,
            comments: 'Primer registro (demo).',
            changedById: ownerId,
            changedAt: lastStageAt,
          },
        });
        bump(ctx, 'opportunityResultHistory');
      }
      await ctx.tx.opportunityResultHistory.create({
        data: {
          opportunityId: opportunity.id,
          action: demo.result.changedFrom ? 'CHANGED' : 'RECORDED',
          outcome: demo.result.outcome,
          reasonId,
          awardedPercent,
          decisionDate,
          changedById: ownerId,
          changedAt: demo.result.changedFrom ? ctx.clock.at(stageDay(stages.length - 1) + 2, 11) : lastStageAt,
        },
      });
      bump(ctx, 'opportunityResultHistory');
    }

    created.set(demo.key, { id: opportunity.id, projectId: project.id });
  }
  return created;
}

/** Monto + moneda + foto del tipo de cambio + equivalente USD (DM-36, ADR-024). */
async function estimate(
  ctx: Context,
  amount: { value: string; currency: string },
  referenceDate: Date,
): Promise<Pick<Prisma.OpportunityUncheckedCreateInput, 'estimatedAmount' | 'currencyCode' | 'exchangeRate' | 'exchangeRateDate' | 'estimatedAmountUsd'>> {
  if (amount.currency === 'USD') {
    return { estimatedAmount: amount.value, currencyCode: 'USD', exchangeRate: '1', exchangeRateDate: null, estimatedAmountUsd: amount.value };
  }
  const rate = await ctx.tx.exchangeRate.findFirst({
    where: { currencyCode: amount.currency, effectiveDate: { lte: referenceDate } },
    orderBy: { effectiveDate: 'desc' },
  });
  if (!rate) {
    throw new Error(`Semilla demo: sin tipo de cambio ${amount.currency} vigente al ${referenceDate.toISOString().slice(0, 10)}.`);
  }
  return {
    estimatedAmount: amount.value,
    currencyCode: amount.currency,
    exchangeRate: rate.ratePerUsd,
    exchangeRateDate: rate.effectiveDate,
    estimatedAmountUsd: D(amount.value).div(rate.ratePerUsd).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
  };
}

// --- Productos asociados y forecast ----------------------------------------------

/**
 * Regla aplicable a un producto en su unidad base, con la MISMA precedencia que
 * `UnitConversionResolver` para líneas (03 RN-03.58/69): PRODUCT > PRODUCT_FAMILY >
 * PROJECT_TYPE (tipo del proyecto) > GLOBAL. Cada regla solo aplica si convierte
 * desde la unidad de la línea.
 */
function ruleFor(ctx: Context, sku: string, projectType: string): Rule | null {
  const product = need(ctx.products, sku, 'producto');
  const unitId = need(ctx.units, product.baseUnit, 'unidad');
  const projectTypeRule = projectType === DEMO_PROJECT_TYPE_RULE.projectType ? ctx.projectTypeRule : undefined;
  const candidates = [ctx.productRules.get(sku), ctx.familyRules.get(product.familyCode), projectTypeRule, ctx.globalRules.get(product.baseUnit)];
  return candidates.find((rule): rule is Rule => rule !== undefined && rule.fromUnitId === unitId) ?? null;
}

function quantityColumns(
  ctx: Context,
  sku: string,
  quantity: string,
  projectType: string,
): { productId: string; unitId: string; quantity: string; conversionRuleId: string | null; conversionFactor: Decimal | null; tonnage: Decimal | null } {
  const product = need(ctx.products, sku, 'producto');
  const rule = ruleFor(ctx, sku, projectType);
  return {
    productId: product.id,
    unitId: need(ctx.units, product.baseUnit, 'unidad'),
    quantity,
    conversionRuleId: rule?.id ?? null,
    conversionFactor: rule?.factor ?? null,
    tonnage: rule ? D(quantity).mul(rule.factor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP) : null,
  };
}

/**
 * [sku, cantidad, estado, oportunidad?]. Las mallas (m²) solo tienen la regla por tipo
 * `VIVIENDA` (P1, P4): en los demás proyectos quedan "sin conversión" (P8).
 */
const PROJECT_PRODUCTS: Record<string, [string, string, string, string?][]> = {
  P1: [['DEMO-VAR-3', '20000', 'COTIZADO', 'O1'], ['DEMO-VAR-4', '9000', 'COTIZADO', 'O1'], ['DEMO-ALA-16', '1500', 'PROPUESTO'], ['DEMO-MALLA-66', '3000', 'PROPUESTO']],
  P2: [['DEMO-VAR-5', '12000', 'COTIZADO', 'O2'], ['DEMO-VIGA-6', '1800', 'PROPUESTO', 'O2']],
  P3: [['DEMO-VIGA-6', '2500', 'PROPUESTO', 'O10'], ['DEMO-ANG-2', '1200', 'PROPUESTO']],
  P4: [['DEMO-VAR-3', '15000', 'PROPUESTO'], ['DEMO-MALLA-44', '2000', 'PROPUESTO']],
  P5: [['DEMO-VAR-4', '30000', 'ADJUDICADO', 'O3'], ['DEMO-VAR-6', '8000', 'ADJUDICADO', 'O3'], ['DEMO-ALA-18', '2000', 'DESCARTADO']],
  P6: [['DEMO-VAR-4', '6000', 'PROPUESTO', 'O9'], ['DEMO-ANG-2', '600', 'PROPUESTO']],
  P7: [['DEMO-VAR-6', '20000', 'ADJUDICADO', 'O6'], ['DEMO-VIGA-6', '4000', 'ADJUDICADO', 'O6']],
  P8: [['DEMO-VIGA-6', '9000', 'ADJUDICADO', 'O4'], ['DEMO-ANG-2', '5000', 'ADJUDICADO', 'O4'], ['DEMO-MALLA-66', '4000', 'COTIZADO']],
  P9: [['DEMO-VAR-5', '7000', 'DESCARTADO', 'O5'], ['DEMO-ALA-16', '800', 'DESCARTADO', 'O5']],
  P10: [['DEMO-VIGA-6', '7000', 'ADJUDICADO', 'O8'], ['DEMO-VAR-5', '10000', 'ADJUDICADO', 'O8']],
};

async function seedProjectProducts(ctx: Context, projects: Map<string, CreatedProject>, opportunities: Map<string, CreatedOpportunity>): Promise<void> {
  for (const [projectKey, lines] of Object.entries(PROJECT_PRODUCTS)) {
    const project = need(projects, projectKey, 'proyecto');
    for (const [sku, quantity, status, opportunityKey] of lines) {
      const columns = quantityColumns(ctx, sku, quantity, project.type);
      await ctx.tx.projectProduct.create({
        data: {
          projectId: project.id,
          opportunityId: opportunityKey ? need(opportunities, opportunityKey, 'oportunidad').id : null,
          statusId: item(ctx, 'crm.estado_producto_asociado', status),
          notes: columns.conversionRuleId ? null : 'Sin regla de conversión: no suma en toneladas (demo).',
          ...columns,
        },
      });
      bump(ctx, 'projectProducts');
      if (!columns.conversionRuleId) bump(ctx, 'projectProductsWithoutConversion');
    }
  }
}

/** Forecast de 5 proyectos: 3 meses pasados, el actual y M+1…M+6; dos con segundo producto en otra unidad. */
const FORECAST: { project: string; skus: string[]; base: number }[] = [
  { project: 'P1', skus: ['DEMO-VAR-3', 'DEMO-ALA-16'], base: 1800 },
  { project: 'P2', skus: ['DEMO-VAR-5'], base: 900 },
  { project: 'P5', skus: ['DEMO-VAR-4'], base: 2500 },
  { project: 'P8', skus: ['DEMO-VIGA-6', 'DEMO-MALLA-66'], base: 700 },
  { project: 'P9', skus: ['DEMO-VAR-5'], base: 500 },
];

async function seedForecast(ctx: Context, projects: Map<string, CreatedProject>): Promise<void> {
  for (const entry of FORECAST) {
    const project = need(projects, entry.project, 'proyecto');
    for (const [skuIndex, sku] of entry.skus.entries()) {
      for (let offset = -3; offset <= 6; offset += 1) {
        // El segundo producto solo proyecta hacia delante.
        if (skuIndex > 0 && offset <= 0) continue;
        const { year, month } = ctx.clock.month(offset);
        const quantity = String(Math.round(entry.base * (skuIndex > 0 ? 0.3 : 1) * (1 + ((offset + 3) % 4) * 0.15)));
        await ctx.tx.forecastLine.create({
          data: { projectId: project.id, year, month, ownerId: user(ctx, project.owner), notes: offset < 0 ? 'Mes cerrado (histórico demo)' : null, ...quantityColumns(ctx, sku, quantity, project.type) },
        });
        bump(ctx, 'forecastLines');
        if (offset >= 1) bump(ctx, 'forecastLinesFuture');
      }
    }
  }
}

// --- Visitas ----------------------------------------------------------------------

async function seedVisits(ctx: Context, customers: Map<string, CreatedCustomer>, projects: Map<string, CreatedProject>): Promise<void> {
  const tx = ctx.tx;
  const st = (code: string): string => item(ctx, 'crm.estado_visita', code);
  let sequence = 0;

  const create = async (input: {
    customer: string;
    project?: string;
    status: string;
    start: Date;
    original?: Date;
    rescheduleCount?: number;
    extra?: Partial<Prisma.VisitUncheckedCreateInput>;
  }): Promise<{ id: string; customerId: string; ownerId: string; contactIds: string[] }> => {
    sequence += 1;
    const customer = need(customers, input.customer, 'cliente');
    const ownerId = user(ctx, customer.owner);
    const visit = await tx.visit.create({
      data: {
        code: `DEMO-VIS-${String(sequence).padStart(4, '0')}`,
        customerId: customer.id,
        projectId: input.project ? need(projects, input.project, 'proyecto').id : null,
        ownerId,
        statusId: st(input.status),
        scheduledStartAt: input.start,
        scheduledEndAt: new Date(input.start.getTime() + 60 * 60_000),
        objective: 'Visita técnica y comercial (demo).',
        location: 'Oficinas del cliente',
        reminderMinutesBefore: 30,
        originalScheduledAt: input.original ?? input.start,
        rescheduleCount: input.rescheduleCount ?? 0,
        createdAt: ctx.clock.at(-12),
        ...input.extra,
      },
    });
    bump(ctx, 'visits');
    bump(ctx, `visitsStatus_${input.status}`);
    return { id: visit.id, customerId: customer.id, ownerId, contactIds: customer.contactIds };
  };

  const event = async (
    visit: { id: string; ownerId: string },
    eventType: Prisma.VisitEventUncheckedCreateInput['eventType'],
    from: string | null,
    to: string,
    occurredAt: Date,
    extra: Partial<Prisma.VisitEventUncheckedCreateInput> = {},
  ): Promise<void> => {
    await tx.visitEvent.create({
      data: { visitId: visit.id, eventType, fromStatusId: from ? st(from) : null, toStatusId: st(to), performedById: visit.ownerId, occurredAt, ...extra },
    });
    bump(ctx, 'visitEvents');
  };

  // Programada futura (dentro del horizonte de "visitas próximas").
  const planned = await create({ customer: 'C1', project: 'P1', status: 'PROGRAMADA', start: ctx.clock.at(2, 10) });
  await event(planned, 'PLANNED', null, 'PROGRAMADA', ctx.clock.at(-5));
  await tx.interactionParticipant.createMany({
    data: [
      { visitId: planned.id, customerId: planned.customerId, role: 'INVITED', contactId: planned.contactIds[0] },
      { visitId: planned.id, customerId: planned.customerId, role: 'INVITED', userId: user(ctx, 'DEMO-E003') },
    ],
  });
  bump(ctx, 'participants', 2);

  // Reprogramada dos veces: una sola fila, dos eventos RESCHEDULED.
  const original = ctx.clock.at(-1, 10);
  const firstMove = ctx.clock.at(1, 10);
  const secondMove = ctx.clock.at(4, 15);
  const rescheduled = await create({ customer: 'C4', project: 'P5', status: 'REPROGRAMADA', start: secondMove, original, rescheduleCount: 2 });
  await event(rescheduled, 'PLANNED', null, 'PROGRAMADA', ctx.clock.at(-10));
  await event(rescheduled, 'RESCHEDULED', 'PROGRAMADA', 'REPROGRAMADA', ctx.clock.at(-3), {
    previousScheduledStartAt: original,
    newScheduledStartAt: firstMove,
    reasonId: item(ctx, 'crm.motivo_reprogramacion', 'SOLICITUD_CLIENTE'),
  });
  await event(rescheduled, 'RESCHEDULED', 'REPROGRAMADA', 'REPROGRAMADA', ctx.clock.at(-1, 8), {
    previousScheduledStartAt: firstMove,
    newScheduledStartAt: secondMove,
    reasonId: item(ctx, 'crm.motivo_reprogramacion', 'AGENDA_ASESOR'),
    comment: 'Cruce con otra visita.',
  });

  // Realizada hace 4 días y sin confirmar (> 48 h): alerta.
  const doneStart = ctx.clock.at(-4, 10);
  const doneOwner = user(ctx, need(customers, 'C2', 'cliente').owner);
  const done = await create({
    customer: 'C2',
    project: 'P3',
    status: 'REALIZADA',
    start: doneStart,
    extra: {
      actualStartAt: doneStart,
      actualEndAt: ctx.clock.at(-4, 11),
      topics: 'Revisión de planos estructurales.',
      agreements: 'Enviar propuesta preliminar.',
      resultId: item(ctx, 'crm.resultado_interaccion', 'POSITIVO'),
      resultSummary: 'Interés confirmado en varilla y perfiles.',
      nextAction: 'Enviar propuesta preliminar',
      nextActionDate: ctx.clock.date(3),
      completionRecordedById: doneOwner,
      completionRecordedAt: ctx.clock.at(-4, 12),
    },
  });
  await event(done, 'PLANNED', null, 'PROGRAMADA', ctx.clock.at(-8));
  await event(done, 'COMPLETED', 'PROGRAMADA', 'REALIZADA', ctx.clock.at(-4, 12));

  // Confirmada por su propio asesor (DM-20, ck_visits_confirmed_by_owner).
  const confirmedStart = ctx.clock.at(-10, 9);
  const confirmedOwner = user(ctx, need(customers, 'C6', 'cliente').owner);
  const confirmed = await create({
    customer: 'C6',
    project: 'P8',
    status: 'CONFIRMADA',
    start: confirmedStart,
    extra: {
      actualStartAt: confirmedStart,
      actualEndAt: ctx.clock.at(-10, 10, 30),
      topics: 'Avance de obra y programación de entregas.',
      resultId: item(ctx, 'crm.resultado_interaccion', 'POSITIVO'),
      resultSummary: 'Se acuerda calendario de entregas.',
      completionRecordedById: confirmedOwner,
      completionRecordedAt: ctx.clock.at(-10, 12),
      confirmedAt: ctx.clock.at(-9, 9),
      confirmedById: confirmedOwner,
      confirmationSummary: 'Confirmada con el gerente de planta.',
    },
  });
  await event(confirmed, 'PLANNED', null, 'PROGRAMADA', ctx.clock.at(-15));
  await event(confirmed, 'COMPLETED', 'PROGRAMADA', 'REALIZADA', ctx.clock.at(-10, 12));
  await event(confirmed, 'CONFIRMED', 'REALIZADA', 'CONFIRMADA', ctx.clock.at(-9, 9));
  await tx.interactionParticipant.createMany({
    data: [
      { visitId: confirmed.id, customerId: confirmed.customerId, role: 'ATTENDED', contactId: confirmed.contactIds[0] },
      { visitId: confirmed.id, customerId: confirmed.customerId, role: 'ATTENDED', externalName: 'Ingeniero supervisor externo (demo)' },
    ],
  });
  bump(ctx, 'participants', 2);

  // Cancelada con motivo.
  const cancelled = await create({ customer: 'C7', project: 'P9', status: 'CANCELADA', start: ctx.clock.at(6, 10), extra: { cancelledAt: ctx.clock.at(-1, 16) } });
  await event(cancelled, 'PLANNED', null, 'PROGRAMADA', ctx.clock.at(-7));
  await event(cancelled, 'CANCELLED', 'PROGRAMADA', 'CANCELADA', ctx.clock.at(-1, 16), {
    reasonId: item(ctx, 'crm.motivo_cancelacion', 'CANCELA_CLIENTE'),
    comment: 'El cliente pospone la reunión sin fecha.',
  });

  // Programada en el pasado y sin registrar.
  const unregistered = await create({ customer: 'C3', project: 'P4', status: 'PROGRAMADA', start: ctx.clock.at(-2, 15) });
  await event(unregistered, 'PLANNED', null, 'PROGRAMADA', ctx.clock.at(-9));

  // Programada futura en El Salvador, sin proyecto.
  const svPlanned = await create({ customer: 'C6', status: 'PROGRAMADA', start: ctx.clock.at(5, 9) });
  await event(svPlanned, 'PLANNED', null, 'PROGRAMADA', ctx.clock.at(-2));
}

// --- Actividades -------------------------------------------------------------------

async function seedActivities(
  ctx: Context,
  customers: Map<string, CreatedCustomer>,
  projects: Map<string, CreatedProject>,
  opportunities: Map<string, CreatedOpportunity>,
): Promise<void> {
  let sequence = 0;
  const create = async (input: {
    type: 'LLAMADA' | 'REUNION' | 'CORREO' | 'TAREA';
    status: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA' | 'CANCELADA';
    priority: 'ALTA' | 'MEDIA' | 'BAJA';
    customer: string;
    project?: string;
    opportunity?: string;
    subject: string;
    dueAt: Date;
    extra?: Partial<Prisma.ActivityUncheckedCreateInput>;
    bucket: string;
  }): Promise<{ id: string; customerId: string; contactIds: string[]; ownerId: string }> => {
    sequence += 1;
    const customer = need(customers, input.customer, 'cliente');
    const ownerId = user(ctx, customer.owner);
    const activity = await ctx.tx.activity.create({
      data: {
        code: `DEMO-ACT-${String(sequence).padStart(4, '0')}`,
        typeId: item(ctx, 'crm.tipo_actividad', input.type),
        subject: input.subject,
        description: 'Actividad ficticia de demostración.',
        customerId: customer.id,
        projectId: input.project ? need(projects, input.project, 'proyecto').id : null,
        opportunityId: input.opportunity ? need(opportunities, input.opportunity, 'oportunidad').id : null,
        ownerId,
        statusId: item(ctx, 'crm.estado_actividad', input.status),
        priorityId: item(ctx, 'crm.prioridad', input.priority),
        dueAt: input.dueAt,
        createdAt: ctx.clock.at(-14),
        ...input.extra,
      },
    });
    bump(ctx, 'activities');
    bump(ctx, `activitiesStatus_${input.status}`);
    bump(ctx, `activities_${input.bucket}`);
    return { id: activity.id, customerId: customer.id, contactIds: customer.contactIds, ownerId };
  };

  await create({
    type: 'LLAMADA', status: 'PENDIENTE', priority: 'MEDIA', customer: 'C1', project: 'P1', subject: 'Confirmar cantidades de varilla',
    dueAt: ctx.clock.at(5, 17), extra: { scheduledAt: ctx.clock.at(3, 10) }, bucket: 'future',
  });
  const meeting = await create({
    type: 'REUNION', status: 'PENDIENTE', priority: 'ALTA', customer: 'C4', project: 'P5', subject: 'Reunión de programación de entregas',
    dueAt: ctx.clock.at(1, 11), extra: { scheduledAt: ctx.clock.at(1, 10), durationMinutes: 60 }, bucket: 'dueSoon',
  });
  await ctx.tx.interactionParticipant.createMany({
    data: [
      { activityId: meeting.id, customerId: meeting.customerId, role: 'INVITED', contactId: meeting.contactIds[0] },
      { activityId: meeting.id, customerId: meeting.customerId, role: 'INVITED', userId: user(ctx, 'DEMO-E003') },
    ],
  });
  bump(ctx, 'participants', 2);
  await create({ type: 'TAREA', status: 'PENDIENTE', priority: 'ALTA', customer: 'C2', project: 'P3', subject: 'Preparar propuesta preliminar', dueAt: ctx.clock.at(-3, 17), bucket: 'overdue' });
  const emailOwner = user(ctx, need(customers, 'C6', 'cliente').owner);
  await create({
    type: 'CORREO', status: 'COMPLETADA', priority: 'MEDIA', customer: 'C6', project: 'P8', opportunity: 'O4', subject: 'Envío de cotización adjudicada',
    dueAt: ctx.clock.at(-6, 17),
    extra: {
      scheduledAt: ctx.clock.at(-6, 9), summary: 'Se envía la cotización final.', resultId: item(ctx, 'crm.resultado_interaccion', 'POSITIVO'),
      completedAt: ctx.clock.at(-6, 10), completedById: emailOwner, completionComment: 'Cliente acusa recibo.',
    },
    bucket: 'completed',
  });
  await create({ type: 'LLAMADA', status: 'CANCELADA', priority: 'BAJA', customer: 'C7', subject: 'Llamada de presentación', dueAt: ctx.clock.at(-1, 17), extra: { cancelledAt: ctx.clock.at(-2, 9) }, bucket: 'cancelled' });
  await create({ type: 'TAREA', status: 'EN_PROCESO', priority: 'BAJA', customer: 'C3', project: 'P4', subject: 'Recopilar planos del condominio', dueAt: ctx.clock.at(10, 17), bucket: 'future' });
  const reviewOwner = user(ctx, need(customers, 'C1', 'cliente').owner);
  const review = await create({
    type: 'REUNION', status: 'COMPLETADA', priority: 'MEDIA', customer: 'C1', project: 'P2', opportunity: 'O2', subject: 'Revisión técnica de la torre',
    dueAt: ctx.clock.at(-12, 17),
    extra: {
      scheduledAt: ctx.clock.at(-12, 10), durationMinutes: 90, summary: 'Revisión de especificaciones.', resultId: item(ctx, 'crm.resultado_interaccion', 'NEUTRAL'),
      resultNotes: 'Pendiente definir proveedor de perfiles.', completedAt: ctx.clock.at(-12, 12), completedById: reviewOwner,
    },
    bucket: 'completed',
  });
  await ctx.tx.interactionParticipant.create({ data: { activityId: review.id, customerId: review.customerId, role: 'ATTENDED', contactId: review.contactIds[1] } });
  bump(ctx, 'participants');
  await create({ type: 'LLAMADA', status: 'PENDIENTE', priority: 'MEDIA', customer: 'C6', project: 'P10', subject: 'Seguimiento de pago', dueAt: ctx.clock.at(-1, 9), bucket: 'overdue' });
}

// --- Importación -------------------------------------------------------------------

async function seedImport(ctx: Context, customers: Map<string, CreatedCustomer>): Promise<void> {
  const admin = await ctx.tx.userRole.findFirst({ where: { role: { code: 'administrador' } }, select: { userId: true } });
  const startedById = admin?.userId ?? user(ctx, 'DEMO-E001');

  const created = await ctx.tx.customerImport.create({
    data: {
      code: 'DEMO-IMP-0001',
      format: 'XLSX',
      originalFileName: 'clientes-demo.xlsx',
      status: 'COMPLETED_WITH_ERRORS',
      templateVersion: '1',
      totalRows: 10,
      validRows: 7,
      invalidRows: 3,
      importedRows: 7,
      startedById,
      validatedAt: ctx.clock.at(-20, 10),
      confirmedById: startedById,
      confirmedAt: ctx.clock.at(-20, 11),
      completedAt: ctx.clock.at(-20, 11, 5),
      createdAt: ctx.clock.at(-20, 9),
    },
  });
  bump(ctx, 'customerImports');

  const owners = ['DEMO-E005', 'DEMO-E006', 'DEMO-E007'];
  for (let row = 1; row <= 10; row += 1) {
    const legalName = `Cliente Importado Demo ${row}, S.A.`;
    const rawData = { legalName, taxId: `90000${row}-K`, countryCode: row === 8 ? 'XX' : 'GT', city: 'Quetzaltenango', status: 'PROSPECTO' };
    let customerId: string | null = null;
    if (row <= 7) {
      const customer = await ctx.tx.customer.create({
        data: customerRow(
          ctx,
          {
            legalName, tradeName: `Importado Demo ${row}`, country: 'GT', customerCode: null, taxId: rawData.taxId, city: rawData.city,
            companyType: 'FERRETERIA', status: 'PROSPECTO', rating: 'C', owner: owners[row % owners.length] ?? 'DEMO-E005',
          },
          `DEMO-CLI-${String(100 + row).padStart(4, '0')}`,
          { sourceImportId: created.id, createdAt: ctx.clock.at(-20, 11, 5) },
        ),
      });
      customerId = customer.id;
      bump(ctx, 'customers');
      bump(ctx, 'customersImported');
    }

    const status = row <= 7 ? 'IMPORTED' : row === 8 ? 'INVALID' : row === 9 ? 'DUPLICATE_IN_FILE' : 'DUPLICATE_EXISTING';
    await ctx.tx.customerImportRow.create({
      data: {
        importId: created.id,
        rowNumber: row,
        rawData,
        status,
        customerId,
        errors:
          status === 'INVALID'
            ? [{ field: 'countryCode', code: 'INVALID_COUNTRY', message: 'País no reconocido.', severity: 'ERROR' }]
            : status === 'DUPLICATE_IN_FILE'
              ? [{ field: 'taxId', code: 'DUPLICATE_IN_FILE', message: 'Repite la fila 3.', severity: 'ERROR' }]
              : status === 'DUPLICATE_EXISTING'
                ? [{ field: 'legalName', code: 'DUPLICATE_EXISTING', message: 'Ya existe un cliente con esa razón social.', severity: 'ERROR' }]
                : Prisma.JsonNull,
        duplicateOfRowNumber: status === 'DUPLICATE_IN_FILE' ? 3 : null,
        duplicateOfCustomerId: status === 'DUPLICATE_EXISTING' ? need(customers, 'C1', 'cliente').id : null,
      },
    });
    bump(ctx, `importRows_${status}`);
  }
}

async function seedSalesTargets(ctx: Context): Promise<void> {
  const { year, month } = ctx.clock.month(0);
  await ctx.tx.salesTarget.createMany({
    data: [
      { metric: 'TONNAGE', year, month, userId: user(ctx, 'DEMO-E005'), targetValue: '120', notes: `${DEMO_TAG} Meta ilustrativa` },
      { metric: 'TONNAGE', year, month, userId: user(ctx, 'DEMO-E008'), targetValue: '90', notes: `${DEMO_TAG} Meta ilustrativa` },
    ],
  });
  bump(ctx, 'salesTargets', 2);
}
