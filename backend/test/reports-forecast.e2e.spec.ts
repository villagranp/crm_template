import {
  api,
  businessMonthOffset,
  type CrmUser,
  crmUser,
  insertCustomer,
  insertForecastLine,
  insertProduct,
  insertProductFamily,
  insertProject,
  testCountry,
  unitId,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 5 · Reporte de forecast (05 F-36): PF-05.13 a PF-05.15, AC-05.12–AC-05.16.
 * País propio `K7`. Ventana M+1…M+6 en `America/Guatemala` (`crm.forecast.horizonte_meses` = 6).
 */

let context: TestContext;
let k7: string;
let user: CrmUser;
type Key = 'c1' | 'c2' | 'p1' | 'p2' | 'kg' | 'ton' | 'var' | 'f1' | 'f2' | 'a' | 'b' | 'c' | 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'zero' | 'past';
const ids = {} as Record<Key, string>;

const m = (offset: number): { year: number; month: number } => businessMonthOffset(offset);
const label = (offset: number): string => {
  const { year, month } = m(offset);
  return `${year}-${String(month).padStart(2, '0')}`;
};

async function globalRule(fromCode: string): Promise<string> {
  const rule = await context.prisma.unitConversionRule.findFirstOrThrow({
    where: { scope: 'GLOBAL', isActive: true, fromUnit: { code: fromCode }, toUnit: { code: 'TON' } },
  });
  return rule.id;
}

beforeAll(async () => {
  context = await createTestContext();
  const { prisma } = context;
  k7 = await testCountry(prisma, 'K7', { name: 'Prueba Reportes Forecast' });
  user = await crmUser(context, { roleCodes: ['asesor'], countryId: k7 });
  const c1 = await insertCustomer(prisma, { salesOwnerId: user.id, countryId: k7, legalName: 'Cliente Forecast Uno' });
  const c2 = await insertCustomer(prisma, { salesOwnerId: user.id, countryId: k7, legalName: 'Cliente Forecast Dos' });
  ids.c1 = c1.id;
  ids.c2 = c2.id;
  ids.p1 = await insertProject(prisma, { customerId: c1.id, ownerId: user.id, countryId: k7, code: `TEST-PRY-FA-${Date.now()}`, name: 'Proyecto A' });
  ids.p2 = await insertProject(prisma, { customerId: c2.id, ownerId: user.id, countryId: k7, code: `TEST-PRY-FB-${Date.now()}`, name: 'Proyecto B' });
  ids.kg = await unitId(prisma, 'KG');
  ids.ton = await unitId(prisma, 'TON');
  ids.var = await unitId(prisma, 'VAR');
  ids.f1 = await insertProductFamily(prisma, { name: 'Familia Forecast 1' });
  ids.f2 = await insertProductFamily(prisma, { name: 'Familia Forecast 2' });
  ids.a = (await insertProduct(prisma, { familyId: ids.f1, baseUnitId: ids.kg, sku: `TEST-FA-${Date.now()}` })).id;
  ids.b = (await insertProduct(prisma, { familyId: ids.f1, baseUnitId: ids.ton, sku: `TEST-FB-${Date.now()}` })).id;
  ids.c = (await insertProduct(prisma, { familyId: ids.f2, baseUnitId: ids.var, sku: `TEST-FC-${Date.now()}` })).id;
  const kgRule = await globalRule('KG');
  const tonRule = await globalRule('TON');
  const line = (projectId: string, productId: string, unit: string, offset: number, quantity: string, conversion?: { ruleId: string; factor: string; tonnage: string }): Promise<string> =>
    insertForecastLine(prisma, { projectId, productId, unitId: unit, ownerId: user.id, ...m(offset), quantity, conversion });
  ids.l1 = await line(ids.p1, ids.a, ids.kg, 1, '1000', { ruleId: kgRule, factor: '0.001', tonnage: '1' });
  ids.l2 = await line(ids.p1, ids.b, ids.ton, 1, '2.5', { ruleId: tonRule, factor: '1', tonnage: '2.5' });
  ids.l3 = await line(ids.p1, ids.c, ids.var, 1, '7');
  ids.l4 = await line(ids.p2, ids.a, ids.kg, 2, '500', { ruleId: kgRule, factor: '0.001', tonnage: '0.5' });
  ids.l5 = await line(ids.p2, ids.c, ids.var, 2, '3');
  ids.zero = await line(ids.p2, ids.b, ids.ton, 3, '0', { ruleId: tonRule, factor: '1', tonnage: '0' });
  ids.past = await line(ids.p1, ids.a, ids.kg, -3, '2000', { ruleId: kgRule, factor: '0.001', tonnage: '2' });
});

afterAll(async () => {
  await closeTestContext(context);
});

interface UnitQuantity {
  unit: { code: string };
  quantity: string;
  cumulative?: string;
}

function quantities(entries: UnitQuantity[]): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [entry.unit.code, entry.quantity]));
}

