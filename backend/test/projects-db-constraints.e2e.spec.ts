import { Prisma } from '@prisma/client';

import {
  catalogItemId,
  crmUser,
  insertActivity,
  insertConversionRule,
  insertCustomer,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  insertUnit,
  insertVisit,
  testCountry,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Restricciones de base de datos de las que depende el Módulo 3, etapa E2a (03 D.6;
 * PF-03.8, PF-03.45, PF-03.51, PF-03.85): cada CHECK, FK compuesta y único de
 * `projects`, `project_phase_history` y `project_products` rechaza el dato inválido
 * con SQL directo (sin pasar por la API) y el error nombra la restricción.
 * `crm-schema.e2e.spec.ts` ya prueba el esquema de la Fase 0 con datos propios; aquí
 * se verifica desde el módulo, sobre registros creados con los ayudantes del CRM y
 * con las sentencias que el adaptador podría llegar a emitir (`UPDATE`).
 * Países propios `R5` y `R6`.
 */

let context: TestContext;
let r5: string;
let fx: {
  ownerId: string;
  customerA: string;
  customerB: string;
  projectP: string;
  projectQ: string;
  codeQ: string;
  unitFrom: string;
  unitOther: string;
  ruleFrom: string;
  ruleOther: string;
  phaseId: string;
  opportunityP: string;
  opportunityQ: string;
  productId: string;
};

function errorText(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `${error.code} ${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return error instanceof Error ? error.message : String(error);
}

/** La escritura falla y el error de PostgreSQL nombra la restricción. Local: candidato a crm-fixtures. */
async function expectViolation(operation: Promise<unknown>, constraint: string): Promise<void> {
  const outcome = await operation.then(
    () => ({ accepted: true as const }),
    (error: unknown) => ({ accepted: false as const, error }),
  );
  if (outcome.accepted) throw new Error(`Se esperaba que ${constraint} rechazara la escritura, pero se aceptó.`);
  expect(errorText(outcome.error)).toContain(constraint);
}

beforeAll(async () => {
  context = await createTestContext();
  const prisma = context.prisma;
  r5 = await testCountry(prisma, 'R5', { name: 'Proyectos BD Cinco' });
  const r6 = await testCountry(prisma, 'R6', { name: 'Proyectos BD Seis' });
  const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: r5 });
  const customerA = await insertCustomer(prisma, { salesOwnerId: owner.id, countryId: r5 });
  const customerB = await insertCustomer(prisma, { salesOwnerId: owner.id, countryId: r6 });
  const projectP = await insertProject(prisma, { customerId: customerA.id, ownerId: owner.id, countryId: r5 });
  const projectQ = await insertProject(prisma, { customerId: customerB.id, ownerId: owner.id, countryId: r6 });
  const unitFrom = await insertUnit(prisma, { dimension: 'MASS' });
  const unitOther = await insertUnit(prisma, { dimension: 'AREA' });
  const family = await insertProductFamily(prisma);
  const product = await insertProduct(prisma, { familyId: family, baseUnitId: unitFrom.id });
  fx = {
    ownerId: owner.id,
    customerA: customerA.id,
    customerB: customerB.id,
    projectP,
    projectQ,
    codeQ: (await prisma.project.findUniqueOrThrow({ where: { id: projectQ } })).code,
    unitFrom: unitFrom.id,
    unitOther: unitOther.id,
    ruleFrom: await insertConversionRule(prisma, { fromUnitId: unitFrom.id, factor: '0.5' }),
    ruleOther: await insertConversionRule(prisma, { fromUnitId: unitOther.id, factor: '0.25' }),
    phaseId: await catalogItemId(prisma, 'crm.fase_cliente', 'DISENO'),
    opportunityP: await insertOpportunity(prisma, { projectId: projectP, ownerId: owner.id }),
    opportunityQ: await insertOpportunity(prisma, { projectId: projectQ, ownerId: owner.id }),
    productId: product.id,
  };
});

afterAll(async () => {
  await closeTestContext(context);
});

describe('projects', () => {
  it('ck_projects_phase_progress: UPDATE a 101 o a -1 falla; 100 se acepta (PF-03.51)', async () => {
    const { prisma } = context;
    await expectViolation(prisma.$executeRaw`UPDATE projects SET phase_progress = 101 WHERE id = ${fx.projectP}::uuid`, 'ck_projects_phase_progress');
    await expectViolation(prisma.$executeRaw`UPDATE projects SET phase_progress = -1 WHERE id = ${fx.projectP}::uuid`, 'ck_projects_phase_progress');
    expect((await prisma.project.findUniqueOrThrow({ where: { id: fx.projectP } })).phaseProgress.toFixed(2)).toBe('0.00');
    expect(await prisma.$executeRaw`UPDATE projects SET phase_progress = 100 WHERE id = ${fx.projectP}::uuid`).toBe(1);
    await prisma.$executeRaw`UPDATE projects SET phase_progress = 0 WHERE id = ${fx.projectP}::uuid`;
  });

  it('ck_projects_estimated_dates: fin < inicio falla; fin = inicio se acepta (PF-03.8)', async () => {
    const { prisma } = context;
    await expectViolation(
      prisma.$executeRaw`UPDATE projects SET estimated_start_date = '2026-12-01', estimated_end_date = '2026-11-30' WHERE id = ${fx.projectP}::uuid`,
      'ck_projects_estimated_dates',
    );
    expect(
      await prisma.$executeRaw`UPDATE projects SET estimated_start_date = '2026-12-01', estimated_end_date = '2026-12-01' WHERE id = ${fx.projectP}::uuid`,
    ).toBe(1);
  });

  it('ck_projects_quantity y ck_projects_tonnage: no negativos', async () => {
    const { prisma } = context;
    await expectViolation(prisma.$executeRaw`UPDATE projects SET estimated_quantity = -0.0001 WHERE id = ${fx.projectP}::uuid`, 'ck_projects_quantity');
    await expectViolation(prisma.$executeRaw`UPDATE projects SET estimated_tonnage = -1 WHERE id = ${fx.projectP}::uuid`, 'ck_projects_tonnage');
    // Tonelaje manual sin regla: permitido solo en el proyecto (DM-24).
    expect(await prisma.$executeRaw`UPDATE projects SET estimated_tonnage = 12.5 WHERE id = ${fx.projectP}::uuid`).toBe(1);
    await prisma.$executeRaw`UPDATE projects SET estimated_tonnage = NULL WHERE id = ${fx.projectP}::uuid`;
  });

  it('ck_projects_conversion: una regla sin cantidad (o sin factor) falla; con unidad, cantidad y factor se acepta (PF-03.45)', async () => {
    const { prisma } = context;
    await expectViolation(
      prisma.$executeRaw`UPDATE projects SET measure_unit_id = ${fx.unitFrom}::uuid, conversion_rule_id = ${fx.ruleFrom}::uuid, conversion_factor = 0.5
                         WHERE id = ${fx.projectQ}::uuid`,
      'ck_projects_conversion',
    );
    await expectViolation(
      prisma.$executeRaw`UPDATE projects SET measure_unit_id = ${fx.unitFrom}::uuid, estimated_quantity = 10, conversion_rule_id = ${fx.ruleFrom}::uuid
                         WHERE id = ${fx.projectQ}::uuid`,
      'ck_projects_conversion',
    );
    expect(
      await prisma.$executeRaw`UPDATE projects SET measure_unit_id = ${fx.unitFrom}::uuid, estimated_quantity = 10, conversion_rule_id = ${fx.ruleFrom}::uuid,
                               conversion_factor = 0.5, estimated_tonnage = 5 WHERE id = ${fx.projectQ}::uuid`,
    ).toBe(1);
    await prisma.$executeRaw`UPDATE projects SET measure_unit_id = NULL, estimated_quantity = NULL, conversion_rule_id = NULL,
                             conversion_factor = NULL, estimated_tonnage = NULL WHERE id = ${fx.projectQ}::uuid`;
  });

  it('FK compuesta (conversion_rule_id, measure_unit_id): una regla de otra unidad origen falla (PF-03.45)', async () => {
    await expectViolation(
      context.prisma.$executeRaw`UPDATE projects SET measure_unit_id = ${fx.unitOther}::uuid, estimated_quantity = 10,
                                 conversion_rule_id = ${fx.ruleFrom}::uuid, conversion_factor = 0.5 WHERE id = ${fx.projectQ}::uuid`,
      'projects_conversion_rule_id_measure_unit_id_fkey',
    );
  });

  it('ck_projects_not_self_duplicate: un proyecto no es su propio origen', async () => {
    const { prisma } = context;
    await expectViolation(
      prisma.$executeRaw`UPDATE projects SET duplicated_from_id = id WHERE id = ${fx.projectP}::uuid`,
      'ck_projects_not_self_duplicate',
    );
    expect(await prisma.$executeRaw`UPDATE projects SET duplicated_from_id = ${fx.projectP}::uuid WHERE id = ${fx.projectQ}::uuid`).toBe(1);
    await prisma.$executeRaw`UPDATE projects SET duplicated_from_id = NULL WHERE id = ${fx.projectQ}::uuid`;
  });

  it('projects_code_key: el código es único', async () => {
    const { prisma } = context;
    const index = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'projects_code_key'`;
    expect(index.map((row) => row.indexdef.replace(/ ON \S+\.?projects /, ' ON projects '))).toEqual([
      'CREATE UNIQUE INDEX projects_code_key ON projects USING btree (code)',
    ]);
    // PostgreSQL no nombra el índice en el mensaje de una violación de unicidad: se comprueba SQLSTATE y clave.
    await expectViolation(
      prisma.$executeRaw`UPDATE projects SET code = ${fx.codeQ} WHERE id = ${fx.projectP}::uuid`,
      `Code: \`23505\`. Message: \`Key (code)=(${fx.codeQ}) already exists.\``,
    );
  });

  it('uq_projects_id_customer respalda las FK compuestas de visitas y actividades (RN-03.10)', async () => {
    const { prisma } = context;
    const index = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_projects_id_customer'`;
    expect(index).toHaveLength(1);
    expect(index[0]?.indexdef).toContain('UNIQUE INDEX uq_projects_id_customer ON');
    expect(index[0]?.indexdef).toContain('(id, customer_id)');

    // Visita o actividad con un proyecto de OTRO cliente.
    await expectViolation(
      insertVisit(prisma, { customerId: fx.customerB, ownerId: fx.ownerId, projectId: fx.projectP }),
      'visits_project_id_customer_id_fkey',
    );
    await expectViolation(
      insertActivity(prisma, { customerId: fx.customerB, ownerId: fx.ownerId, projectId: fx.projectP }),
      'activities_project_id_customer_id_fkey',
    );

    // Con una visita vinculada, el cliente del proyecto no cambia (ON UPDATE RESTRICT).
    const linked = await insertProject(prisma, { customerId: fx.customerA, ownerId: fx.ownerId, countryId: r5 });
    await insertVisit(prisma, { customerId: fx.customerA, ownerId: fx.ownerId, projectId: linked });
    await expectViolation(
      prisma.$executeRaw`UPDATE projects SET customer_id = ${fx.customerB}::uuid WHERE id = ${linked}::uuid`,
      'visits_project_id_customer_id_fkey',
    );
    expect((await prisma.project.findUniqueOrThrow({ where: { id: linked } })).customerId).toBe(fx.customerA);
  });
});

