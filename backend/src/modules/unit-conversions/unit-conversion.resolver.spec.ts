import { BusinessRuleViolationError } from '@/common/errors/application-error';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { ConversionRuleRecord, UnitConversionReader, UnitRecord } from './ports/unit-conversion.reader.port';
import { TonnageUnitUnavailableError } from './unit-conversion-errors';
import { UnitConversionResolver } from './unit-conversion.resolver';

const TON = '00000000-0000-4000-8000-000000000001';
const M2 = '00000000-0000-4000-8000-000000000002';
const VAR = '00000000-0000-4000-8000-000000000003';
const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const FAMILY = '00000000-0000-4000-8000-0000000000b1';
const TYPE = '00000000-0000-4000-8000-0000000000c1';
const TX = {} as TransactionContext;
const R_IDENTITY = '00000000-0000-4000-8000-0000000000d0';
const R_M2_GLOBAL = '00000000-0000-4000-8000-0000000000d1';
const R_M2_TYPE = '00000000-0000-4000-8000-0000000000d2';
const R_M2_FAMILY = '00000000-0000-4000-8000-0000000000d3';
const R_VAR_PRODUCT = '00000000-0000-4000-8000-0000000000d4';

const UNITS: Record<string, UnitRecord> = {
  TON: { id: TON, code: 'TON', name: 'Tonelada', symbol: 't', dimension: 'MASS', isActive: true },
  M2: { id: M2, code: 'M2', name: 'Metro cuadrado', symbol: 'm²', dimension: 'AREA', isActive: true },
};

const RULES: ConversionRuleRecord[] = [
  { id: R_IDENTITY, fromUnitId: TON, toUnitId: TON, factor: '1.00000000', scope: 'GLOBAL', scopeKey: 'GLOBAL', isActive: true },
  { id: R_M2_GLOBAL, fromUnitId: M2, toUnitId: TON, factor: '0.01000000', scope: 'GLOBAL', scopeKey: 'GLOBAL', isActive: true },
  { id: R_M2_TYPE, fromUnitId: M2, toUnitId: TON, factor: '0.02500000', scope: 'PROJECT_TYPE', scopeKey: TYPE, isActive: true },
  { id: R_M2_FAMILY, fromUnitId: M2, toUnitId: TON, factor: '0.03000000', scope: 'PRODUCT_FAMILY', scopeKey: FAMILY, isActive: true },
  { id: R_VAR_PRODUCT, fromUnitId: VAR, toUnitId: TON, factor: '0.00336000', scope: 'PRODUCT', scopeKey: PRODUCT, isActive: false },
];

function setup(tonnageUnitCode = 'TON') {
  const reader: jest.Mocked<UnitConversionReader> = {
    findUnitByCode: jest.fn(async (code: string) => UNITS[code] ?? null),
    findProductFamilyId: jest.fn(async (productId: string) => (productId === PRODUCT ? FAMILY : null)),
    findRules: jest.fn(async (from: string, to: string, keys: readonly string[]) =>
      RULES.filter((rule) => rule.fromUnitId === from && rule.toUnitId === to && keys.includes(rule.scopeKey)),
    ),
    findRuleById: jest.fn(async (id: string) => RULES.find((rule) => rule.id === id) ?? null),
  };
  const parameters = { get: jest.fn(async () => tonnageUnitCode) };
  const resolver = new UnitConversionResolver(reader, parameters as unknown as ParameterReader);
  return { resolver, reader, parameters };
}