describe('GET /reports/forecast/summary (PF-05.13, PF-05.15, AC-05.12, AC-05.13)', () => {
  it('sin filtros: M+1…M+6 en la zona del negocio, toneladas solo de las convertidas, cantidades por unidad y acumulados', async () => {
    const response = await api(context, user.token).get('/reports/forecast/summary').expect(200);
    const body = response.body;
    expect(body.range).toEqual({ from: m(1), to: m(6) });
    expect(body.months.map((month: { year: number; month: number }) => ({ year: month.year, month: month.month }))).toEqual([1, 2, 3, 4, 5, 6].map(m));
    expect(body.tonnageUnit).toBe('TON');
    expect(body.lineCount).toBe(5);
    expect(body.totals).toEqual({
      tonnage: '4.0000',
      quantities: [
        { unit: { id: ids.kg, code: 'KG', symbol: 'kg' }, quantity: '1500.0000' },
        { unit: { id: ids.ton, code: 'TON', symbol: 't' }, quantity: '2.5000' },
        { unit: { id: ids.var, code: 'VAR', symbol: 'var' }, quantity: '10.0000' },
      ],
      lineCount: 5,
      linesWithoutConversion: 2,
    });
    const [first, second, third] = body.months as { tonnage: string; cumulativeTonnage: string; quantities: UnitQuantity[]; lineCount: number; linesWithoutConversion: number }[];
    expect(first).toMatchObject({ tonnage: '3.5000', cumulativeTonnage: '3.5000', lineCount: 3, linesWithoutConversion: 1 });
    expect(quantities(first?.quantities ?? [])).toEqual({ KG: '1000.0000', TON: '2.5000', VAR: '7.0000' });
    expect(second).toMatchObject({ tonnage: '0.5000', cumulativeTonnage: '4.0000', lineCount: 2, linesWithoutConversion: 1 });
    expect((second?.quantities ?? []).map((entry) => [entry.unit.code, entry.quantity, entry.cumulative])).toEqual([
      ['KG', '500.0000', '1500.0000'],
      ['TON', '0.0000', '2.5000'],
      ['VAR', '3.0000', '10.0000'],
    ]);
    // La línea con cantidad 0 (M+3) no cuenta (AC-05.15).
    expect(third).toMatchObject({ tonnage: '0.0000', cumulativeTonnage: '4.0000', lineCount: 0, linesWithoutConversion: 0 });
    const updatedAt = await context.prisma.forecastLine.aggregate({ where: { id: { in: [ids.l1, ids.l2, ids.l3, ids.l4, ids.l5] } }, _max: { updatedAt: true } });
    expect(body.lastUpdatedAt).toBe(updatedAt._max?.updatedAt?.toISOString());
  });

  it('un rango pasado muestra la historia (la ventana móvil no borra nada, AC-05.16)', async () => {
    const response = await api(context, user.token).get(`/reports/forecast/summary?fromMonth=${label(-3)}&toMonth=${label(-3)}`).expect(200);
    expect(response.body).toMatchObject({ lineCount: 1, totals: { tonnage: '2.0000', linesWithoutConversion: 0 } });
    const rows = await api(context, user.token).get(`/reports/forecast?fromMonth=${label(-3)}&toMonth=${label(-3)}`).expect(200);
    expect(rows.body.data.map((row: { id: string }) => row.id)).toEqual([ids.past]);
  });
});

describe('GET /reports/forecast — detalle (AC-05.15)', () => {
  it('una fila por línea con cantidad > 0, orden por período ascendente, con unidad y "sin conversión"', async () => {
    const response = await api(context, user.token).get('/reports/forecast').expect(200);
    const rows = response.body.data as { id: string; year: number; month: number; tonnage: string | null; unit: { code: string } }[];
    expect(rows.map((row) => row.id).sort()).toEqual([ids.l1, ids.l2, ids.l3, ids.l4, ids.l5].sort());
    expect(rows.map((row) => row.year * 12 + row.month)).toEqual([...rows.map((row) => row.year * 12 + row.month)].sort((a, b) => a - b));
    const l3 = rows.find((row) => row.id === ids.l3);
    expect(l3).toMatchObject({ quantity: '7.0000', unit: { code: 'VAR', symbol: 'var' }, tonnage: null, family: { id: ids.f2, name: 'Familia Forecast 2' } });
    const l1 = rows.find((row) => row.id === ids.l1);
    expect(l1).toMatchObject({
      project: { id: ids.p1, name: 'Proyecto A' },
      customer: { id: ids.c1, name: 'Cliente Forecast Uno' },
      product: { id: ids.a },
      ...m(1),
      quantity: '1000.0000',
      tonnage: '1.0000',
      owner: { id: user.id },
    });
    const byTonnage = await api(context, user.token).get('/reports/forecast?sortBy=tonnage&sortOrder=desc').expect(200);
    expect(byTonnage.body.data.map((row: { id: string }) => row.id)).toEqual([ids.l2, ids.l1, ids.l4, ...[ids.l3, ids.l5].sort()]);
    const filtered = await api(context, user.token).get(`/reports/forecast?productFamilyId=${ids.f2}&customerId=${ids.c2}`).expect(200);
    expect(filtered.body.data.map((row: { id: string }) => row.id)).toEqual([ids.l5]);
  });
});

