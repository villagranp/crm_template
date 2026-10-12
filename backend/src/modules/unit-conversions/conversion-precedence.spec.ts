import {
  type ConversionTarget,
  convertQuantity,
  precedenceFor,
  ruleApplicabilityIssues,
  scopeKeysFor,
  selectConversionRule,
  tonnageUnitIssues,
} from './conversion-precedence';
import type { ConversionRuleRecord, ConversionScopeCode, UnitRecord } from './ports/unit-conversion.reader.port';

const M2 = 'unit-m2';
const TON = 'unit-ton';
const PRODUCT = 'product-1';
const FAMILY = 'family-1';
const TYPE = 'type-vivienda';

function rule(scope: ConversionScopeCode, overrides: Partial<ConversionRuleRecord> = {}): ConversionRuleRecord {
  const scopeKey = { GLOBAL: 'GLOBAL', PRODUCT, PRODUCT_FAMILY: FAMILY, PROJECT_TYPE: TYPE }[scope];
  return { id: `rule-${scope}`, fromUnitId: M2, toUnitId: TON, factor: '0.02500000', scope, scopeKey, isActive: true, ...overrides };
}

const LINE: ConversionTarget = { fromUnitId: M2, toUnitId: TON, keys: { productId: PRODUCT, productFamilyId: FAMILY, projectTypeId: TYPE } };
const PROJECT: ConversionTarget = { fromUnitId: M2, toUnitId: TON, keys: { productId: null, productFamilyId: null, projectTypeId: TYPE } };
const ALL = [rule('GLOBAL'), rule('PROJECT_TYPE'), rule('PRODUCT_FAMILY'), rule('PRODUCT')];

