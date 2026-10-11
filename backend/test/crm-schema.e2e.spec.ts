import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Esquema del CRM (Fase 0) contra PostgreSQL real: cada CHECK, cada FK
 * compuesta y cada regla de unicidad de `00-modelo-de-datos.md` rechaza el dato
 * incorrecto y acepta el correcto; la vista `crm_interactions_v` devuelve
 * visitas y actividades sin duplicados.
 *
 * No depende de la semilla del CRM: los datos mínimos se insertan aquí, con
 * códigos únicos, porque los archivos de pruebas corren en paralelo sobre el
 * mismo esquema. Países con códigos ISO de uso privado (QX, QY) y unidades con
 * código aleatorio para no chocar con lo que siembre la semilla esencial.
 */

const prisma = new PrismaClient();

function code(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function errorText(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.code} ${error.message} ${JSON.stringify(error.meta ?? {})}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** La escritura debe fallar y el error debe nombrar la restricción (o el código de Prisma). */
async function expectViolation(operation: Promise<unknown>, expected: string): Promise<void> {
  const error = await operation.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (error === null) {
    throw new Error(`Se esperaba que ${expected} rechazara la escritura, pero se aceptó.`);
  }
  expect(errorText(error)).toContain(expected);
}

/** Violación de un único: Prisma la traduce a P2002 con las columnas implicadas. */
async function expectUniqueViolation(operation: Promise<unknown>, columns: string[]): Promise<void> {
  const error = await operation.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (error === null) {
    throw new Error(`Se esperaba una violación de unicidad sobre (${columns.join(', ')}).`);
  }
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const known = error as Prisma.PrismaClientKnownRequestError;
  expect(known.code).toBe('P2002');
  const target = JSON.stringify(known.meta ?? {}) + known.message;
  for (const column of columns) {
    expect(target).toContain(column);
  }
}

const DAY = new Date('2026-10-01T00:00:00.000Z');

interface Fixtures {
  owner: string;
  other: string;
  item: Record<
    | 'status'
    | 'phase'
    | 'stage'
    | 'reason'
    | 'visitStatus'
    | 'activityType'
    | 'priority'
    | 'productStatus'
    | 'result'
    | 'projectType',
    string
  >;
  countryX: string;
  countryY: string;
  ton: string;
  kg: string;
  m2: string;
  kgToTon: string;
  tonToTon: string;
  family: string;
  product: string;
  customerA: string;
  customerB: string;
  contactA: string;
  contactB: string;
  projectA: string;
  projectB: string;
  opportunityA: string;
  opportunityB: string;
  visitA: string;
  activityA: string;
  visitEventA: string;
  team: string;
}

let f: Fixtures;

async function createUser(): Promise<string> {
  const email = `crm-${randomUUID()}@integration.test`;
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      firstName: 'Persona',
      lastName: 'CRM',
      displayName: 'Persona CRM',
      status: 'ACTIVE',
    },
  });
  return user.id;
}

function customerData(overrides: Partial<Prisma.CustomerUncheckedCreateInput> = {}): Prisma.CustomerUncheckedCreateInput {
  return {
    crmCode: code('CLI'),
    legalName: 'Constructora de prueba',
    legalNameNormalized: 'constructora de prueba',
    countryId: f.countryX,
    statusId: f.item.status,
    salesOwnerId: f.owner,
    ...overrides,
  };
}

function projectData(overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {}): Prisma.ProjectUncheckedCreateInput {
  return {
    code: code('PRY'),
    name: 'Proyecto de prueba',
    customerId: f.customerA,
    countryId: f.countryX,
    ownerId: f.owner,
    phaseId: f.item.phase,
    ...overrides,
  };
}

function opportunityData(
  overrides: Partial<Prisma.OpportunityUncheckedCreateInput> = {},
): Prisma.OpportunityUncheckedCreateInput {
  return {
    code: code('OPO'),
    projectId: f.projectA,
    stageId: f.item.stage,
    opportunityDate: DAY,
    ownerId: f.owner,
    ...overrides,
  };
}

/** Estimación en moneda local válida: 775 GTQ a 7,75 = 100 USD. */
const GTQ_ESTIMATE = {
  estimatedAmount: '775',
  currencyCode: 'GTQ',
  exchangeRate: '7.75',
  exchangeRateDate: DAY,
  estimatedAmountUsd: '100',
};

function visitData(overrides: Partial<Prisma.VisitUncheckedCreateInput> = {}): Prisma.VisitUncheckedCreateInput {
  return {
    code: code('VIS'),
    customerId: f.customerA,
    ownerId: f.owner,
    statusId: f.item.visitStatus,
    scheduledStartAt: new Date('2026-10-05T15:00:00.000Z'),
    originalScheduledAt: new Date('2026-10-05T15:00:00.000Z'),
    objective: 'Presentar cotización',
    ...overrides,
  };
}

function activityData(
  overrides: Partial<Prisma.ActivityUncheckedCreateInput> = {},
): Prisma.ActivityUncheckedCreateInput {
  return {
    code: code('ACT'),
    typeId: f.item.activityType,
    subject: 'Llamada de seguimiento',
    customerId: f.customerA,
    ownerId: f.owner,
    statusId: f.item.status,
    priorityId: f.item.priority,
    ...overrides,
  };
}

function lineData(overrides: Partial<Prisma.ProjectProductUncheckedCreateInput> = {}): Prisma.ProjectProductUncheckedCreateInput {
  return {
    projectId: f.projectA,
    productId: f.product,
    quantity: '1000',
    unitId: f.kg,
    statusId: f.item.productStatus,
    ...overrides,
  };
}

let forecastMonth = 0;
function forecastData(overrides: Partial<Prisma.ForecastLineUncheckedCreateInput> = {}): Prisma.ForecastLineUncheckedCreateInput {
  // Cada línea en un período distinto para no chocar con el único salvo cuando se busca.
  forecastMonth += 1;
  return {
    projectId: f.projectA,
    productId: f.product,
    year: 2030 + Math.floor(forecastMonth / 12),
    month: (forecastMonth % 12) + 1,
    quantity: '500',
    unitId: f.kg,
    ownerId: f.owner,
    ...overrides,
  };
}

