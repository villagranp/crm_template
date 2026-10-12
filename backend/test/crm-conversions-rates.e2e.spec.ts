import { CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';
import { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';

import { api, catalogItemId, insertCustomer, insertProject, testCountry, uniqueSuffix } from './support/crm-fixtures';
import { closeTestContext, createTestContext, createTestUser, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Piezas transversales del Módulo 3 (03 §K.1.2, E1) contra PostgreSQL real:
 * `CurrencyConversionService` sobre el adaptador de `ExchangeRateReader` (ADR-024,
 * 00 §2.16), `UnitConversionResolver` sobre el adaptador de reglas (00 §2.3,
 * 03 C.5) y la regla RN-07.33 de `PATCH /parameters/crm.forecast.unidad_tonelaje`.
 *
 * Aislamiento (las suites corren en paralelo sobre el mismo esquema): monedas
 * propias `XTA`/`XTB`, países `R1`–`R3`, unidades, familias y productos con códigos
 * únicos. No se cambia ningún parámetro compartido: los casos de antigüedad usan
 * edades fuera del rango admitido del umbral (1–366), así que no dependen de su valor.
 */

let context: TestContext;
let currencies: CurrencyConversionService;
let resolver: UnitConversionResolver;
let transactions: TransactionRunner;

const COUNTRY_LOCAL = 'R1';
const COUNTRY_USD = 'R2';
const COUNTRY_INACTIVE_CURRENCY = 'R3';
let localCountryId: string;
let usdCountryId: string;
let inactiveCurrencyCountryId: string;

beforeAll(async () => {
  context = await createTestContext();
  currencies = context.app.get(CurrencyConversionService);
  resolver = context.app.get(UnitConversionResolver);
  transactions = context.app.get<TransactionRunner>(TRANSACTION_RUNNER);

  const { prisma } = context;
  await prisma.currency.upsert({ where: { code: 'XTA' }, update: { isActive: true }, create: { code: 'XTA', name: 'Moneda de prueba A', symbol: 'A$' } });
  await prisma.currency.upsert({ where: { code: 'XTB' }, update: { isActive: false }, create: { code: 'XTB', name: 'Moneda de prueba B', symbol: 'B$', isActive: false } });
  localCountryId = await testCountry(prisma, COUNTRY_LOCAL, { currencyCode: 'XTA' });
  usdCountryId = await testCountry(prisma, COUNTRY_USD, { currencyCode: 'USD' });
  inactiveCurrencyCountryId = await testCountry(prisma, COUNTRY_INACTIVE_CURRENCY, { currencyCode: 'XTB' });

  for (const [effectiveDate, ratePerUsd] of [
    ['2026-01-01', '10'],
    ['2026-03-01', '12.5'],
  ] as const) {
    await prisma.exchangeRate.upsert({
      where: { currencyCode_effectiveDate: { currencyCode: 'XTA', effectiveDate: new Date(`${effectiveDate}T00:00:00Z`) } },
      update: { ratePerUsd },
      create: { currencyCode: 'XTA', effectiveDate: new Date(`${effectiveDate}T00:00:00Z`), ratePerUsd, source: 'prueba de integración' },
    });
  }
});

afterAll(async () => {
  await closeTestContext(context);
});

describe('CurrencyConversionService (PostgreSQL)', () => {
  it('monedas admitidas por país: base + local activa; país en USD; moneda local inactiva (RN-03.78)', async () => {
    await expect(currencies.allowedCurrencies(localCountryId)).resolves.toEqual({
      baseCurrencyCode: 'USD',
      defaultCurrencyCode: 'XTA',
      allowed: [
        { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2 },
        { code: 'XTA', name: 'Moneda de prueba A', symbol: 'A$', decimals: 2 },
      ],
    });
    expect((await currencies.allowedCurrencies(usdCountryId)).allowed.map((currency) => currency.code)).toEqual(['USD']);
    await expect(currencies.allowedCurrencies(inactiveCurrencyCountryId)).resolves.toMatchObject({
      defaultCurrencyCode: 'USD',
      allowed: [expect.objectContaining({ code: 'USD' })],
    });
  });

  it('las monedas sembradas de los países reales: Guatemala admite GTQ, El Salvador solo USD', async () => {
    const gt = (await context.prisma.country.findUniqueOrThrow({ where: { isoCode: 'GT' } })).id;
    const sv = (await context.prisma.country.findUniqueOrThrow({ where: { isoCode: 'SV' } })).id;
    expect((await currencies.allowedCurrencies(gt)).allowed.map((currency) => currency.code)).toEqual(['USD', 'GTQ']);
    expect((await currencies.allowedCurrencies(sv)).allowed.map((currency) => currency.code)).toEqual(['USD']);
  });

  it('findApplicable: mayor vigencia ≤ fecha, el mismo día cuenta, antes de la primera → null; USD sin fila', async () => {
    await expect(currencies.findApplicable('XTA', '2026-02-28')).resolves.toEqual({
      currencyCode: 'XTA',
      ratePerUsd: '10.00000000',
      effectiveDate: '2026-01-01',
      isBaseCurrency: false,
    });
    await expect(currencies.findApplicable('XTA', '2026-03-01')).resolves.toMatchObject({ ratePerUsd: '12.50000000', effectiveDate: '2026-03-01' });
    await expect(currencies.findApplicable('XTA', '2030-12-31')).resolves.toMatchObject({ effectiveDate: '2026-03-01' });
    await expect(currencies.findApplicable('XTA', '2025-12-31')).resolves.toBeNull();
    await expect(currencies.findApplicable('USD', '2026-03-01')).resolves.toMatchObject({ ratePerUsd: '1.00000000', effectiveDate: null });
  });

  it('convertToBase en moneda local: foto de la tasa y equivalente USD exacto, sin aviso el mismo día', async () => {
    await expect(
      currencies.convertToBase({ amount: '1000', currencyCode: 'XTA', referenceDate: '2026-03-01', countryId: localCountryId }),
    ).resolves.toEqual({
      amount: '1000.0000',
      currencyCode: 'XTA',
      exchangeRate: '12.50000000',
      exchangeRateDate: '2026-03-01',
      amountInBaseCurrency: '80.0000',
      baseCurrencyCode: 'USD',
      warnings: [],
    });
  });

  it('tasa más antigua que cualquier umbral admitido → se convierte con EXCHANGE_RATE_STALE (RN-03.81)', async () => {
    const result = await currencies.convertToBase({ amount: '100', currencyCode: 'XTA', referenceDate: '2027-04-06', countryId: localCountryId });
    expect(result.amountInBaseCurrency).toBe('8.0000');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'EXCHANGE_RATE_STALE',
      details: { currencyCode: 'XTA', exchangeRateDate: '2026-03-01', referenceDate: '2027-04-06', ageDays: 401 },
    });
  });

  it('sin tasa ≤ fecha → 422 EXCHANGE_RATE_NOT_FOUND; moneda no admitida → 422 CURRENCY_NOT_ALLOWED', async () => {
    await expect(
      currencies.convertToBase({ amount: '1', currencyCode: 'XTA', referenceDate: '2025-06-30', countryId: localCountryId }),
    ).rejects.toMatchObject({
      code: 'EXCHANGE_RATE_NOT_FOUND',
      details: [{ field: 'currencyCode', code: 'EXCHANGE_RATE_NOT_FOUND', currencyCode: 'XTA', date: '2025-06-30' }],
    });
    await expect(
      currencies.convertToBase({ amount: '1', currencyCode: 'XTA', referenceDate: '2026-03-01', countryId: usdCountryId }),
    ).rejects.toMatchObject({ code: 'CURRENCY_NOT_ALLOWED', details: [expect.objectContaining({ allowedCurrencyCodes: ['USD'] })] });
    await expect(
      currencies.convertToBase({ amount: '1', currencyCode: 'XTB', referenceDate: '2026-03-01', countryId: inactiveCurrencyCountryId }),
    ).rejects.toMatchObject({ code: 'CURRENCY_NOT_ALLOWED' });
  });

  it('dentro de una transacción, y su resultado cumple los CHECK de la oportunidad (moneda local y USD)', async () => {
    const owner = await createTestUser(context.prisma, { roleCodes: ['asesor'] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: localCountryId });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: localCountryId });
    const stageId = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'CONTACTADO');

    for (const currencyCode of ['XTA', 'USD']) {
      const estimate = await transactions.run((tx) =>
        currencies.convertToBase({ amount: '2500.5', currencyCode, referenceDate: '2026-03-15', countryId: localCountryId, tx }),
      );
      const saved = await context.prisma.opportunity.create({
        data: {
          code: `TEST-OPO-${uniqueSuffix()}`,
          projectId,
          stageId,
          ownerId: owner.id,
          opportunityDate: new Date('2026-03-15T00:00:00Z'),
          estimatedAmount: estimate.amount,
          currencyCode: estimate.currencyCode,
          exchangeRate: estimate.exchangeRate,
          exchangeRateDate: estimate.exchangeRateDate ? new Date(`${estimate.exchangeRateDate}T00:00:00Z`) : null,
          estimatedAmountUsd: estimate.amountInBaseCurrency,
        },
      });
      expect(saved.estimatedAmountUsd?.toFixed(4)).toBe(currencyCode === 'USD' ? '2500.5000' : '200.0400');
    }
  });
});

