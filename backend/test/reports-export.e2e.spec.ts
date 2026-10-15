import type { Workbook } from 'exceljs';

import {
  api,
  businessMonthOffset,
  type CrmUser,
  crmUser,
  insertActivity,
  insertConversionRule,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertVisit,
  testCountry,
  unitId,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';
import { binaryParser, column, dataRows, headers, keyValues, readXlsx, sheet, ValueType } from './support/xlsx-reader';

/**
 * Módulo 5 · Exportación XLSX (05 F-39): PF-05.21, PF-05.24–PF-05.28, PF-05.45, AC-05.23–AC-05.29,
 * AC-05.46. Países propios `X1` (USD) y `X2` (moneda de prueba `XRB`); cada prueba usa usuarios
 * nuevos (el límite de 5 exportaciones por minuto es por usuario). El archivo se abre en la
 * prueba con la propia librería y se compara con la pantalla sin paginar.
 */

let context: TestContext;
let x1: string;
let x2: string;
let admin: CrmUser;

const RATE_CURRENCY = 'XRB';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORTS = ['projects', 'opportunities', 'forecast', 'visits', 'activities'] as const;
const NOW = Date.now();
const DAY = 86_400_000;

beforeAll(async () => {
  context = await createTestContext();
  const { prisma } = context;
  await prisma.currency.upsert({ where: { code: RATE_CURRENCY }, update: { isActive: true }, create: { code: RATE_CURRENCY, name: 'Moneda de prueba de exportación', symbol: 'X$' } });
  await prisma.exchangeRate.upsert({
    where: { currencyCode_effectiveDate: { currencyCode: RATE_CURRENCY, effectiveDate: new Date('2026-01-01T00:00:00Z') } },
    update: { ratePerUsd: '7.75' },
    create: { currencyCode: RATE_CURRENCY, effectiveDate: new Date('2026-01-01T00:00:00Z'), ratePerUsd: '7.75', source: 'prueba de integración' },
  });
  x1 = await testCountry(prisma, 'X1', { name: 'Prueba Exportación' });
  x2 = await testCountry(prisma, 'X2', { name: 'Prueba Exportación Moneda local', currencyCode: RATE_CURRENCY });
  admin = await crmUser(context, { roleCodes: ['administrador'] });
});

afterAll(async () => {
  await closeTestContext(context);
});

/** Asesor (OWN) con `reportes.exportar` concedido directamente. */
function exporter(countryId = x1): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId, grant: ['reportes.exportar'] });
}

async function download(token: string, path: string): Promise<{ status: number; headers: Record<string, string>; workbook: Workbook }> {
  const response = await api(context, token).get(path).buffer(true).parse(binaryParser);
  expect({ path, status: response.status }).toEqual({ path, status: 200 });
  return { status: response.status, headers: response.headers as Record<string, string>, workbook: await readXlsx(response.body as Buffer) };
}