async function newStoredFile(): Promise<string> {
  const file = await prisma.storedFile.create({
    data: {
      storageKey: `2026/10/${randomUUID()}`,
      fileName: 'acta.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    },
  });
  return file.id;
}

beforeAll(async () => {
  const owner = await createUser();
  const other = await createUser();

  const catalog = await prisma.catalog.create({ data: { key: code('test.crm'), name: 'Catálogo de prueba CRM' } });
  const itemNames = [
    'status',
    'phase',
    'stage',
    'reason',
    'visitStatus',
    'activityType',
    'priority',
    'productStatus',
    'result',
    'projectType',
  ] as const;
  const item = {} as Fixtures['item'];
  for (const name of itemNames) {
    const created = await prisma.catalogItem.create({
      data: { catalogId: catalog.id, code: name.toUpperCase(), label: name },
    });
    item[name] = created.id;
  }

  for (const currency of [
    { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
    { code: 'GTQ', name: 'Quetzal', symbol: 'Q' },
  ]) {
    await prisma.currency.upsert({ where: { code: currency.code }, update: {}, create: currency });
  }
  const countryX = await prisma.country.create({ data: { isoCode: 'QX', name: 'País X', currencyCode: 'GTQ' } });
  const countryY = await prisma.country.create({ data: { isoCode: 'QY', name: 'País Y', currencyCode: 'USD' } });

  const unit = (dimension: 'MASS' | 'AREA') =>
    prisma.unitOfMeasure.create({ data: { code: code('U'), name: 'Unidad', symbol: 'u', dimension } });
  const ton = await unit('MASS');
  const kg = await unit('MASS');
  const m2 = await unit('AREA');
  const kgToTon = await prisma.unitConversionRule.create({
    data: { fromUnitId: kg.id, toUnitId: ton.id, factor: '0.001', scope: 'GLOBAL', scopeKey: 'GLOBAL' },
  });
  const tonToTon = await prisma.unitConversionRule.create({
    data: { fromUnitId: ton.id, toUnitId: ton.id, factor: '1', scope: 'GLOBAL', scopeKey: 'GLOBAL' },
  });
  const family = await prisma.productFamily.create({ data: { code: code('FAM'), name: 'Varilla' } });
  const product = await prisma.product.create({
    data: { sku: code('SKU'), description: 'Varilla #4', familyId: family.id, baseUnitId: kg.id },
  });
  const team = await prisma.team.create({ data: { code: code('TEAM'), name: 'Equipo CRM' } });

  f = {
    owner,
    other,
    item,
    countryX: countryX.id,
    countryY: countryY.id,
    ton: ton.id,
    kg: kg.id,
    m2: m2.id,
    kgToTon: kgToTon.id,
    tonToTon: tonToTon.id,
    family: family.id,
    product: product.id,
    team: team.id,
  } as Fixtures;

  f.customerA = (await prisma.customer.create({ data: customerData() })).id;
  f.customerB = (await prisma.customer.create({ data: customerData() })).id;
  f.contactA = (
    await prisma.contact.create({ data: { customerId: f.customerA, firstName: 'Ana', lastName: 'A' } })
  ).id;
  f.contactB = (
    await prisma.contact.create({ data: { customerId: f.customerB, firstName: 'Beto', lastName: 'B' } })
  ).id;
  f.projectA = (await prisma.project.create({ data: projectData() })).id;
  f.projectB = (await prisma.project.create({ data: projectData({ customerId: f.customerB }) })).id;
  f.opportunityA = (await prisma.opportunity.create({ data: opportunityData() })).id;
  f.opportunityB = (await prisma.opportunity.create({ data: opportunityData({ projectId: f.projectB }) })).id;
  f.visitA = (await prisma.visit.create({ data: visitData({ projectId: f.projectA }) })).id;
  f.activityA = (await prisma.activity.create({ data: activityData() })).id;
  f.visitEventA = (
    await prisma.visitEvent.create({
      data: { visitId: f.visitA, eventType: 'PLANNED', toStatusId: f.item.visitStatus, performedById: f.owner },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('users y DataScope (pasos 1 y 2)', () => {
  it('un rol nuevo admite el alcance COUNTRY (antes TERRITORY)', async () => {
    const role = await prisma.role.create({ data: { code: code('rol'), name: 'Rol país', dataScope: 'COUNTRY' } });
    expect(role.dataScope).toBe('COUNTRY');
  });

  it('un usuario nuevo nace con locale es-GT y zona America/Guatemala', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: await createUser() } });
    expect(user.locale).toBe('es-GT');
    expect(user.timeZone).toBe('America/Guatemala');
  });

  it('employee_code es único y country_id apunta a un país', async () => {
    const employeeCode = code('E');
    await prisma.user.update({ where: { id: f.owner }, data: { employeeCode, countryId: f.countryX } });
    await expectUniqueViolation(
      prisma.user.update({ where: { id: f.other }, data: { employeeCode } }),
      ['employee_code'],
    );
    await expectViolation(
      prisma.user.update({ where: { id: f.other }, data: { countryId: randomUUID() } }),
      'users_country_id_fkey',
    );
  });
});

describe('currencies y exchange_rates (ADR-024)', () => {
  it('ck_currencies_code: solo tres letras mayúsculas', async () => {
    await expectViolation(
      prisma.currency.create({ data: { code: 'usd', name: 'Mal', symbol: '$' } }),
      'ck_currencies_code',
    );
    await expect(prisma.currency.create({ data: { code: 'XTS', name: 'Prueba', symbol: 'T', decimals: 4 } })).resolves.toBeDefined();
  });

  it('ck_currencies_decimals: entre 0 y 4', async () => {
    await expectViolation(
      prisma.currency.create({ data: { code: 'XXX', name: 'Mal', symbol: 'X', decimals: 5 } }),
      'ck_currencies_decimals',
    );
  });

  it('ck_exchange_rates_rate: la tasa es > 0', async () => {
    await expectViolation(
      prisma.exchangeRate.create({
        data: { currencyCode: 'GTQ', effectiveDate: new Date('2026-01-01'), ratePerUsd: '0', source: 'prueba' },
      }),
      'ck_exchange_rates_rate',
    );
  });

  it('ck_exchange_rates_not_base: el USD no tiene tasa', async () => {
    await expectViolation(
      prisma.exchangeRate.create({
        data: { currencyCode: 'USD', effectiveDate: new Date('2026-01-02'), ratePerUsd: '1', source: 'prueba' },
      }),
      'ck_exchange_rates_not_base',
    );
  });

  it('uq_exchange_rates_currency_effective_date: una tasa por moneda y fecha', async () => {
    const data = { currencyCode: 'GTQ', effectiveDate: new Date('2026-02-01'), ratePerUsd: '7.75', source: 'prueba' };
    await expect(prisma.exchangeRate.create({ data })).resolves.toBeDefined();
    await expectUniqueViolation(prisma.exchangeRate.create({ data: { ...data, ratePerUsd: '7.8' } }), [
      'currency_code',
      'effective_date',
    ]);
    await expect(
      prisma.exchangeRate.create({ data: { ...data, effectiveDate: new Date('2026-02-02') } }),
    ).resolves.toBeDefined();
  });
});

describe('unit_conversion_rules', () => {
  it('ck_unit_conversion_rules_factor_positive', async () => {
    await expectViolation(
      prisma.unitConversionRule.create({
        data: { fromUnitId: f.kg, toUnitId: f.ton, factor: '0', scope: 'PRODUCT', productId: f.product, scopeKey: f.product },
      }),
      'ck_unit_conversion_rules_factor_positive',
    );
  });

  it('ck_unit_conversion_rules_identity: de una unidad a sí misma solo con factor 1', async () => {
    await expectViolation(
      prisma.unitConversionRule.create({
        data: {
          fromUnitId: f.ton,
          toUnitId: f.ton,
          factor: '2',
          scope: 'PRODUCT_FAMILY',
          productFamilyId: f.family,
          scopeKey: f.family,
        },
      }),
      'ck_unit_conversion_rules_identity',
    );
  });

  it('ck_unit_conversion_rules_scope: scope_key y columna de ámbito coherentes', async () => {
    await expectViolation(
      prisma.unitConversionRule.create({
        data: { fromUnitId: f.m2, toUnitId: f.ton, factor: '0.05', scope: 'GLOBAL', productId: f.product, scopeKey: 'GLOBAL' },
      }),
      'ck_unit_conversion_rules_scope',
    );
    await expectViolation(
      prisma.unitConversionRule.create({
        data: { fromUnitId: f.m2, toUnitId: f.ton, factor: '0.05', scope: 'PRODUCT', productId: f.product, scopeKey: 'GLOBAL' },
      }),
      'ck_unit_conversion_rules_scope',
    );
    await expect(
      prisma.unitConversionRule.create({
        data: { fromUnitId: f.m2, toUnitId: f.ton, factor: '0.05', scope: 'PRODUCT', productId: f.product, scopeKey: f.product },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.unitConversionRule.create({
        data: {
          fromUnitId: f.m2,
          toUnitId: f.ton,
          factor: '0.04',
          scope: 'PROJECT_TYPE',
          projectTypeId: f.item.projectType,
          scopeKey: f.item.projectType,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('uq_unit_conversion_rules_from_to_scope: una regla por origen, destino y ámbito', async () => {
    await expectUniqueViolation(
      prisma.unitConversionRule.create({
        data: { fromUnitId: f.kg, toUnitId: f.ton, factor: '0.002', scope: 'GLOBAL', scopeKey: 'GLOBAL' },
      }),
      ['from_unit_id', 'to_unit_id', 'scope_key'],
    );
  });
});

describe('customers y contacts', () => {
  it('ck_customers_customer_code_normalized: código y normalizado van juntos', async () => {
    await expectViolation(
      prisma.customer.create({ data: customerData({ customerCode: 'C-1' }) }),
      'ck_customers_customer_code_normalized',
    );
  });

  it('ck_customers_tax_id_normalized: NIT y normalizado van juntos', async () => {
    await expectViolation(
      prisma.customer.create({ data: customerData({ taxId: '1234567-8' }) }),
      'ck_customers_tax_id_normalized',
    );
  });

  it('el NIT puede repetirse en el mismo país (DM-4) y el código de cliente no', async () => {
    const taxId = code('NIT');
    const customerCode = code('COD').toUpperCase();
    const first = { taxId, taxIdNormalized: taxId, customerCode, customerCodeNormalized: customerCode };
    await expect(prisma.customer.create({ data: customerData(first) })).resolves.toBeDefined();
    // Otro establecimiento, mismo NIT y país, otro código: se acepta.
    const otherCode = code('COD').toUpperCase();
    await expect(
      prisma.customer.create({
        data: customerData({ taxId, taxIdNormalized: taxId, customerCode: otherCode, customerCodeNormalized: otherCode }),
      }),
    ).resolves.toBeDefined();
    // Mismo código en el mismo país: uq_customers_country_customer_code.
    await expectUniqueViolation(prisma.customer.create({ data: customerData(first) }), [
      'country_id',
      'customer_code_normalized',
    ]);
    // Mismo código en otro país: se acepta (único por país).
    await expect(prisma.customer.create({ data: customerData({ ...first, countryId: f.countryY }) })).resolves.toBeDefined();
    // Sin código: los nulos no colisionan.
    await expect(prisma.customer.create({ data: customerData() })).resolves.toBeDefined();
    await expect(prisma.customer.create({ data: customerData() })).resolves.toBeDefined();
  });

  it('crm_code es único', async () => {
    const crmCode = code('CLI');
    await prisma.customer.create({ data: customerData({ crmCode }) });
    await expectUniqueViolation(prisma.customer.create({ data: customerData({ crmCode }) }), ['crm_code']);
  });

  it('FK compuesta del contacto principal: solo un contacto de ESTE cliente', async () => {
    await expectViolation(
      prisma.customer.update({ where: { id: f.customerA }, data: { primaryContactId: f.contactB } }),
      'customers_primary_contact_id_id_fkey',
    );
    const updated = await prisma.customer.update({ where: { id: f.customerA }, data: { primaryContactId: f.contactA } });
    expect(updated.primaryContactId).toBe(f.contactA);
    // "Como máximo uno" es estructural: cambiar el principal sustituye al anterior.
    const second = await prisma.contact.create({ data: { customerId: f.customerA, firstName: 'Ada', lastName: 'A2' } });
    const replaced = await prisma.customer.update({ where: { id: f.customerA }, data: { primaryContactId: second.id } });
    expect(replaced.primaryContactId).toBe(second.id);
    await prisma.customer.update({ where: { id: f.customerA }, data: { primaryContactId: null } });
  });

  it('uq_contacts_customer_email: el correo no se repite dentro del cliente', async () => {
    const email = `${randomUUID()}@cliente.example.com`;
    const contact = { firstName: 'Carla', lastName: 'C', email, emailNormalized: email };
    await prisma.contact.create({ data: { ...contact, customerId: f.customerA } });
    await expectUniqueViolation(prisma.contact.create({ data: { ...contact, customerId: f.customerA } }), [
      'customer_id',
      'email_normalized',
    ]);
    await expect(prisma.contact.create({ data: { ...contact, customerId: f.customerB } })).resolves.toBeDefined();
    // Sin correo no colisionan.
    await prisma.contact.create({ data: { customerId: f.customerA, firstName: 'Sin', lastName: 'Correo' } });
    await expect(
      prisma.contact.create({ data: { customerId: f.customerA, firstName: 'Sin', lastName: 'Correo' } }),
    ).resolves.toBeDefined();
  });
});

describe('projects y project_phase_history', () => {
  it('ck_projects_phase_progress: 0–100', async () => {
    await expectViolation(prisma.project.create({ data: projectData({ phaseProgress: '100.01' }) }), 'ck_projects_phase_progress');
    await expect(prisma.project.create({ data: projectData({ phaseProgress: '100' }) })).resolves.toBeDefined();
  });

  it('ck_projects_estimated_dates: el fin no precede al inicio', async () => {
    await expectViolation(
      prisma.project.create({
        data: projectData({ estimatedStartDate: new Date('2026-12-01'), estimatedEndDate: new Date('2026-11-30') }),
      }),
      'ck_projects_estimated_dates',
    );
    await expect(
      prisma.project.create({
        data: projectData({ estimatedStartDate: new Date('2026-12-01'), estimatedEndDate: new Date('2026-12-01') }),
      }),
    ).resolves.toBeDefined();
  });

  it('ck_projects_quantity y ck_projects_tonnage: no negativos', async () => {
    await expectViolation(prisma.project.create({ data: projectData({ estimatedQuantity: '-1' }) }), 'ck_projects_quantity');
    await expectViolation(prisma.project.create({ data: projectData({ estimatedTonnage: '-1' }) }), 'ck_projects_tonnage');
    // Estimación manual de tonelaje sin regla: permitida solo en el proyecto (DM-24).
    await expect(prisma.project.create({ data: projectData({ estimatedTonnage: '12.5' }) })).resolves.toBeDefined();
  });

  it('ck_projects_conversion: una regla exige unidad, cantidad y factor', async () => {
    await expectViolation(
      prisma.project.create({
        data: projectData({ measureUnitId: f.kg, conversionRuleId: f.kgToTon, conversionFactor: '0.001' }),
      }),
      'ck_projects_conversion',
    );
    await expect(
      prisma.project.create({
        data: projectData({
          measureUnitId: f.kg,
          estimatedQuantity: '20000',
          conversionRuleId: f.kgToTon,
          conversionFactor: '0.001',
          estimatedTonnage: '20',
        }),
      }),
    ).resolves.toBeDefined();
  });

  it('FK compuesta (regla, unidad): la regla debe convertir desde la unidad del proyecto', async () => {
    await expectViolation(
      prisma.project.create({
        data: projectData({
          measureUnitId: f.m2,
          estimatedQuantity: '100',
          conversionRuleId: f.kgToTon,
          conversionFactor: '0.001',
        }),
      }),
      'projects_conversion_rule_id_measure_unit_id_fkey',
    );
  });

  it('ck_projects_not_self_duplicate', async () => {
    const project = await prisma.project.create({ data: projectData() });
    await expectViolation(
      prisma.project.update({ where: { id: project.id }, data: { duplicatedFromId: project.id } }),
      'ck_projects_not_self_duplicate',
    );
    await expect(prisma.project.create({ data: projectData({ duplicatedFromId: project.id }) })).resolves.toBeDefined();
  });

  it('ck_project_phase_history_progress: 0–100 en ambos extremos', async () => {
    const base = { projectId: f.projectA, toPhaseId: f.item.phase, changedById: f.owner };
    await expectViolation(
      prisma.projectPhaseHistory.create({ data: { ...base, toProgress: '120' } }),
      'ck_project_phase_history_progress',
    );
    await expectViolation(
      prisma.projectPhaseHistory.create({ data: { ...base, toProgress: '50', fromProgress: '-1' } }),
      'ck_project_phase_history_progress',
    );
    await expect(
      prisma.projectPhaseHistory.create({ data: { ...base, fromPhaseId: f.item.phase, fromProgress: '0', toProgress: '50' } }),
    ).resolves.toBeDefined();
  });
});

describe('opportunities (estimación en USD o moneda local, ADR-024)', () => {
  it('acepta sin estimación, en USD (identidad) y en moneda local con su equivalente', async () => {
    await expect(prisma.opportunity.create({ data: opportunityData({ estimatedTonnage: '30' }) })).resolves.toBeDefined();
    await expect(
      prisma.opportunity.create({
        data: opportunityData({ estimatedAmount: '100', currencyCode: 'USD', exchangeRate: '1', estimatedAmountUsd: '100' }),
      }),
    ).resolves.toBeDefined();
    await expect(prisma.opportunity.create({ data: opportunityData(GTQ_ESTIMATE) })).resolves.toBeDefined();
  });

  it('ck_opportunities_amount: monto no negativo', async () => {
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...GTQ_ESTIMATE, estimatedAmount: '-1', estimatedAmountUsd: '0' }) }),
      'ck_opportunities_amount',
    );
  });

  it('ck_opportunities_amount_set: monto, moneda, tasa y USD van juntos', async () => {
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ estimatedAmount: '100' }) }),
      'ck_opportunities_amount_set',
    );
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...GTQ_ESTIMATE, estimatedAmountUsd: null }) }),
      'ck_opportunities_amount_set',
    );
  });

  it('ck_opportunities_exchange_rate: tasa > 0', async () => {
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...GTQ_ESTIMATE, exchangeRate: '0' }) }),
      'ck_opportunities_exchange_rate',
    );
  });

  it('ck_opportunities_amount_usd: equivalente USD no negativo', async () => {
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...GTQ_ESTIMATE, estimatedAmountUsd: '-1' }) }),
      'ck_opportunities_amount_usd',
    );
  });

  it('ck_opportunities_usd_identity: en USD la tasa es 1, sin fecha, y el equivalente es el monto', async () => {
    const usd = { estimatedAmount: '100', currencyCode: 'USD', exchangeRate: '1', estimatedAmountUsd: '100' };
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...usd, estimatedAmountUsd: '99' }) }),
      'ck_opportunities_usd_identity',
    );
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...usd, exchangeRate: '7.75' }) }),
      'ck_opportunities_usd_identity',
    );
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...usd, exchangeRateDate: DAY }) }),
      'ck_opportunities_usd_identity',
    );
  });

  it('ck_opportunities_rate_date: la moneda local exige la fecha de la tasa aplicada', async () => {
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...GTQ_ESTIMATE, exchangeRateDate: null }) }),
      'ck_opportunities_rate_date',
    );
  });

  it('ck_opportunities_tonnage: no negativo', async () => {
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ estimatedTonnage: '-0.5' }) }),
      'ck_opportunities_tonnage',
    );
  });

  it('currency_code es FK a currencies', async () => {
    await expectViolation(
      prisma.opportunity.create({ data: opportunityData({ ...GTQ_ESTIMATE, currencyCode: 'ZZZ' }) }),
      'opportunities_currency_code_fkey',
    );
  });
});