describe('UnitConversionResolver (PostgreSQL)', () => {
  const suffix = uniqueSuffix();
  let ton: { id: string };
  let area: string;
  let count: string;
  let family: string;
  let otherFamily: string;
  let product: string;
  let otherProduct: string;
  let vivienda: string;
  let edificio: string;
  const ruleIds: Record<string, string> = {};

  beforeAll(async () => {
    const { prisma } = context;
    ton = await prisma.unitOfMeasure.findUniqueOrThrow({ where: { code: 'TON' }, select: { id: true } });
    const kg = await prisma.unitOfMeasure.findUniqueOrThrow({ where: { code: 'KG' }, select: { id: true } });
    area = (await prisma.unitOfMeasure.create({ data: { code: `TA${suffix}`, name: 'Área de prueba', symbol: 'a', dimension: 'AREA' } })).id;
    count = (await prisma.unitOfMeasure.create({ data: { code: `TC${suffix}`, name: 'Pieza de prueba', symbol: 'p', dimension: 'COUNT' } })).id;
    family = (await prisma.productFamily.create({ data: { code: `TF-${suffix}`, name: 'Familia de prueba' } })).id;
    otherFamily = (await prisma.productFamily.create({ data: { code: `TG-${suffix}`, name: 'Otra familia de prueba' } })).id;
    product = (await prisma.product.create({ data: { sku: `TEST-${suffix}-1`, description: 'Producto de prueba', familyId: family, baseUnitId: area } })).id;
    otherProduct = (
      await prisma.product.create({ data: { sku: `TEST-${suffix}-2`, description: 'Otro producto', familyId: otherFamily, baseUnitId: count } })
    ).id;
    vivienda = await catalogItemId(prisma, 'crm.tipo_proyecto', 'VIVIENDA');
    edificio = await catalogItemId(prisma, 'crm.tipo_proyecto', 'EDIFICIO');

    const rule = async (
      name: string,
      data: { fromUnitId: string; toUnitId?: string; factor: string; scope: 'GLOBAL' | 'PRODUCT' | 'PRODUCT_FAMILY' | 'PROJECT_TYPE'; scopeId?: string; isActive?: boolean },
    ) => {
      const created = await prisma.unitConversionRule.create({
        data: {
          fromUnitId: data.fromUnitId,
          toUnitId: data.toUnitId ?? ton.id,
          factor: data.factor,
          scope: data.scope,
          scopeKey: data.scopeId ?? 'GLOBAL',
          productId: data.scope === 'PRODUCT' ? data.scopeId : null,
          productFamilyId: data.scope === 'PRODUCT_FAMILY' ? data.scopeId : null,
          projectTypeId: data.scope === 'PROJECT_TYPE' ? data.scopeId : null,
          isActive: data.isActive ?? true,
          description: `prueba ${name}`,
        },
      });
      ruleIds[name] = created.id;
    };
    await rule('areaGlobal', { fromUnitId: area, factor: '0.01', scope: 'GLOBAL' });
    await rule('areaVivienda', { fromUnitId: area, factor: '0.025', scope: 'PROJECT_TYPE', scopeId: vivienda });
    await rule('areaEdificioInactive', { fromUnitId: area, factor: '0.04', scope: 'PROJECT_TYPE', scopeId: edificio, isActive: false });
    await rule('areaFamily', { fromUnitId: area, factor: '0.03', scope: 'PRODUCT_FAMILY', scopeId: family });
    await rule('areaToKg', { fromUnitId: area, toUnitId: kg.id, factor: '10', scope: 'GLOBAL' });
    await rule('countProductInactive', { fromUnitId: count, factor: '0.004', scope: 'PRODUCT', scopeId: otherProduct, isActive: false });
  });

  it('proyecto: PROJECT_TYPE > GLOBAL; una regla de tipo inactiva no aplica (AC-03.31)', async () => {
    await expect(resolver.resolve({ fromUnitId: area, projectTypeId: vivienda })).resolves.toEqual({
      ruleId: ruleIds['areaVivienda'],
      scope: 'PROJECT_TYPE',
      factor: '0.02500000',
      fromUnitId: area,
      toUnit: { id: ton.id, code: 'TON', symbol: 't' },
    });
    await expect(resolver.resolve({ fromUnitId: area, projectTypeId: edificio })).resolves.toMatchObject({ ruleId: ruleIds['areaGlobal'] });
    // La regla por familia nunca aplica a un proyecto (RN-03.27).
    await expect(resolver.resolve({ fromUnitId: area })).resolves.toMatchObject({ ruleId: ruleIds['areaGlobal'] });
  });

  it('línea: PRODUCT_FAMILY (resuelta desde el producto) > PROJECT_TYPE > GLOBAL (RN-03.58)', async () => {
    await expect(resolver.resolve({ fromUnitId: area, productId: product, projectTypeId: vivienda })).resolves.toMatchObject({
      ruleId: ruleIds['areaFamily'],
      scope: 'PRODUCT_FAMILY',
    });
    await expect(resolver.resolve({ fromUnitId: area, productId: otherProduct, projectTypeId: vivienda })).resolves.toMatchObject({
      ruleId: ruleIds['areaVivienda'],
    });
  });

  it('identidad: una línea en toneladas usa la regla TON → TON de la semilla esencial', async () => {
    await expect(resolver.resolve({ fromUnitId: ton.id, productId: product })).resolves.toMatchObject({ scope: 'GLOBAL', factor: '1.00000000' });
  });

  it('sin regla activa: resolve → null y require → 422 CONVERSION_RULE_NOT_FOUND (AC-03.32)', async () => {
    await expect(resolver.resolve({ fromUnitId: count, productId: otherProduct })).resolves.toBeNull();
    await expect(resolver.require({ fromUnitId: count, productId: otherProduct }, { field: 'unitId' })).rejects.toMatchObject({
      code: 'CONVERSION_RULE_NOT_FOUND',
      details: [{ field: 'unitId', code: 'CONVERSION_RULE_NOT_FOUND', fromUnitId: count, toUnitCode: 'TON' }],
    });
  });

  it('assertApplicable: regla hacia otra unidad o inactiva → 422 INVALID_CONVERSION_RULE (RN-03.28)', async () => {
    await expect(resolver.assertApplicable(ruleIds['areaToKg']!, { fromUnitId: area })).rejects.toMatchObject({
      code: 'INVALID_CONVERSION_RULE',
      details: [expect.objectContaining({ reasons: ['TO_UNIT_MISMATCH'] })],
    });
    await expect(resolver.assertApplicable(ruleIds['areaEdificioInactive']!, { fromUnitId: area, projectTypeId: edificio })).rejects.toMatchObject({
      details: [expect.objectContaining({ reasons: ['INACTIVE'] })],
    });
    await expect(resolver.assertApplicable(ruleIds['areaGlobal']!, { fromUnitId: area })).resolves.toMatchObject({ factor: '0.01000000' });
  });

  it('la foto resuelta cumple la FK compuesta y ck_projects_conversion al clasificar un proyecto', async () => {
    const owner = await createTestUser(context.prisma, { roleCodes: ['asesor'] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: usdCountryId });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: usdCountryId });

    const conversion = await transactions.run((tx) => resolver.require({ fromUnitId: area, projectTypeId: vivienda }, { tx }));
    const tonnage = resolver.tonnageFor('12000.5', conversion);
    expect(tonnage).toBe('300.0125');

    const saved = await context.prisma.project.update({
      where: { id: projectId },
      data: {
        projectTypeId: vivienda,
        measureUnitId: area,
        estimatedQuantity: '12000.5',
        conversionRuleId: conversion.ruleId,
        conversionFactor: conversion.factor,
        estimatedTonnage: tonnage,
      },
    });
    expect(saved.estimatedTonnage?.toFixed(4)).toBe('300.0125');
  });
});