/** Datos de un asesor: 2 proyectos, 2 oportunidades (XRB y USD), forecast con y sin conversión, 2 visitas y 2 actividades. */
async function dataset(owner: CrmUser, countryId = x1): Promise<{ customerId: string; projectA: string; projectB: string }> {
  const { prisma } = context;
  const customer = await insertCustomer(prisma, { salesOwnerId: owner.id, countryId, legalName: '=HYPERLINK("http://x","y") Ltda' });
  const projectA = await insertProject(prisma, {
    customerId: customer.id,
    ownerId: owner.id,
    countryId,
    name: 'Torre Exportación',
    phaseProgress: '45',
    estimatedDecisionDate: '2026-11-30',
  });
  const projectB = await insertProject(prisma, { customerId: customer.id, ownerId: owner.id, countryId, name: '+Bodega' });
  await insertOpportunity(prisma, {
    projectId: projectA,
    ownerId: owner.id,
    stageCode: 'COTIZANDO',
    estimate: { amount: '7750', currencyCode: RATE_CURRENCY, exchangeRate: '7.75', exchangeRateDate: '2026-10-01', amountUsd: '1000' },
    estimatedTonnage: '12.5',
  });
  await insertOpportunity(prisma, {
    projectId: projectB,
    ownerId: owner.id,
    stageCode: 'GANADO',
    outcome: 'WON',
    estimate: { amount: '500', currencyCode: 'USD', exchangeRate: '1', exchangeRateDate: null, amountUsd: '500' },
  });
  const family = await insertProductFamily(prisma);
  const kg = await unitId(prisma, 'KG');
  const variable = await unitId(prisma, 'VAR');
  const steel = await insertProduct(prisma, { familyId: family, baseUnitId: kg });
  const rule = await insertConversionRule(prisma, { fromUnitId: kg, factor: '0.001', scope: 'PRODUCT', productId: steel.id });
  await insertForecastLine(prisma, { projectId: projectA, productId: steel.id, unitId: kg, ownerId: owner.id, ...businessMonthOffset(1), quantity: '1500', conversion: { ruleId: rule, factor: '0.001', tonnage: '1.5' } });
  const loose = await insertProduct(prisma, { familyId: family, baseUnitId: variable });
  await insertForecastLine(prisma, { projectId: projectB, productId: loose.id, unitId: variable, ownerId: owner.id, ...businessMonthOffset(2), quantity: '3' });
  await insertVisit(prisma, { customerId: customer.id, ownerId: owner.id, projectId: projectA, scheduledStartAt: new Date(NOW + 2 * DAY) });
  await insertVisit(prisma, {
    customerId: customer.id,
    ownerId: owner.id,
    statusCode: 'REALIZADA',
    scheduledStartAt: new Date(NOW - 3 * DAY),
    actualStartAt: new Date(NOW - 3 * DAY),
  });
  await insertActivity(prisma, { customerId: customer.id, ownerId: owner.id, subject: '-2 seguimiento', dueAt: new Date(NOW - DAY) });
  await insertActivity(prisma, { customerId: customer.id, ownerId: owner.id, statusCode: 'COMPLETADA', completedAt: new Date(NOW - 2 * DAY), dueAt: new Date(NOW - 2 * DAY) });
  return { customerId: customer.id, projectA, projectB };
}

describe('Autenticación y permisos de /export (PF-05.21, AC-05.28, AC-05.40)', () => {
  it('401 sin token; 403 con `reportes.ver` sin `reportes.exportar`; 403 con `reportes.exportar` sin `reportes.ver`', async () => {
    const viewer = await crmUser(context, { roleCodes: ['asesor'] });
    const exportOnly = await crmUser(context, { roleCodes: ['usuario'], grant: ['reportes.exportar'] });
    for (const report of EXPORTS) {
      const path = `/reports/${report}/export`;
      const anonymous = await api(context).get(path);
      expect({ path, status: anonymous.status, code: anonymous.body.code }).toEqual({ path, status: 401, code: 'UNAUTHENTICATED' });
      const withoutExport = await api(context, viewer.token).get(path);
      expect({ path, status: withoutExport.status, code: withoutExport.body.code }).toEqual({ path, status: 403, code: 'PERMISSION_DENIED' });
      const withoutView = await api(context, exportOnly.token).get(path);
      expect({ path, status: withoutView.status, code: withoutView.body.code }).toEqual({ path, status: 403, code: 'PERMISSION_DENIED' });
    }
  });
});