describe('opportunity_results y opportunity_result_history', () => {
  async function newOpportunity(): Promise<string> {
    return (await prisma.opportunity.create({ data: opportunityData() })).id;
  }
  function result(opportunityId: string, overrides: Partial<Prisma.OpportunityResultUncheckedCreateInput>) {
    return prisma.opportunityResult.create({
      data: { opportunityId, outcome: 'WON', decisionDate: DAY, recordedById: f.owner, ...overrides },
    });
  }

  it('ck_opportunity_results_lost_reason: LOST exige motivo', async () => {
    const id = await newOpportunity();
    await expectViolation(result(id, { outcome: 'LOST' }), 'ck_opportunity_results_lost_reason');
    await expect(result(id, { outcome: 'LOST', reasonId: f.item.reason })).resolves.toBeDefined();
  });

  it('ck_opportunity_results_partial_percent: PARTIAL exige porcentaje adjudicado', async () => {
    const id = await newOpportunity();
    await expectViolation(result(id, { outcome: 'PARTIAL' }), 'ck_opportunity_results_partial_percent');
    await expect(result(id, { outcome: 'PARTIAL', awardedPercent: '60' })).resolves.toBeDefined();
  });

  it('ck_opportunity_results_percent_range: 0–100', async () => {
    const id = await newOpportunity();
    await expectViolation(result(id, { outcome: 'PARTIAL', awardedPercent: '101' }), 'ck_opportunity_results_percent_range');
    await expect(result(id, { outcome: 'WON' })).resolves.toBeDefined();
  });

  it('un solo resultado vigente por oportunidad', async () => {
    const id = await newOpportunity();
    await result(id, { outcome: 'WON' });
    await expectUniqueViolation(result(id, { outcome: 'WON' }), ['opportunity_id']);
  });

  it('ck_opportunity_result_history_payload: registrar/cambiar exige un resultado completo; anular no', async () => {
    const base = { opportunityId: f.opportunityA, changedById: f.owner };
    await expectViolation(
      prisma.opportunityResultHistory.create({ data: { ...base, action: 'RECORDED' } }),
      'ck_opportunity_result_history_payload',
    );
    await expectViolation(
      prisma.opportunityResultHistory.create({ data: { ...base, action: 'RECORDED', outcome: 'LOST', decisionDate: DAY } }),
      'ck_opportunity_result_history_payload',
    );
    await expectViolation(
      prisma.opportunityResultHistory.create({ data: { ...base, action: 'CHANGED', outcome: 'PARTIAL', decisionDate: DAY } }),
      'ck_opportunity_result_history_payload',
    );
    await expect(
      prisma.opportunityResultHistory.create({
        data: { ...base, action: 'RECORDED', outcome: 'LOST', reasonId: f.item.reason, decisionDate: DAY },
      }),
    ).resolves.toBeDefined();
    await expect(prisma.opportunityResultHistory.create({ data: { ...base, action: 'CLEARED' } })).resolves.toBeDefined();
  });

  it('ck_opportunity_result_history_percent: 0–100', async () => {
    await expectViolation(
      prisma.opportunityResultHistory.create({
        data: { opportunityId: f.opportunityA, changedById: f.owner, action: 'CLEARED', awardedPercent: '150' },
      }),
      'ck_opportunity_result_history_percent',
    );
  });
});