describe('GET /reports/forecast/consolidated (PF-05.14, AC-05.14)', () => {
  const GROUPS = ['MONTH', 'PRODUCT', 'FAMILY', 'PROJECT', 'CUSTOMER', 'OWNER'] as const;

  interface Group {
    key: { type: string; id: string | null; label: string };
    months: { tonnage: string; lineCount: number }[];
    total: { tonnage: string; lineCount: number; linesWithoutConversion: number; quantities: UnitQuantity[] };
    subgroups: Group[] | null;
  }

  function sum(values: string[]): string {
    return values.reduce((total, value) => total + Number(value), 0).toFixed(4);
  }

  it('por cada agrupación (y con segundo nivel) la suma de los grupos coincide con el total del resumen', async () => {
    const client = api(context, user.token);
    for (const groupBy of GROUPS) {
      for (const thenBy of [undefined, ...GROUPS.filter((value) => value !== groupBy)]) {
        const path = `/reports/forecast/consolidated?groupBy=${groupBy}${thenBy ? `&thenBy=${thenBy}` : ''}`;
        const response = await client.get(path).expect(200);
        const groups = response.body.data as Group[];
        expect({ path, tonnage: sum(groups.map((group) => group.total.tonnage)), lines: groups.reduce((total, group) => total + group.total.lineCount, 0) }).toEqual({
          path,
          tonnage: '4.0000',
          lines: 5,
        });
        for (const group of groups) {
          expect(group.months).toHaveLength(6);
          expect(sum(group.months.map((month) => month.tonnage))).toBe(group.total.tonnage);
          if (thenBy) {
            expect(sum((group.subgroups ?? []).map((subgroup) => subgroup.total.tonnage))).toBe(group.total.tonnage);
          } else {
            expect(group.subgroups).toBeNull();
          }
        }
      }
    }
  });

  it('por proyecto y producto: claves, etiquetas, sin conversión y cantidades por unidad', async () => {
    const response = await api(context, user.token).get('/reports/forecast/consolidated?groupBy=PROJECT&thenBy=PRODUCT').expect(200);
    const groups = response.body.data as Group[];
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    expect(groups.map((group) => group.key.id)).toEqual([ids.p1, ids.p2]);
    const [first] = groups;
    expect(first?.key).toEqual({ type: 'PROJECT', id: ids.p1, label: expect.stringContaining('Proyecto A') });
    expect(first?.total).toMatchObject({ tonnage: '3.5000', lineCount: 3, linesWithoutConversion: 1 });
    expect(quantities(first?.total.quantities ?? [])).toEqual({ KG: '1000.0000', TON: '2.5000', VAR: '7.0000' });
    expect((first?.subgroups ?? []).map((subgroup) => subgroup.key.id).sort()).toEqual([ids.a, ids.b, ids.c].sort());
    const months = await api(context, user.token).get('/reports/forecast/consolidated?pageSize=1').expect(200);
    expect(months.body.pagination).toEqual({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(months.body.data[0].key).toEqual({ type: 'MONTH', id: null, label: label(1) });
  });

  it('validación del rango y de la agrupación (PF-05.27)', async () => {
    const client = api(context, user.token);
    const cases: [string, number, string][] = [
      ['/reports/forecast/consolidated?groupBy=PRODUCT&thenBy=PRODUCT', 400, 'VALIDATION_FAILED'],
      ['/reports/forecast/consolidated?groupBy=YEAR', 400, 'VALIDATION_FAILED'],
      [`/reports/forecast?fromMonth=${label(1)}`, 400, 'VALIDATION_FAILED'],
      ['/reports/forecast/summary?fromMonth=2026-13&toMonth=2027-01', 400, 'VALIDATION_FAILED'],
      ['/reports/forecast/summary?fromMonth=2027-02&toMonth=2027-01', 400, 'VALIDATION_FAILED'],
      ['/reports/forecast/summary?fromMonth=2026-01&toMonth=2028-01', 422, 'PERIOD_TOO_LONG'],
      ['/reports/forecast?sortBy=year', 400, 'VALIDATION_FAILED'],
      ['/reports/forecast/summary?page=1', 400, 'VALIDATION_FAILED'],
    ];
    for (const [path, status, code] of cases) {
      const response = await client.get(path);
      expect({ path, status: response.status, code: response.body.code }).toEqual({ path, status, code });
    }
    await client.get('/reports/forecast/summary?fromMonth=2026-01&toMonth=2027-12').expect(200);
  });
});