describe('UnitConversionResolver', () => {
  it('proyecto VIVIENDA en m²: regla de tipo (PROJECT_TYPE > GLOBAL) con la unidad de tonelaje', async () => {
    const { resolver, reader } = setup();
    await expect(resolver.resolve({ fromUnitId: M2, projectTypeId: TYPE }, TX)).resolves.toEqual({
      ruleId: R_M2_TYPE,
      scope: 'PROJECT_TYPE',
      factor: '0.02500000',
      fromUnitId: M2,
      toUnit: { id: TON, code: 'TON', symbol: 't' },
    });
    expect(reader.findRules).toHaveBeenCalledWith(M2, TON, [TYPE, 'GLOBAL'], TX);
    expect(reader.findProductFamilyId).not.toHaveBeenCalled();
  });

  it('proyecto sin tipo: GLOBAL; la regla de familia no aplica a un proyecto', async () => {
    const { resolver } = setup();
    await expect(resolver.resolve({ fromUnitId: M2 })).resolves.toMatchObject({ ruleId: R_M2_GLOBAL });
  });

  it('línea: resuelve la familia del producto y aplica PRODUCT_FAMILY antes que PROJECT_TYPE', async () => {
    const { resolver, reader } = setup();
    await expect(resolver.resolve({ fromUnitId: M2, productId: PRODUCT, projectTypeId: TYPE }, TX)).resolves.toMatchObject({
      ruleId: R_M2_FAMILY,
      scope: 'PRODUCT_FAMILY',
    });
    expect(reader.findProductFamilyId).toHaveBeenCalledWith(PRODUCT, TX);
    expect(reader.findRules).toHaveBeenCalledWith(M2, TON, [PRODUCT, FAMILY, TYPE, 'GLOBAL'], TX);
  });

  it('identidad: una línea en toneladas usa la regla TON → TON de factor 1', async () => {
    const { resolver } = setup();
    await expect(resolver.resolve({ fromUnitId: TON, productId: PRODUCT })).resolves.toMatchObject({ ruleId: R_IDENTITY, factor: '1.00000000' });
  });

  it('sin regla activa → null ("sin conversión"); una unidad que no es UUID también', async () => {
    const { resolver } = setup();
    await expect(resolver.resolve({ fromUnitId: VAR, productId: PRODUCT })).resolves.toBeNull();
    await expect(resolver.resolve({ fromUnitId: 'no-es-uuid' })).resolves.toBeNull();
  });

  it('require: sin regla → 422 CONVERSION_RULE_NOT_FOUND con el campo y la unidad destino (AC-03.32)', async () => {
    const { resolver } = setup();
    const error = await resolver.require({ fromUnitId: VAR }, { field: 'measureUnitId' }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BusinessRuleViolationError);
    expect(error).toMatchObject({
      code: 'CONVERSION_RULE_NOT_FOUND',
      details: [{ field: 'measureUnitId', code: 'CONVERSION_RULE_NOT_FOUND', fromUnitId: VAR, toUnitCode: 'TON' }],
    });
  });

  it('la unidad destino sale del parámetro: con M2 como destino no hay regla m² → m²', async () => {
    const { resolver } = setup('M2');
    await expect(resolver.resolve({ fromUnitId: M2, projectTypeId: TYPE })).resolves.toBeNull();
  });

  it('unidad de tonelaje inexistente → TonnageUnitUnavailableError (fallo de configuración)', async () => {
    const { resolver } = setup('NOPE');
    await expect(resolver.resolve({ fromUnitId: M2 })).rejects.toBeInstanceOf(TonnageUnitUnavailableError);
  });

  describe('assertApplicable (RN-03.28)', () => {
    it('regla válida para el proyecto → la devuelve resuelta', async () => {
      const { resolver } = setup();
      await expect(resolver.assertApplicable(R_M2_GLOBAL, { fromUnitId: M2, projectTypeId: TYPE })).resolves.toMatchObject({
        ruleId: R_M2_GLOBAL,
        scope: 'GLOBAL',
      });
    });

    it('regla inactiva, de otro ámbito o inexistente → 422 INVALID_CONVERSION_RULE con los motivos', async () => {
      const { resolver } = setup();
      await expect(resolver.assertApplicable(R_VAR_PRODUCT, { fromUnitId: M2 })).rejects.toMatchObject({
        code: 'INVALID_CONVERSION_RULE',
        details: [
          {
            field: 'conversionRuleId',
            code: 'INVALID_CONVERSION_RULE',
            ruleId: R_VAR_PRODUCT,
            reasons: ['INACTIVE', 'FROM_UNIT_MISMATCH', 'SCOPE_NOT_APPLICABLE'],
          },
        ],
      });
      await expect(resolver.assertApplicable(R_M2_FAMILY, { fromUnitId: M2, projectTypeId: TYPE })).rejects.toMatchObject({
        details: [expect.objectContaining({ reasons: ['SCOPE_NOT_APPLICABLE'] })],
      });
      await expect(resolver.assertApplicable('r-desconocida', { fromUnitId: M2 })).rejects.toMatchObject({
        details: [expect.objectContaining({ reasons: ['NOT_FOUND'] })],
      });
    });
  });

  it('tonnageFor calcula con el factor resuelto', () => {
    const { resolver } = setup();
    expect(resolver.tonnageFor('12000', { factor: '0.02500000' })).toBe('300.0000');
  });

  it('tonnageUnitCandidateIssues: TON válida, M2 no es masa y sin identidad, código inexistente', async () => {
    const { resolver, reader } = setup();
    await expect(resolver.tonnageUnitCandidateIssues('TON')).resolves.toEqual([]);
    expect(reader.findRules).toHaveBeenCalledWith(TON, TON, ['GLOBAL'], undefined);
    await expect(resolver.tonnageUnitCandidateIssues('M2')).resolves.toEqual(['UNIT_NOT_MASS', 'IDENTITY_RULE_MISSING']);
    await expect(resolver.tonnageUnitCandidateIssues('NOPE')).resolves.toEqual(['UNIT_NOT_FOUND']);
  });
});