describe('Contenido del archivo = pantalla sin paginar (PF-05.24, AC-05.23, AC-05.24, AC-05.29)', () => {
  it('los cinco reportes: mismas filas, mismo orden, celdas tipadas, hojas Resumen y Filtros, textos neutralizados', async () => {
    const owner = await exporter();
    await dataset(owner);
    const client = api(context, owner.token);

    // F-34 Proyectos.
    const projects = await client.get('/reports/projects?pageSize=100&sortBy=code').expect(200);
    const projectFile = await download(owner.token, '/reports/projects/export?sortBy=code');
    expect(projectFile.headers['content-type']).toBe(XLSX_TYPE);
    expect(projectFile.headers['content-disposition']).toMatch(/^attachment; filename="reporte-proyectos-\d{8}-\d{4}\.xlsx"$/);
    expect(projectFile.headers['x-export-rows']).toBe('2');
    expect(projectFile.headers['x-export-truncated']).toBe('false');
    expect(projectFile.headers['cache-control']).toBe('no-store');
    expect(projectFile.headers['x-content-type-options']).toBe('nosniff');
    expect(projectFile.workbook.worksheets.map((entry) => entry.name)).toEqual(['Datos', 'Resumen', 'Filtros']);
    const projectSheet = sheet(projectFile.workbook, 'Datos');
    expect(headers(projectSheet)).toEqual([
      'Código',
      'Nombre',
      'Cliente',
      'País',
      'Ubicación (ciudad)',
      'Asesor',
      'Tipo',
      'Fase',
      '% avance',
      'Estado comercial',
      'Fecha estimada de decisión',
      'Última actualización',
    ]);
    const projectRows = dataRows(projectSheet);
    expect(projectRows.map((row) => row[0]?.value)).toEqual((projects.body.data as { code: string }[]).map((row) => row.code));
    const tower = projectRows.find((row) => row[1]?.value === 'Torre Exportación');
    expect(tower?.[2]).toMatchObject({ type: ValueType.String, value: `'=HYPERLINK("http://x","y") Ltda` });
    expect(tower?.[2]?.formula).toBeUndefined();
    expect(tower?.[8]).toMatchObject({ type: ValueType.Number, value: 0.45, numFmt: '0.00 %' });
    expect(tower?.[10]).toMatchObject({ type: ValueType.Date, numFmt: 'dd/mm/yyyy' });
    expect((tower?.[10]?.value as Date).toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(tower?.[11]).toMatchObject({ type: ValueType.Date, numFmt: 'dd/mm/yyyy hh:mm' });
    expect(projectRows.find((row) => row[1]?.value === `'+Bodega`)).toBeDefined();
    expect(keyValues(sheet(projectFile.workbook, 'Resumen'))).toEqual(new Map<string, unknown>([['Proyectos', 2], ['Activos', 2], ['Finalizados', 0]]));
    const projectFilters = keyValues(sheet(projectFile.workbook, 'Filtros'));
    expect(projectFilters.get('Reporte')).toBe('Reporte de proyectos');
    expect(projectFilters.get('Zona horaria')).toBe('America/Guatemala');
    expect(projectFilters.get('Alcance')).toBe('Propios');
    expect(projectFilters.get('Filas')).toBe(2);
    expect(projectFilters.get('Ordenar por')).toBe('Código');

    // F-35 Oportunidades.
    const opportunities = await client.get('/reports/opportunities?pageSize=100').expect(200);
    const opportunityFile = await download(owner.token, '/reports/opportunities/export');
    const opportunityRows = dataRows(sheet(opportunityFile.workbook, 'Datos'));
    expect(opportunityRows.map((row) => row[0]?.value)).toEqual((opportunities.body.data as { code: string }[]).map((row) => row.code));
    expect(keyValues(sheet(opportunityFile.workbook, 'Resumen')).get('Total')).toBe(2);

    // F-36 Forecast: cantidad con su unidad al lado; toneladas vacías = sin conversión.
    const forecast = await client.get('/reports/forecast?pageSize=100').expect(200);
    const forecastFile = await download(owner.token, '/reports/forecast/export');
    const forecastSheet = sheet(forecastFile.workbook, 'Datos');
    const quantity = column(forecastSheet, 'Cantidad');
    expect(headers(forecastSheet)[quantity]).toBe('Unidad');
    const forecastRows = dataRows(forecastSheet);
    expect(forecastRows.map((row) => [row[3]?.value, row[6]?.value, row[7]?.value])).toEqual(
      (forecast.body.data as { product: { sku: string }; year: number; month: number }[]).map((row) => [row.product.sku, row.year, row.month]),
    );
    expect(forecastRows[0]?.[quantity - 1]).toMatchObject({ type: ValueType.Number, value: 1500, numFmt: '#,##0.0000' });
    expect(forecastRows[0]?.[quantity]).toMatchObject({ value: 'KG' });
    expect(forecastRows[0]?.[column(forecastSheet, 'Tonelaje (t)') - 1]).toMatchObject({ type: ValueType.Number, value: 1.5, numFmt: '#,##0.000' });
    expect(forecastRows[1]?.[column(forecastSheet, 'Tonelaje (t)') - 1]?.type).toBe(ValueType.Null);
    const forecastSummary = keyValues(sheet(forecastFile.workbook, 'Resumen'));
    expect(forecastSummary.get('Total · Toneladas')).toBe(1.5);
    expect(forecastSummary.get('Total · Líneas sin conversión')).toBe(1);

    // F-37 Visitas.
    const visits = await client.get('/reports/visits?pageSize=100').expect(200);
    const visitFile = await download(owner.token, '/reports/visits/export');
    const visitRows = dataRows(sheet(visitFile.workbook, 'Datos'));
    expect(visitRows.map((row) => row[0]?.value)).toEqual((visits.body.data as { code: string }[]).map((row) => row.code));
    expect(visitRows[0]?.[5]?.type).toBe(ValueType.Date);
    const visitSummary = keyValues(sheet(visitFile.workbook, 'Resumen'));
    expect([visitSummary.get('Programadas'), visitSummary.get('Realizadas (sin confirmar)'), visitSummary.get('Total')]).toEqual([1, 1, 2]);

    // F-38 Actividades.
    const activities = await client.get('/reports/activities?pageSize=100').expect(200);
    const activityFile = await download(owner.token, '/reports/activities/export');
    const activitySheet = sheet(activityFile.workbook, 'Datos');
    const activityRows = dataRows(activitySheet);
    expect(activityRows.map((row) => row[0]?.value)).toEqual((activities.body.data as { code: string }[]).map((row) => row.code));
    expect(activityRows.map((row) => row[column(activitySheet, 'Asunto') - 1]?.value)).toContain(`'-2 seguimiento`);
    const activitySummary = keyValues(sheet(activityFile.workbook, 'Resumen'));
    expect([activitySummary.get('Vencidas'), activitySummary.get('Realizadas'), activitySummary.get('Total')]).toEqual([1, 1, 2]);

    // RN-05.49: ninguna celda del libro es una fórmula.
    for (const file of [projectFile, opportunityFile, forecastFile, visitFile, activityFile]) {
      for (const worksheet of file.workbook.worksheets) {
        worksheet.eachRow((row) => row.eachCell((cell) => expect(cell.type).not.toBe(ValueType.Formula)));
      }
    }
  });
});

describe('Montos de oportunidades (PF-05.45, AC-05.46, RN-05.59)', () => {
  it('columnas de monto en orden y tipadas; "Resumen" solo en USD y fila referencial con un país de moneda local', async () => {
    const owner = await exporter(x2);
    await dataset(owner, x2);
    const file = await download(owner.token, `/reports/opportunities/export?countryId=${x2}&sortBy=estimatedAmountUsd&sortOrder=desc`);
    const data = sheet(file.workbook, 'Datos');
    const names = headers(data);
    const amount = names.indexOf('Monto estimado (original)');
    expect(names.slice(amount, amount + 6)).toEqual([
      'Monto estimado (original)',
      'Moneda',
      'Tipo de cambio',
      'Fecha del tipo de cambio',
      'Monto estimado (USD)',
      'Tonelaje estimado (t)',
    ]);
    const [local, usd] = dataRows(data);
    expect(local?.slice(amount, amount + 6).map((cell) => [cell.type, cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.value, cell.numFmt])).toEqual([
      [ValueType.Number, 7750, '#,##0.00'],
      [ValueType.String, RATE_CURRENCY, '@'],
      [ValueType.Number, 7.75, '#,##0.00000000'],
      [ValueType.Date, '2026-10-01', 'dd/mm/yyyy'],
      [ValueType.Number, 1000, '#,##0.00'],
      [ValueType.Number, 12.5, '#,##0.000'],
    ]);
    expect(usd?.slice(amount, amount + 5).map((cell) => cell.value)).toEqual([500, 'USD', 1, null, 500]);

    const summary = keyValues(sheet(file.workbook, 'Resumen'));
    expect(summary.get('Estimación total (USD)')).toBe(1500);
    // 1 500 USD × 7,75 = 11 625 XRB, con la tasa de mayor vigencia ≤ hoy.
    expect(summary.get(`Equivalente referencial en ${RATE_CURRENCY} (tasa del 2026-01-01)`)).toBe(11625);
    expect([...summary.keys()].filter((label) => label.includes(RATE_CURRENCY) && !label.startsWith('Equivalente'))).toEqual([]);
  });
});

describe('Forecast con consolidación (F.1: hoja "Consolidado")', () => {
  it('con groupBy y thenBy añade "Consolidado"; la suma de los grupos es el total del resumen', async () => {
    const owner = await exporter();
    await dataset(owner);
    const file = await download(owner.token, '/reports/forecast/export?groupBy=PROJECT&thenBy=MONTH');
    expect(file.workbook.worksheets.map((entry) => entry.name)).toEqual(['Datos', 'Consolidado', 'Resumen', 'Filtros']);
    const consolidated = sheet(file.workbook, 'Consolidado');
    const total = column(consolidated, 'Total (t)');
    const groups = dataRows(consolidated).filter((row) => row[1]?.type === ValueType.Null);
    expect(groups).toHaveLength(2);
    expect(groups.reduce((sum, row) => sum + Number(row[total - 1]?.value), 0)).toBe(1.5);
    expect(dataRows(consolidated).length).toBe(4);
    expect(keyValues(sheet(file.workbook, 'Filtros')).get('Agrupar por')).toBe('Proyecto');
  });
});

describe('Visibilidad en la exportación (AC-05.25, PF-05.22)', () => {
  it('un asesor OWN exporta solo lo suyo; el administrador, lo de ambos', async () => {
    const mine = await exporter();
    const other = await exporter();
    await dataset(mine);
    await dataset(other);
    const own = await download(mine.token, '/reports/opportunities/export');
    expect(dataRows(sheet(own.workbook, 'Datos'))).toHaveLength(2);
    expect(new Set(dataRows(sheet(own.workbook, 'Datos')).map((row) => row[4]?.value))).toEqual(new Set(['Persona De prueba']));
    // Filtrar por el asesor ajeno no amplía el alcance (RN-05.4): conjunto vacío, archivo válido.
    const foreign = await download(mine.token, `/reports/projects/export?ownerId=${other.id}`);
    expect(foreign.headers['x-export-rows']).toBe('0');
    expect(dataRows(sheet(foreign.workbook, 'Datos'))).toEqual([]);
    // La hoja "Filtros" no resuelve el nombre de un asesor fuera del alcance: muestra su id.
    expect(keyValues(sheet(foreign.workbook, 'Filtros')).get('Asesor')).toBe(other.id);
    const all = await download(admin.token, `/reports/projects/export?countryId=${x1}&ownerId=${mine.id}&ownerId=${other.id}`);
    expect(all.headers['x-export-rows']).toBe('4');
    expect(keyValues(sheet(all.workbook, 'Filtros')).get('Alcance')).toBe('Organización');
  });
});

describe('Tope de filas (PF-05.25, AC-05.26, RN-05.45)', () => {
  it('6 filas con tope 5 → 422 EXPORT_TOO_LARGE con filas y tope, sin archivo ni auditoría de éxito', async () => {
    const owner = await exporter();
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: x1 });
    for (let index = 0; index < 6; index += 1) await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: x1 });

    await withParameter(context.prisma, 'crm.reportes.max_filas_exportacion', '5', async () => {
      const response = await api(context, owner.token).get('/reports/projects/export').expect(422);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toMatchObject({ statusCode: 422, code: 'EXPORT_TOO_LARGE', details: [{ rows: 6, maxRows: 5 }], correlationId: expect.any(String) });
    });
    expect(await context.prisma.auditLog.count({ where: { subjectId: owner.id, event: 'crm.report.exported' } })).toBe(0);
    // Con el tope restaurado (100 000), la misma exportación sale completa.
    const file = await download(owner.token, '/reports/projects/export');
    expect(file.headers['x-export-rows']).toBe('6');
  });
});