describe('project_products (tonelaje solo con regla)', () => {
  it('acepta una línea con regla y tonelaje, y otra sin regla ni tonelaje', async () => {
    await expect(
      prisma.projectProduct.create({
        data: lineData({ conversionRuleId: f.kgToTon, conversionFactor: '0.001', tonnage: '1', opportunityId: f.opportunityA }),
      }),
    ).resolves.toBeDefined();
    await expect(prisma.projectProduct.create({ data: lineData({ unitId: f.m2 }) })).resolves.toBeDefined();
  });

  it('ck_project_products_quantity: no negativa', async () => {
    await expectViolation(prisma.projectProduct.create({ data: lineData({ quantity: '-1' }) }), 'ck_project_products_quantity');
  });

  it('ck_project_products_tonnage: no negativo', async () => {
    await expectViolation(
      prisma.projectProduct.create({
        data: lineData({ conversionRuleId: f.kgToTon, conversionFactor: '0.001', tonnage: '-1' }),
      }),
      'ck_project_products_tonnage',
    );
  });

  it('ck_project_products_conversion: tonelaje y factor existen solo con regla', async () => {
    await expectViolation(prisma.projectProduct.create({ data: lineData({ tonnage: '1' }) }), 'ck_project_products_conversion');
    await expectViolation(
      prisma.projectProduct.create({ data: lineData({ conversionRuleId: f.kgToTon, tonnage: '1' }) }),
      'ck_project_products_conversion',
    );
  });

  it('FK compuesta (regla, unidad): no se aplica una regla de otra unidad', async () => {
    await expectViolation(
      prisma.projectProduct.create({
        data: lineData({ unitId: f.m2, conversionRuleId: f.kgToTon, conversionFactor: '0.001', tonnage: '1' }),
      }),
      'project_products_conversion_rule_id_unit_id_fkey',
    );
  });

  it('FK compuesta (oportunidad, proyecto): la oportunidad debe ser del mismo proyecto', async () => {
    await expectViolation(
      prisma.projectProduct.create({ data: lineData({ opportunityId: f.opportunityB }) }),
      'project_products_opportunity_id_project_id_fkey',
    );
  });
});

