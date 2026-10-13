import { compareDecimal, type DecimalString, multiplyDecimal } from '@/common/decimal';

import type { ConversionRuleRecord, ConversionScopeCode, UnitRecord } from './ports/unit-conversion.reader.port';

/**
 * Reglas puras de conversión de unidades a la unidad de tonelaje (00 §2.3,
 * 03 RN-03.27, RN-03.28, RN-03.30, RN-03.58, RN-03.69; 07 RN-07.33). Sin base de
 * datos: las prueba `conversion-precedence.spec.ts` y las aplica `UnitConversionResolver`.
 */

/** Escala del tonelaje (`Decimal(19, 4)`, D-03.13). */
export const TONNAGE_SCALE = 4;
/** Escala del factor (`Decimal(19, 8)`). */
export const FACTOR_SCALE = 8;
export const GLOBAL_SCOPE_KEY = 'GLOBAL';

/** Con qué se busca la regla. Sin `productId` es una búsqueda **de proyecto**. */
export interface ConversionKeys {
  readonly productId: string | null;
  readonly productFamilyId: string | null;
  readonly projectTypeId: string | null;
}

/**
 * Precedencia (de más a menos específica):
 * - Línea de producto (asociación o forecast, RN-03.58/69): `PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL`.
 * - Proyecto (RN-03.27): `PROJECT_TYPE > GLOBAL` (no aplican producto ni familia).
 */
export function precedenceFor(keys: ConversionKeys): readonly ConversionScopeCode[] {
  return keys.productId ? ['PRODUCT', 'PRODUCT_FAMILY', 'PROJECT_TYPE', 'GLOBAL'] : ['PROJECT_TYPE', 'GLOBAL'];
}

/** `scope_key` esperado para cada ámbito con estas claves (`null` = ámbito no aplicable). */
function expectedScopeKey(scope: ConversionScopeCode, keys: ConversionKeys): string | null {
  switch (scope) {
    case 'GLOBAL':
      return GLOBAL_SCOPE_KEY;
    case 'PRODUCT':
      return keys.productId;
    case 'PRODUCT_FAMILY':
      return keys.productId ? keys.productFamilyId : null;
    case 'PROJECT_TYPE':
      return keys.projectTypeId;
  }
}

/** `scope_key` que puede tener una regla aplicable (para filtrar en la consulta). */
export function scopeKeysFor(keys: ConversionKeys): string[] {
  return precedenceFor(keys).flatMap((scope) => {
    const key = expectedScopeKey(scope, keys);
    return key ? [key] : [];
  });
}

export interface ConversionTarget {
  readonly fromUnitId: string;
  /** Unidad de tonelaje configurada (`crm.forecast.unidad_tonelaje`). */
  readonly toUnitId: string;
  readonly keys: ConversionKeys;
}

export type ConversionRuleIssue =
  | 'INACTIVE'
  | 'FROM_UNIT_MISMATCH'
  | 'TO_UNIT_MISMATCH'
  | 'SCOPE_NOT_APPLICABLE'
  | 'NON_POSITIVE_FACTOR'
  | 'IDENTITY_FACTOR_NOT_ONE';

/**
 * Por qué una regla **no** es válida para `target` (RN-03.28): inactiva, de otra unidad
 * origen, hacia otra unidad que la de tonelaje, de un ámbito que no corresponde
 * (otro producto, familia o tipo de proyecto, o producto/familia en un proyecto) o
 * con un factor imposible (la base ya lo impide con `ck_unit_conversion_rules_*`).
 * Vacío = aplicable.
 */
export function ruleApplicabilityIssues(rule: ConversionRuleRecord, target: ConversionTarget): ConversionRuleIssue[] {
  const issues: ConversionRuleIssue[] = [];
  if (!rule.isActive) issues.push('INACTIVE');
  if (rule.fromUnitId !== target.fromUnitId) issues.push('FROM_UNIT_MISMATCH');
  if (rule.toUnitId !== target.toUnitId) issues.push('TO_UNIT_MISMATCH');
  const scopeKey = precedenceFor(target.keys).includes(rule.scope) ? expectedScopeKey(rule.scope, target.keys) : null;
  if (scopeKey === null || scopeKey !== rule.scopeKey) issues.push('SCOPE_NOT_APPLICABLE');
  if (compareDecimal(rule.factor, '0') <= 0) issues.push('NON_POSITIVE_FACTOR');
  if (rule.fromUnitId === rule.toUnitId && compareDecimal(rule.factor, '1') !== 0) issues.push('IDENTITY_FACTOR_NOT_ONE');
  return issues;
}

/**
 * Regla aplicable de mayor precedencia entre `candidates`, o `null` si ninguna es
 * válida ("sin conversión"). Solo reglas activas. Como `(from, to, scope_key)` es
 * único, no puede haber dos candidatas del mismo ámbito.
 */
export function selectConversionRule(candidates: readonly ConversionRuleRecord[], target: ConversionTarget): ConversionRuleRecord | null {
  const applicable = candidates.filter((rule) => ruleApplicabilityIssues(rule, target).length === 0);
  for (const scope of precedenceFor(target.keys)) {
    const match = applicable.find((rule) => rule.scope === scope);
    if (match) return match;
  }
  return null;
}

/** `round(quantity × factor, 4, HALF_UP)` con aritmética exacta (RN-03.30, D-03.13). */
export function convertQuantity(quantity: DecimalString, factor: DecimalString): DecimalString {
  return multiplyDecimal(quantity, factor, TONNAGE_SCALE);
}

export type TonnageUnitIssue = 'UNIT_NOT_FOUND' | 'UNIT_INACTIVE' | 'UNIT_NOT_MASS' | 'IDENTITY_RULE_MISSING';

/**
 * RN-07.33: la unidad de tonelaje debe existir, estar activa, ser de dimensión
 * `MASS` y tener una regla identidad `GLOBAL` activa (sin ella, una línea ya
 * expresada en toneladas quedaría "sin conversión", 00 §2.3).
 */
export function tonnageUnitIssues(unit: UnitRecord | null, identityRules: readonly ConversionRuleRecord[]): TonnageUnitIssue[] {
  if (!unit) return ['UNIT_NOT_FOUND'];
  const issues: TonnageUnitIssue[] = [];
  if (!unit.isActive) issues.push('UNIT_INACTIVE');
  if (unit.dimension !== 'MASS') issues.push('UNIT_NOT_MASS');
  const identity = selectConversionRule(identityRules, {
    fromUnitId: unit.id,
    toUnitId: unit.id,
    keys: { productId: null, productFamilyId: null, projectTypeId: null },
  });
  if (!identity || identity.scope !== 'GLOBAL') issues.push('IDENTITY_RULE_MISSING');
  return issues;
}