describe('Auditoría de la exportación (PF-05.26, AC-05.27, RN-05.43)', () => {
  it('crm.report.exported con reporte, formato, filtros, alcance, filas y duración; nunca los datos', async () => {
    const owner = await exporter();
    const { customerId } = await dataset(owner);
    await download(owner.token, `/reports/activities/export?customerId=${customerId}&from=2024-01-01&to=2028-12-31&dateBasis=DUE`);
    const logs = await context.prisma.auditLog.findMany({ where: { subjectId: owner.id, event: 'crm.report.exported' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ resourceType: 'crm.report', resourceId: 'activities', changes: null });
    const metadata = logs[0]?.metadata as Record<string, unknown>;
    expect(JSON.parse(String(metadata['filters']))).toEqual({ from: '2024-01-01', to: '2028-12-31', dateBasis: 'DUE', customerId: [customerId], sortBy: 'activityDate', sortOrder: 'desc' });
    expect(metadata).toEqual({
      report: 'activities',
      format: 'xlsx',
      filters: expect.any(String),
      scope: 'OWN',
      rows: 2,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(logs[0]?.metadata)).not.toContain('seguimiento');
  });
});

describe('Validación de /export (PF-05.27, F.5)', () => {
  it.each([
    ['/reports/projects/export?page=1', 400, 'VALIDATION_FAILED'],
    ['/reports/opportunities/export?pageSize=10', 400, 'VALIDATION_FAILED'],
    ['/reports/visits/export?format=csv', 400, 'VALIDATION_FAILED'],
    ['/reports/activities/export?sortBy=subject', 400, 'VALIDATION_FAILED'],
    ['/reports/opportunities/export?from=2026-02-01&to=2026-01-01', 400, 'VALIDATION_FAILED'],
    ['/reports/forecast/export?thenBy=MONTH', 400, 'VALIDATION_FAILED'],
    ['/reports/forecast/export?groupBy=MONTH&thenBy=MONTH', 400, 'VALIDATION_FAILED'],
    ['/reports/visits/export?from=2020-01-01&to=2026-01-01', 422, 'PERIOD_TOO_LONG'],
    ['/reports/forecast/export?fromMonth=2026-01&toMonth=2028-01', 422, 'PERIOD_TOO_LONG'],
  ])('%s → %d %s', async (path, status, code) => {
    const owner = await exporter();
    const response = await api(context, owner.token).get(path);
    expect({ status: response.status, code: response.body.code }).toEqual({ status, code });
  });

  it('`format=xlsx` explícito es válido', async () => {
    const owner = await exporter();
    await download(owner.token, '/reports/activities/export?format=xlsx');
  });
});

describe('Límite de frecuencia (PF-05.28, F.4)', () => {
  it('la sexta exportación en un minuto → 429 RATE_LIMIT_EXCEEDED con Retry-After; otro usuario no se ve afectado', async () => {
    const owner = await exporter();
    const paths = ['/reports/activities/export', '/reports/visits/export', '/reports/projects/export', '/reports/opportunities/export', '/reports/forecast/export'];
    for (const path of paths) await api(context, owner.token).get(path).expect(200);
    const blocked = await api(context, owner.token).get('/reports/activities/export');
    expect({ status: blocked.status, code: blocked.body.code }).toEqual({ status: 429, code: 'RATE_LIMIT_EXCEEDED' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Las lecturas de pantalla no cuentan para el límite de exportación.
    await api(context, owner.token).get('/reports/activities').expect(200);
    const other = await exporter();
    await api(context, other.token).get('/reports/activities/export').expect(200);
  });
});