describe('conversion-precedence (PF-03.41)', () => {
  it('precedencia de línea y de proyecto', () => {
    expect(precedenceFor(LINE.keys)).toEqual(['PRODUCT', 'PRODUCT_FAMILY', 'PROJECT_TYPE', 'GLOBAL']);
    expect(precedenceFor(PROJECT.keys)).toEqual(['PROJECT_TYPE', 'GLOBAL']);
  });

  it('scopeKeysFor omite los ámbitos sin clave y producto/familia en un proyecto', () => {
    expect(scopeKeysFor(LINE.keys)).toEqual([PRODUCT, FAMILY, TYPE, 'GLOBAL']);
    expect(scopeKeysFor(PROJECT.keys)).toEqual([TYPE, 'GLOBAL']);
    expect(scopeKeysFor({ productId: null, productFamilyId: FAMILY, projectTypeId: null })).toEqual(['GLOBAL']);
  });

  describe('selectConversionRule', () => {
    it('línea: PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL', () => {
      expect(selectConversionRule(ALL, LINE)?.scope).toBe('PRODUCT');
      expect(selectConversionRule(ALL.filter((r) => r.scope !== 'PRODUCT'), LINE)?.scope).toBe('PRODUCT_FAMILY');
      expect(selectConversionRule([rule('GLOBAL'), rule('PROJECT_TYPE')], LINE)?.scope).toBe('PROJECT_TYPE');
      expect(selectConversionRule([rule('GLOBAL')], LINE)?.scope).toBe('GLOBAL');
    });

    it('proyecto: PROJECT_TYPE > GLOBAL, ignorando producto y familia (AC-03.31)', () => {
      expect(selectConversionRule(ALL, PROJECT)?.scope).toBe('PROJECT_TYPE');
      expect(selectConversionRule([rule('PRODUCT'), rule('PRODUCT_FAMILY'), rule('GLOBAL')], PROJECT)?.scope).toBe('GLOBAL');
      expect(selectConversionRule([rule('PRODUCT'), rule('PRODUCT_FAMILY')], PROJECT)).toBeNull();
    });

    it('otro tipo de proyecto usa la GLOBAL', () => {
      const otherType: ConversionTarget = { ...PROJECT, keys: { ...PROJECT.keys, projectTypeId: 'type-otro' } };
      expect(selectConversionRule(ALL, otherType)?.scope).toBe('GLOBAL');
    });

    it('ignora reglas inactivas y cae a la siguiente precedencia', () => {
      const rules = [rule('PRODUCT', { isActive: false }), rule('GLOBAL')];
      expect(selectConversionRule(rules, LINE)?.scope).toBe('GLOBAL');
      expect(selectConversionRule([rule('GLOBAL', { isActive: false })], LINE)).toBeNull();
    });

    it('ignora reglas hacia otra unidad o desde otra unidad', () => {
      expect(selectConversionRule([rule('GLOBAL', { toUnitId: 'unit-kg' })], LINE)).toBeNull();
      expect(selectConversionRule([rule('GLOBAL', { fromUnitId: 'unit-m' })], LINE)).toBeNull();
    });

    it('ignora reglas de otro producto, familia o tipo', () => {
      const foreign = [
        rule('PRODUCT', { scopeKey: 'product-2' }),
        rule('PRODUCT_FAMILY', { scopeKey: 'family-2' }),
        rule('PROJECT_TYPE', { scopeKey: 'type-2' }),
      ];
      expect(selectConversionRule(foreign, LINE)).toBeNull();
    });
  });

  describe('ruleApplicabilityIssues (RN-03.28)', () => {
    it('regla válida → sin incidencias', () => {
      expect(ruleApplicabilityIssues(rule('PROJECT_TYPE'), PROJECT)).toEqual([]);
    });

    it('enumera todas las incidencias a la vez', () => {
      const bad = rule('PRODUCT', { isActive: false, fromUnitId: 'unit-m', toUnitId: 'unit-kg', factor: '0' });
      expect(ruleApplicabilityIssues(bad, PROJECT)).toEqual([
        'INACTIVE',
        'FROM_UNIT_MISMATCH',
        'TO_UNIT_MISMATCH',
        'SCOPE_NOT_APPLICABLE',
        'NON_POSITIVE_FACTOR',
      ]);
    });

    it('identidad con factor distinto de 1', () => {
      const identity: ConversionTarget = { fromUnitId: TON, toUnitId: TON, keys: PROJECT.keys };
      expect(ruleApplicabilityIssues(rule('GLOBAL', { fromUnitId: TON, factor: '1.00000000' }), identity)).toEqual([]);
      expect(ruleApplicabilityIssues(rule('GLOBAL', { fromUnitId: TON, factor: '2' }), identity)).toEqual(['IDENTITY_FACTOR_NOT_ONE']);
    });
  });

  it('convertQuantity: round(q × f, 4, HALF_UP) sin flotantes (PF-03.42)', () => {
    expect(convertQuantity('12000', '0.02500000')).toBe('300.0000');
    expect(convertQuantity('20000', '0.00336000')).toBe('67.2000');
    expect(convertQuantity('1', '0.00045359')).toBe('0.0005');
    expect(convertQuantity('999999999999999.9999', '0.00000001')).toBe('10000000.0000');
    expect(convertQuantity('0', '0.5')).toBe('0.0000');
  });

  describe('tonnageUnitIssues (RN-07.33)', () => {
    const ton: UnitRecord = { id: TON, code: 'TON', name: 'Tonelada', symbol: 't', dimension: 'MASS', isActive: true };
    const identity = rule('GLOBAL', { fromUnitId: TON, toUnitId: TON, factor: '1.00000000' });

    it('unidad activa de masa con identidad GLOBAL activa → válida', () => {
      expect(tonnageUnitIssues(ton, [identity])).toEqual([]);
    });

    it('inexistente, inactiva, de otra dimensión o sin identidad activa', () => {
      expect(tonnageUnitIssues(null, [])).toEqual(['UNIT_NOT_FOUND']);
      expect(tonnageUnitIssues({ ...ton, isActive: false }, [identity])).toEqual(['UNIT_INACTIVE']);
      expect(tonnageUnitIssues({ ...ton, dimension: 'AREA' }, [identity])).toEqual(['UNIT_NOT_MASS']);
      expect(tonnageUnitIssues(ton, [])).toEqual(['IDENTITY_RULE_MISSING']);
      expect(tonnageUnitIssues(ton, [{ ...identity, isActive: false }])).toEqual(['IDENTITY_RULE_MISSING']);
    });
  });
});