describe('PATCH /parameters/crm.forecast.unidad_tonelaje (RN-07.33)', () => {
  const KEY = 'crm.forecast.unidad_tonelaje';

  async function patch(value: string) {
    const { token } = await tokenWithRoles(context, ['administrador']);
    return api(context, token).patch(`/parameters/${KEY}`).send({ value });
  }

  it('KG (masa sin identidad), M2 (no es masa) y un código inexistente → 422 sin cambiar el valor', async () => {
    const before = await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: KEY } });

    const kg = await patch('KG');
    expect(kg.status).toBe(422);
    expect(kg.body).toMatchObject({
      code: 'INVALID_PARAMETER_VALUE',
      details: [expect.objectContaining({ field: 'value', reason: 'IDENTITY_RULE_MISSING', unitCode: 'KG' })],
    });

    const m2 = await patch('M2');
    expect(m2.status).toBe(422);
    expect((m2.body.details as Array<{ reason: string }>).map((detail) => detail.reason)).toEqual(['UNIT_NOT_MASS', 'IDENTITY_RULE_MISSING']);

    const missing = await patch('NOEXISTE1');
    expect(missing.status).toBe(422);
    expect(missing.body.details).toEqual([expect.objectContaining({ reason: 'UNIT_NOT_FOUND' })]);

    const after = await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: KEY } });
    expect(after.value).toBe(before.value);
  });

  it('TON (masa, activa, con identidad GLOBAL) se acepta', async () => {
    const response = await patch('TON');
    expect(response.status).toBe(200);
  });
});
