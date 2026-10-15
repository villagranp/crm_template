import {
  dimensionLockedError,
  duplicateError,
  FAMILY_CODE_PATTERN,
  invalidScopeError,
  invalidTargetError,
  isIdentityRule,
  isPositiveFactor,
  isTonnageIdentity,
  normalizeCode,
  normalizeFactor,
  protectedRuleError,
  scopeIssues,
  scopeKeyFor,
  SKU_PATTERN,
  UNIT_CODE_PATTERN,
  unknownReferenceError,
} from './master-data-rules';

describe('Reglas de maestros comerciales (07 F.7, RN-07.36, RN-07.37)', () => {
  it('normalizeCode y patrones de código y SKU', () => {
    expect(normalizeCode('  acero-largo ')).toBe('ACERO-LARGO');
    expect(FAMILY_CODE_PATTERN.test('ACERO-LARGO')).toBe(true);
    expect(FAMILY_CODE_PATTERN.test('-ACERO')).toBe(false);
    expect(UNIT_CODE_PATTERN.test('M2')).toBe(true);
    expect(UNIT_CODE_PATTERN.test('M-2')).toBe(false);
    expect(SKU_PATTERN.test('VAR-3/8 G.60')).toBe(true);
    expect(SKU_PATTERN.test('VAR\t3')).toBe(false);
  });

  it('isPositiveFactor y normalizeFactor', () => {
    expect(isPositiveFactor('0.001')).toBe(true);
    expect(isPositiveFactor('0')).toBe(false);
    expect(isPositiveFactor('-1')).toBe(false);
    expect(normalizeFactor('0.001')).toBe('0.00100000');
  });

  it('scopeIssues: cada ámbito exige su referencia y ninguna otra', () => {
    expect(scopeIssues('GLOBAL', {})).toEqual([]);
    expect(scopeIssues('GLOBAL', { productId: 'p' })).toEqual([{ field: 'productId', issue: 'not_allowed' }]);
    expect(scopeIssues('PRODUCT', {})).toEqual([{ field: 'productId', issue: 'required' }]);
    expect(scopeIssues('PRODUCT_FAMILY', { productFamilyId: 'f', projectTypeId: 't' })).toEqual([{ field: 'projectTypeId', issue: 'not_allowed' }]);
    expect(scopeIssues('PROJECT_TYPE', { projectTypeId: 't', productId: null })).toEqual([]);
  });

  it('scopeKeyFor: GLOBAL o el id de la referencia', () => {
    expect(scopeKeyFor('GLOBAL', { productId: 'ignored' })).toBe('GLOBAL');
    expect(scopeKeyFor('PRODUCT', { productId: 'p-1' })).toBe('p-1');
    expect(scopeKeyFor('PRODUCT_FAMILY', { productFamilyId: 'f-1' })).toBe('f-1');
    expect(scopeKeyFor('PROJECT_TYPE', { projectTypeId: 't-1' })).toBe('t-1');
  });

  it('identidad e identidad de la unidad de tonelaje', () => {
    expect(isIdentityRule({ fromUnitId: 'A', toUnitId: 'a' })).toBe(true);
    expect(isIdentityRule({ fromUnitId: 'kg', toUnitId: 'ton' })).toBe(false);
    expect(isTonnageIdentity({ fromUnitId: 'ton', toUnitId: 'ton', scope: 'GLOBAL' }, 'ton')).toBe(true);
    expect(isTonnageIdentity({ fromUnitId: 'ton', toUnitId: 'ton', scope: 'PRODUCT' }, 'ton')).toBe(false);
    expect(isTonnageIdentity({ fromUnitId: 'kg', toUnitId: 'kg', scope: 'GLOBAL' }, 'ton')).toBe(false);
  });

  it('errores con su código y status', () => {
    expect(unknownReferenceError('familyId', 'inactive')).toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field: 'familyId', issue: 'inactive' }] });
    expect(duplicateError(['sku'], 'x')).toMatchObject({ code: 'RESOURCE_CONFLICT', details: [{ field: 'sku', issue: 'duplicated' }] });
    expect(invalidScopeError([{ field: 'productId', issue: 'required' }])).toMatchObject({ code: 'INVALID_CONVERSION_SCOPE' });
    expect(invalidTargetError('TON')).toMatchObject({ code: 'INVALID_CONVERSION_TARGET', details: [{ field: 'toUnitId', tonnageUnitCode: 'TON' }] });
    expect(protectedRuleError('tonnage_identity')).toMatchObject({
      code: 'CONVERSION_RULE_PROTECTED',
      details: [{ field: 'isActive', reason: 'tonnage_identity' }],
    });
    expect(dimensionLockedError()).toMatchObject({ code: 'UNIT_DIMENSION_LOCKED', details: [{ field: 'dimension' }] });
  });
});
