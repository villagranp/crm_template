import type { DecimalString } from '@/common/decimal';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

export const UNIT_CONVERSION_READER = Symbol('UNIT_CONVERSION_READER');

/** Valores del enum `unit_dimension` (00 §2.1). */
export type UnitDimensionCode = 'MASS' | 'LENGTH' | 'AREA' | 'VOLUME' | 'COUNT' | 'OTHER';
/** Valores del enum `conversion_scope` (00 §2.1). */
export type ConversionScopeCode = 'GLOBAL' | 'PRODUCT_FAMILY' | 'PRODUCT' | 'PROJECT_TYPE';

export interface UnitRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
  readonly isActive: boolean;
}

/** Regla de `unit_conversion_rules` (00 §2.3): `cantidad_destino = cantidad_origen × factor`. */
export interface ConversionRuleRecord {
  readonly id: string;
  readonly fromUnitId: string;
  readonly toUnitId: string;
  /** `Decimal(19, 8)` como texto con 8 decimales. */
  readonly factor: DecimalString;
  readonly scope: ConversionScopeCode;
  /** `'GLOBAL'` o el UUID del producto, familia o tipo de proyecto (`ck_unit_conversion_rules_scope`). */
  readonly scopeKey: string;
  readonly isActive: boolean;
}

/**
 * Lectura de unidades y reglas de conversión (00 §11, 03 C.5). Sin tipos del ORM
 * (ADR-004). El mantenimiento de estas tablas es del Módulo 7 (DM-23, DM-24).
 */
export interface UnitConversionReader {
  /** Unidad por su código estable (`TON`, `KG`…), activa o no. */
  findUnitByCode(code: string, tx?: TransactionContext): Promise<UnitRecord | null>;
  /** Familia del producto, o `null` si el producto no existe. */
  findProductFamilyId(productId: string, tx?: TransactionContext): Promise<string | null>;
  /**
   * Reglas `fromUnitId → toUnitId` cuyo `scopeKey` está en `scopeKeys`, **activas o
   * no** (la selección la hace la lógica pura). Una consulta por el único
   * `uq_unit_conversion_rules_from_to_scope`.
   */
  findRules(fromUnitId: string, toUnitId: string, scopeKeys: readonly string[], tx?: TransactionContext): Promise<ConversionRuleRecord[]>;
  findRuleById(ruleId: string, tx?: TransactionContext): Promise<ConversionRuleRecord | null>;
}