describe('forecast_lines', () => {
  it('ck_forecast_lines_month y ck_forecast_lines_year', async () => {
    await expectViolation(prisma.forecastLine.create({ data: forecastData({ month: 13 }) }), 'ck_forecast_lines_month');
    await expectViolation(prisma.forecastLine.create({ data: forecastData({ month: 0 }) }), 'ck_forecast_lines_month');
    await expectViolation(prisma.forecastLine.create({ data: forecastData({ year: 1999 }) }), 'ck_forecast_lines_year');
  });

  it('ck_forecast_lines_quantity: cantidad ≥ 0 (0 es "quitar" la proyección)', async () => {
    await expectViolation(prisma.forecastLine.create({ data: forecastData({ quantity: '-1' }) }), 'ck_forecast_lines_quantity');
    await expect(prisma.forecastLine.create({ data: forecastData({ quantity: '0' }) })).resolves.toBeDefined();
  });

  it('ck_forecast_lines_tonnage y ck_forecast_lines_conversion', async () => {
    await expectViolation(
      prisma.forecastLine.create({ data: forecastData({ conversionRuleId: f.kgToTon, conversionFactor: '0.001', tonnage: '-1' }) }),
      'ck_forecast_lines_tonnage',
    );
    await expectViolation(prisma.forecastLine.create({ data: forecastData({ tonnage: '0.5' }) }), 'ck_forecast_lines_conversion');
    await expect(
      prisma.forecastLine.create({ data: forecastData({ conversionRuleId: f.kgToTon, conversionFactor: '0.001', tonnage: '0.5' }) }),
    ).resolves.toBeDefined();
    // La identidad TON->TON permite tonelaje en líneas medidas en toneladas.
    await expect(
      prisma.forecastLine.create({
        data: forecastData({ unitId: f.ton, quantity: '3', conversionRuleId: f.tonToTon, conversionFactor: '1', tonnage: '3' }),
      }),
    ).resolves.toBeDefined();
  });

  it('FK compuesta (regla, unidad) en el forecast', async () => {
    await expectViolation(
      prisma.forecastLine.create({
        data: forecastData({ unitId: f.m2, conversionRuleId: f.kgToTon, conversionFactor: '0.001', tonnage: '1' }),
      }),
      'forecast_lines_conversion_rule_id_unit_id_fkey',
    );
  });

  it('uq_forecast_lines_project_product_period: una línea por proyecto, producto, año y mes', async () => {
    const period = { year: 2040, month: 6 };
    await prisma.forecastLine.create({ data: forecastData(period) });
    await expectUniqueViolation(prisma.forecastLine.create({ data: forecastData(period) }), [
      'project_id',
      'product_id',
      'year',
      'month',
    ]);
    await expect(prisma.forecastLine.create({ data: forecastData({ year: 2040, month: 7 }) })).resolves.toBeDefined();
    await expect(prisma.forecastLine.create({ data: forecastData({ ...period, projectId: f.projectB }) })).resolves.toBeDefined();
  });
});

