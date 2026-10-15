import { type DecimalString, compareDecimal, roundDecimal } from '@/common/decimal';
import { BusinessRuleViolationError, MASTER_DATA_ERROR_CODES, ResourceConflictError } from '@/common/errors/application-error';
import { FACTOR_SCALE, GLOBAL_SCOPE_KEY } from '@/modules/unit-conversions/conversion-precedence';
import type { ConversionScopeCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

/**
 * Reglas puras del mantenimiento de maestros comerciales (07 F.7, RN-07.36, RN-07.37;
 * 00 §2.3). Sin base de datos: las prueba `master-data-rules.spec.ts` y las aplican
 * `ProductMastersService` y `UnitConversionRulesService`.
 */

/** Códigos estables de familia y unidad: se guardan recortados y en mayúsculas. */
export const FAMILY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;
export const UNIT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]{0,19}$/;
/** SKU (00 §2.3: mayúsculas y sin espacios extremos); sin caracteres de control. */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._\-/ ]{0,59}$/;
/** Factor positivo: hasta 11 enteros y 8 decimales (`Decimal(19, 8)`). El `0` lo rechaza `isPositiveFactor`. */
export const FACTOR_PATTERN = /^\d{1,11}(\.\d{1,8})?$/;

export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isPositiveFactor(value: DecimalString): boolean {
  return FACTOR_PATTERN.test(value) && compareDecimal(value, '0') > 0;
}

export function normalizeFactor(value: DecimalString): DecimalString {
  return roundDecimal(value, FACTOR_SCALE);
}

/** Referencias de ámbito de una regla, tal como llegan en el alta. */
export interface ScopeReferences {
  readonly productId?: string | null;
  readonly productFamilyId?: string | null;
  readonly projectTypeId?: string | null;
}

/** Campo de la referencia que exige cada ámbito (`GLOBAL` no lleva ninguna). */
export const SCOPE_REFERENCE_FIELD: Record<ConversionScopeCode, keyof ScopeReferences | null> = {
  GLOBAL: null,
  PRODUCT: 'productId',
  PRODUCT_FAMILY: 'productFamilyId',
  PROJECT_TYPE: 'projectTypeId',
};

const REFERENCE_FIELDS: readonly (keyof ScopeReferences)[] = ['productId', 'productFamilyId', 'projectTypeId'];

export interface ScopeIssue {
  readonly field: keyof ScopeReferences;
  readonly issue: 'required' | 'not_allowed';
}

/**
 * Coherencia ámbito ↔ referencias (`ck_unit_conversion_rules_scope`): el ámbito exige
 * exactamente su referencia y ninguna otra. Vacío = coherente.
 */
export function scopeIssues(scope: ConversionScopeCode, references: ScopeReferences): ScopeIssue[] {
  const required = SCOPE_REFERENCE_FIELD[scope];
  return REFERENCE_FIELDS.flatMap((field): ScopeIssue[] => {
    const present = references[field] !== undefined && references[field] !== null;
    if (field === required && !present) return [{ field, issue: 'required' }];
    if (field !== required && present) return [{ field, issue: 'not_allowed' }];
    return [];
  });
}

/** `scope_key` de la regla: `'GLOBAL'` o el UUID de la referencia del ámbito. */
export function scopeKeyFor(scope: ConversionScopeCode, references: ScopeReferences): string {
  const field = SCOPE_REFERENCE_FIELD[scope];
  return field ? (references[field] ?? GLOBAL_SCOPE_KEY) : GLOBAL_SCOPE_KEY;
}

/** Identidad: misma unidad de origen y destino (factor 1 fijo, `ck_unit_conversion_rules_identity`). */
export function isIdentityRule(rule: { readonly fromUnitId: string; readonly toUnitId: string }): boolean {
  return rule.fromUnitId.toLowerCase() === rule.toUnitId.toLowerCase();
}

/** La identidad `GLOBAL` de la unidad de tonelaje (`TON→TON`): RN-07.33 depende de ella. */
export function isTonnageIdentity(
  rule: { readonly fromUnitId: string; readonly toUnitId: string; readonly scope: ConversionScopeCode },
  tonnageUnitId: string,
): boolean {
  return isIdentityRule(rule) && rule.scope === 'GLOBAL' && rule.fromUnitId.toLowerCase() === tonnageUnitId.toLowerCase();
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export type ReferenceIssue = 'not_found' | 'inactive';

/** `422 UNKNOWN_REFERENCE`: la referencia no existe o está inactiva (07 F.7). */
export function unknownReferenceError(field: string, issue: ReferenceIssue): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    MASTER_DATA_ERROR_CODES.unknownReference,
    issue === 'inactive' ? 'The referenced record is inactive' : 'The referenced record does not exist',
    [{ field, issue }],
  );
}

/** `409 RESOURCE_CONFLICT` por un único (`code`, `sku`, origen/destino/ámbito). */
export function duplicateError(fields: readonly string[], message: string): ResourceConflictError {
  return new ResourceConflictError(
    message,
    fields.map((field) => ({ field, issue: 'duplicated' })),
  );
}

export function invalidScopeError(issues: readonly ScopeIssue[]): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    MASTER_DATA_ERROR_CODES.invalidConversionScope,
    'The scope does not match its references',
    issues.map((issue) => ({ field: issue.field, issue: issue.issue })),
  );
}

export function invalidTargetError(tonnageUnitCode: string): BusinessRuleViolationError {
  return new BusinessRuleViolationError(MASTER_DATA_ERROR_CODES.invalidConversionTarget, 'The target unit must be the configured tonnage unit', [
    { field: 'toUnitId', issue: 'not_tonnage_unit', tonnageUnitCode },
  ]);
}

export type ProtectionReason = 'identity_factor' | 'tonnage_identity' | 'tonnage_unit';

const PROTECTION_MESSAGES: Record<ProtectionReason, string> = {
  identity_factor: 'An identity rule always has factor 1',
  tonnage_identity: 'The identity rule of the tonnage unit cannot be deactivated',
  tonnage_unit: 'The configured tonnage unit cannot be deactivated',
};

const PROTECTION_FIELD: Record<ProtectionReason, string> = {
  identity_factor: 'factor',
  tonnage_identity: 'isActive',
  tonnage_unit: 'isActive',
};

export function protectedRuleError(reason: ProtectionReason): ResourceConflictError {
  return new ResourceConflictError(
    PROTECTION_MESSAGES[reason],
    [{ field: PROTECTION_FIELD[reason], reason }],
    MASTER_DATA_ERROR_CODES.conversionRuleProtected,
  );
}

export function dimensionLockedError(): ResourceConflictError {
  return new ResourceConflictError(
    'The unit dimension cannot change once the unit is referenced',
    [{ field: 'dimension', reason: 'referenced' }],
    MASTER_DATA_ERROR_CODES.unitDimensionLocked,
  );
}