describe('project_phase_history', () => {
  it('ck_project_phase_history_progress: to_progress y from_progress en 0–100', async () => {
    const { prisma } = context;
    const insert = (toProgress: number, fromProgress: number | null): Promise<number> =>
      prisma.$executeRaw`INSERT INTO project_phase_history (id, project_id, from_phase_id, to_phase_id, from_progress, to_progress, changed_by_id)
                         VALUES (gen_random_uuid(), ${fx.projectP}::uuid, ${fx.phaseId}::uuid, ${fx.phaseId}::uuid,
                                 ${fromProgress}::numeric, ${toProgress}::numeric, ${fx.ownerId}::uuid)`;

    await expectViolation(insert(101, 0), 'ck_project_phase_history_progress');
    await expectViolation(insert(-1, null), 'ck_project_phase_history_progress');
    await expectViolation(insert(50, 100.01), 'ck_project_phase_history_progress');
    await expect(insert(100, 0)).resolves.toBe(1);
    await expect(insert(0, null)).resolves.toBe(1);
  });
});

describe('project_products', () => {
  let lineId: string;

  beforeAll(async () => {
    lineId = await insertProjectProduct(context.prisma, { projectId: fx.projectP, productId: fx.productId, unitId: fx.unitFrom, quantity: '10' });
  });

  it('ck_project_products_quantity: no negativa', async () => {
    await expectViolation(
      context.prisma.$executeRaw`UPDATE project_products SET quantity = -1 WHERE id = ${lineId}::uuid`,
      'ck_project_products_quantity',
    );
  });

  it('ck_project_products_tonnage: no negativo (con regla)', async () => {
    await expectViolation(
      context.prisma.$executeRaw`UPDATE project_products SET conversion_rule_id = ${fx.ruleFrom}::uuid, conversion_factor = 0.5, tonnage = -1
                                 WHERE id = ${lineId}::uuid`,
      'ck_project_products_tonnage',
    );
  });

  it('ck_project_products_conversion: tonelaje sin regla y regla sin tonelaje fallan; regla + factor + tonelaje se acepta (PF-03.85)', async () => {
    const { prisma } = context;
    await expectViolation(prisma.$executeRaw`UPDATE project_products SET tonnage = 5 WHERE id = ${lineId}::uuid`, 'ck_project_products_conversion');
    await expectViolation(
      prisma.$executeRaw`UPDATE project_products SET conversion_rule_id = ${fx.ruleFrom}::uuid, conversion_factor = 0.5 WHERE id = ${lineId}::uuid`,
      'ck_project_products_conversion',
    );
    await expectViolation(
      prisma.$executeRaw`UPDATE project_products SET conversion_factor = 0.5, tonnage = 5 WHERE id = ${lineId}::uuid`,
      'ck_project_products_conversion',
    );
    expect(
      await prisma.$executeRaw`UPDATE project_products SET conversion_rule_id = ${fx.ruleFrom}::uuid, conversion_factor = 0.5, tonnage = 5
                               WHERE id = ${lineId}::uuid`,
    ).toBe(1);
    await prisma.$executeRaw`UPDATE project_products SET conversion_rule_id = NULL, conversion_factor = NULL, tonnage = NULL WHERE id = ${lineId}::uuid`;
  });

  it('FK compuesta (conversion_rule_id, unit_id): no se aplica una regla de otra unidad origen', async () => {
    await expectViolation(
      context.prisma.$executeRaw`UPDATE project_products SET conversion_rule_id = ${fx.ruleOther}::uuid, conversion_factor = 0.25, tonnage = 2.5
                                 WHERE id = ${lineId}::uuid`,
      'project_products_conversion_rule_id_unit_id_fkey',
    );
  });

  it('FK compuesta (opportunity_id, project_id): la oportunidad debe ser del mismo proyecto', async () => {
    const { prisma } = context;
    await expectViolation(
      prisma.$executeRaw`UPDATE project_products SET opportunity_id = ${fx.opportunityQ}::uuid WHERE id = ${lineId}::uuid`,
      'project_products_opportunity_id_project_id_fkey',
    );
    expect(await prisma.$executeRaw`UPDATE project_products SET opportunity_id = ${fx.opportunityP}::uuid WHERE id = ${lineId}::uuid`).toBe(1);
    // Con la oportunidad asignada, la línea no se mueve a otro proyecto: el par (oportunidad, proyecto) dejaría de existir.
    await expectViolation(
      prisma.$executeRaw`UPDATE project_products SET project_id = ${fx.projectQ}::uuid WHERE id = ${lineId}::uuid`,
      'project_products_opportunity_id_project_id_fkey',
    );
    expect(await prisma.projectProduct.findUniqueOrThrow({ where: { id: lineId } })).toMatchObject({ projectId: fx.projectP, opportunityId: fx.opportunityP });
  });
});