describe('visits y visit_events', () => {
  const start = new Date('2026-10-06T15:00:00.000Z');
  const before = new Date('2026-10-06T14:00:00.000Z');
  const after = new Date('2026-10-06T16:00:00.000Z');

  it('ck_visits_scheduled_range', async () => {
    await expectViolation(
      prisma.visit.create({ data: visitData({ scheduledStartAt: start, scheduledEndAt: before }) }),
      'ck_visits_scheduled_range',
    );
    await expect(prisma.visit.create({ data: visitData({ scheduledStartAt: start, scheduledEndAt: after }) })).resolves.toBeDefined();
  });

  it('ck_visits_actual_range: el fin real exige inicio real y no lo precede', async () => {
    await expectViolation(prisma.visit.create({ data: visitData({ actualEndAt: after }) }), 'ck_visits_actual_range');
    await expectViolation(
      prisma.visit.create({ data: visitData({ actualStartAt: start, actualEndAt: before }) }),
      'ck_visits_actual_range',
    );
  });

  it('ck_visits_confirm_requires: confirmar exige realización previa y un resumen', async () => {
    await expectViolation(
      prisma.visit.create({
        data: visitData({ confirmedAt: after, confirmedById: f.owner, confirmationSummary: 'Acordado' }),
      }),
      'ck_visits_confirm_requires',
    );
    await expectViolation(
      prisma.visit.create({ data: visitData({ actualStartAt: start, confirmedAt: after, confirmedById: f.owner }) }),
      'ck_visits_confirm_requires',
    );
  });

  it('ck_visits_confirmed_by_owner: confirma el propio asesor dueño (DM-20)', async () => {
    const realized = { actualStartAt: start, actualEndAt: after, confirmedAt: after, confirmationSummary: 'Acordado' };
    await expectViolation(
      prisma.visit.create({ data: visitData({ ...realized, confirmedById: f.other }) }),
      'ck_visits_confirmed_by_owner',
    );
    await expect(prisma.visit.create({ data: visitData({ ...realized, confirmedById: f.owner }) })).resolves.toBeDefined();
  });

  it('ck_visits_reschedule_count y ck_visits_reminder: no negativos', async () => {
    await expectViolation(prisma.visit.create({ data: visitData({ rescheduleCount: -1 }) }), 'ck_visits_reschedule_count');
    await expectViolation(prisma.visit.create({ data: visitData({ reminderMinutesBefore: -5 }) }), 'ck_visits_reminder');
    await expect(prisma.visit.create({ data: visitData({ reminderMinutesBefore: 30 }) })).resolves.toBeDefined();
  });

  it('FK compuesta (proyecto, cliente): el proyecto debe ser del cliente de la visita', async () => {
    await expectViolation(
      prisma.visit.create({ data: visitData({ projectId: f.projectB }) }),
      'visits_project_id_customer_id_fkey',
    );
  });

  it('cambiar el cliente de un proyecto con visitas queda bloqueado (ON UPDATE RESTRICT)', async () => {
    const project = await prisma.project.create({ data: projectData() });
    await prisma.visit.create({ data: visitData({ projectId: project.id }) });
    await expectViolation(
      prisma.project.update({ where: { id: project.id }, data: { customerId: f.customerB } }),
      'visits_project_id_customer_id_fkey',
    );
  });

  it('ck_visit_events_reschedule: reprogramar guarda fecha anterior y nueva', async () => {
    const base = { visitId: f.visitA, toStatusId: f.item.visitStatus, performedById: f.owner };
    await expectViolation(
      prisma.visitEvent.create({ data: { ...base, eventType: 'RESCHEDULED', reasonText: 'Cliente pidió cambio' } }),
      'ck_visit_events_reschedule',
    );
    await expect(
      prisma.visitEvent.create({
        data: {
          ...base,
          eventType: 'RESCHEDULED',
          reasonId: f.item.reason,
          previousScheduledStartAt: start,
          newScheduledStartAt: after,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('ck_visit_events_reason: reprogramar o cancelar exige motivo', async () => {
    const base = { visitId: f.visitA, toStatusId: f.item.visitStatus, performedById: f.owner };
    await expectViolation(prisma.visitEvent.create({ data: { ...base, eventType: 'CANCELLED' } }), 'ck_visit_events_reason');
    await expectViolation(
      prisma.visitEvent.create({
        data: { ...base, eventType: 'RESCHEDULED', previousScheduledStartAt: start, newScheduledStartAt: after },
      }),
      'ck_visit_events_reason',
    );
    await expect(
      prisma.visitEvent.create({ data: { ...base, eventType: 'CANCELLED', reasonText: 'Proyecto suspendido' } }),
    ).resolves.toBeDefined();
    await expect(prisma.visitEvent.create({ data: { ...base, eventType: 'COMPLETED' } })).resolves.toBeDefined();
  });
});

describe('activities', () => {
  it('ck_activities_opportunity_needs_project', async () => {
    await expectViolation(
      prisma.activity.create({ data: activityData({ opportunityId: f.opportunityA }) }),
      'ck_activities_opportunity_needs_project',
    );
    await expect(
      prisma.activity.create({ data: activityData({ projectId: f.projectA, opportunityId: f.opportunityA }) }),
    ).resolves.toBeDefined();
  });

  it('ck_activities_duration: no negativa', async () => {
    await expectViolation(prisma.activity.create({ data: activityData({ durationMinutes: -1 }) }), 'ck_activities_duration');
  });

  it('ck_activities_completion: completar exige quién y un resultado', async () => {
    const completedAt = new Date('2026-10-07T10:00:00.000Z');
    await expectViolation(
      prisma.activity.create({ data: activityData({ completedAt, resultNotes: 'Hecho' }) }),
      'ck_activities_completion',
    );
    await expectViolation(
      prisma.activity.create({ data: activityData({ completedAt, completedById: f.owner }) }),
      'ck_activities_completion',
    );
    await expect(
      prisma.activity.create({ data: activityData({ completedAt, completedById: f.owner, resultId: f.item.result }) }),
    ).resolves.toBeDefined();
    await expect(
      prisma.activity.create({ data: activityData({ completedAt, completedById: f.owner, resultNotes: 'Acordó visita' }) }),
    ).resolves.toBeDefined();
  });

  it('FK compuestas: proyecto del cliente y oportunidad del proyecto', async () => {
    await expectViolation(
      prisma.activity.create({ data: activityData({ projectId: f.projectB }) }),
      'activities_project_id_customer_id_fkey',
    );
    await expectViolation(
      prisma.activity.create({ data: activityData({ projectId: f.projectA, opportunityId: f.opportunityB }) }),
      'activities_opportunity_id_project_id_fkey',
    );
  });
});

describe('interaction_participants', () => {
  it('acepta un contacto del mismo cliente, un usuario o un externo', async () => {
    await expect(
      prisma.interactionParticipant.create({ data: { visitId: f.visitA, customerId: f.customerA, contactId: f.contactA } }),
    ).resolves.toBeDefined();
    await expect(
      prisma.interactionParticipant.create({ data: { activityId: f.activityA, customerId: f.customerA, userId: f.other } }),
    ).resolves.toBeDefined();
    await expect(
      prisma.interactionParticipant.create({
        data: { visitId: f.visitA, customerId: f.customerA, externalName: 'Ingeniero residente', role: 'ATTENDED' },
      }),
    ).resolves.toBeDefined();
  });

  it('ck_interaction_participants_parent: exactamente una visita o una actividad', async () => {
    await expectViolation(
      prisma.interactionParticipant.create({ data: { customerId: f.customerA, externalName: 'X' } }),
      'ck_interaction_participants_parent',
    );
    await expectViolation(
      prisma.interactionParticipant.create({
        data: { visitId: f.visitA, activityId: f.activityA, customerId: f.customerA, externalName: 'X' },
      }),
      'ck_interaction_participants_parent',
    );
  });

  it('ck_interaction_participants_subject: exactamente un contacto, usuario o nombre externo', async () => {
    await expectViolation(
      prisma.interactionParticipant.create({ data: { visitId: f.visitA, customerId: f.customerA } }),
      'ck_interaction_participants_subject',
    );
    await expectViolation(
      prisma.interactionParticipant.create({
        data: { visitId: f.visitA, customerId: f.customerA, contactId: f.contactA, userId: f.owner },
      }),
      'ck_interaction_participants_subject',
    );
  });

  it('FK compuestas: el contacto y la visita deben ser del mismo cliente', async () => {
    await expectViolation(
      prisma.interactionParticipant.create({ data: { visitId: f.visitA, customerId: f.customerA, contactId: f.contactB } }),
      'interaction_participants_contact_id_customer_id_fkey',
    );
    await expectViolation(
      prisma.interactionParticipant.create({ data: { visitId: f.visitA, customerId: f.customerB, externalName: 'X' } }),
      'interaction_participants_visit_id_customer_id_fkey',
    );
    await expectViolation(
      prisma.interactionParticipant.create({ data: { activityId: f.activityA, customerId: f.customerB, externalName: 'X' } }),
      'interaction_participants_activity_id_customer_id_fkey',
    );
  });
});

describe('attachments', () => {
  it('ck_attachments_single_owner: exactamente un dueño', async () => {
    await expectViolation(
      prisma.attachment.create({ data: { storedFileId: await newStoredFile() } }),
      'ck_attachments_single_owner',
    );
    await expectViolation(
      prisma.attachment.create({ data: { storedFileId: await newStoredFile(), customerId: f.customerA, projectId: f.projectA } }),
      'ck_attachments_single_owner',
    );
    await expect(
      prisma.attachment.create({ data: { storedFileId: await newStoredFile(), customerId: f.customerA } }),
    ).resolves.toBeDefined();
    await expect(
      prisma.attachment.create({ data: { storedFileId: await newStoredFile(), visitEventId: f.visitEventA } }),
    ).resolves.toBeDefined();
  });

  it('un archivo pertenece a un solo vínculo', async () => {
    const storedFileId = await newStoredFile();
    await prisma.attachment.create({ data: { storedFileId, activityId: f.activityA } });
    await expectUniqueViolation(prisma.attachment.create({ data: { storedFileId, visitId: f.visitA } }), [
      'stored_file_id',
    ]);
  });
});

describe('customer_imports y customer_import_rows', () => {
  function importData(overrides: Partial<Prisma.CustomerImportUncheckedCreateInput> = {}) {
    return {
      code: code('IMP'),
      format: 'CSV' as const,
      originalFileName: 'clientes.csv',
      startedById: f.owner,
      ...overrides,
    };
  }

  it('ck_customer_imports_counters: contadores coherentes', async () => {
    await expectViolation(
      prisma.customerImport.create({ data: importData({ totalRows: 5, validRows: 4, invalidRows: 2 }) }),
      'ck_customer_imports_counters',
    );
    await expectViolation(
      prisma.customerImport.create({ data: importData({ totalRows: 5, validRows: 2, importedRows: 3 }) }),
      'ck_customer_imports_counters',
    );
    await expectViolation(prisma.customerImport.create({ data: importData({ totalRows: -1 }) }), 'ck_customer_imports_counters');
    await expect(
      prisma.customerImport.create({ data: importData({ totalRows: 10, validRows: 8, invalidRows: 2, importedRows: 7 }) }),
    ).resolves.toBeDefined();
  });

  it('ck_customer_import_rows_row_number, ck_customer_import_rows_imported y único por fila', async () => {
    const created = await prisma.customerImport.create({ data: importData() });
    const row = (overrides: Partial<Prisma.CustomerImportRowUncheckedCreateInput>) =>
      prisma.customerImportRow.create({ data: { importId: created.id, rowNumber: 1, rawData: {}, ...overrides } });

    await expectViolation(row({ rowNumber: 0 }), 'ck_customer_import_rows_row_number');
    await expectViolation(row({ status: 'IMPORTED' }), 'ck_customer_import_rows_imported');
    await expectViolation(row({ status: 'VALID', customerId: f.customerA }), 'ck_customer_import_rows_imported');
    await expect(row({ status: 'IMPORTED', customerId: f.customerA })).resolves.toBeDefined();
    await expectUniqueViolation(row({ status: 'INVALID' }), ['import_id', 'row_number']);
    await expect(
      row({ rowNumber: 2, status: 'VALID', errors: [{ field: 'taxId', code: 'DUPLICATE_TAX_ID', severity: 'WARNING' }] }),
    ).resolves.toBeDefined();
  });
});

describe('sales_targets (DM-9)', () => {
  const base = { metric: 'TONNAGE' as const, year: 2027, targetValue: '120' };

  it('ck_sales_targets_subject: exactamente un sujeto (usuario, equipo o país)', async () => {
    await expectViolation(prisma.salesTarget.create({ data: { ...base, month: 1 } }), 'ck_sales_targets_subject');
    await expectViolation(
      prisma.salesTarget.create({ data: { ...base, month: 1, userId: f.owner, teamId: f.team } }),
      'ck_sales_targets_subject',
    );
    await expect(prisma.salesTarget.create({ data: { ...base, month: 1, userId: f.owner } })).resolves.toBeDefined();
    await expect(
      prisma.salesTarget.create({ data: { ...base, countryId: f.countryX, productFamilyId: f.family } }),
    ).resolves.toBeDefined();
  });

  it('ck_sales_targets_month y ck_sales_targets_value', async () => {
    await expectViolation(prisma.salesTarget.create({ data: { ...base, month: 13, teamId: f.team } }), 'ck_sales_targets_month');
    await expectViolation(
      prisma.salesTarget.create({ data: { ...base, month: 2, teamId: f.team, targetValue: '-1' } }),
      'ck_sales_targets_value',
    );
  });
});

describe('vista crm_interactions_v (00 §2.12)', () => {
  interface InteractionRow {
    source_type: string;
    source_id: string;
    occurred_at: Date;
    subject: string;
  }

  it('devuelve cada visita y cada actividad una sola vez, sin las actividades eliminadas', async () => {
    const customer = await prisma.customer.create({ data: customerData() });
    const contact = await prisma.contact.create({ data: { customerId: customer.id, firstName: 'Vera', lastName: 'V' } });
    const scheduled = new Date('2026-10-08T15:00:00.000Z');
    const visit = await prisma.visit.create({
      data: visitData({ customerId: customer.id, scheduledStartAt: scheduled, originalScheduledAt: scheduled }),
    });
    // Reprogramar NO crea otra visita: actualiza la fila y deja un evento.
    const rescheduled = new Date('2026-10-09T15:00:00.000Z');
    await prisma.visit.update({ where: { id: visit.id }, data: { scheduledStartAt: rescheduled, rescheduleCount: 1 } });
    await prisma.visitEvent.create({
      data: {
        visitId: visit.id,
        eventType: 'RESCHEDULED',
        toStatusId: f.item.visitStatus,
        previousScheduledStartAt: scheduled,
        newScheduledStartAt: rescheduled,
        reasonText: 'Agenda del cliente',
        performedById: f.owner,
      },
    });
    // Varios participantes no multiplican la interacción.
    await prisma.interactionParticipant.createMany({
      data: [
        { visitId: visit.id, customerId: customer.id, contactId: contact.id },
        { visitId: visit.id, customerId: customer.id, userId: f.other },
      ],
    });
    const activity = await prisma.activity.create({
      data: activityData({ customerId: customer.id, dueAt: new Date('2026-10-10T18:00:00.000Z'), summary: 'Resumen' }),
    });
    await prisma.activity.create({
      data: activityData({ customerId: customer.id, subject: 'Eliminada', deletedAt: new Date() }),
    });

    const rows = await prisma.$queryRaw<InteractionRow[]>`
      SELECT source_type, source_id, occurred_at, subject
        FROM crm_interactions_v
       WHERE customer_id = ${customer.id}::uuid
       ORDER BY occurred_at`;

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.source_type, row.source_id])).toEqual([
      ['VISIT', visit.id],
      ['ACTIVITY', activity.id],
    ]);
    expect(rows[0]?.occurred_at.toISOString()).toBe(rescheduled.toISOString());
    expect(rows[1]?.subject).toBe('Llamada de seguimiento');
  });

  it('la fecha de la interacción es la real cuando existe', async () => {
    const actual = new Date('2026-10-05T16:30:00.000Z');
    const visit = await prisma.visit.create({ data: visitData({ actualStartAt: actual }) });
    const rows = await prisma.$queryRaw<InteractionRow[]>`
      SELECT source_type, source_id, occurred_at, subject FROM crm_interactions_v WHERE source_id = ${visit.id}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.occurred_at.toISOString()).toBe(actual.toISOString());
  });
});
