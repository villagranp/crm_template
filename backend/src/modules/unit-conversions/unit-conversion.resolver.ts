import { Inject, Injectable } from '@nestjs/common';

import { type DecimalString, roundDecimal } from '@/common/decimal';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import {
  type ConversionKeys,
  type ConversionTarget,
  convertQuantity,
  FACTOR_SCALE,
  GLOBAL_SCOPE_KEY,
  ruleApplicabilityIssues,
  scopeKeysFor,
  selectConversionRule,
  type TonnageUnitIssue,
  tonnageUnitIssues,
} from './conversion-precedence';
import { conversionRuleNotFoundError, invalidConversionRuleError, TonnageUnitUnavailableError } from './unit-conversion-errors';
import {
  type ConversionRuleRecord,
  type ConversionScopeCode,
  UNIT_CONVERSION_READER,
  type UnitConversionReader,
  type UnitRecord,
} from './ports/unit-conversion.reader.port';

export const TONNAGE_UNIT_PARAMETER = 'crm.forecast.unidad_tonelaje';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Qué se convierte. Con `productId` es una **línea** (asociación o forecast:
 * `PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL`); sin él, el **proyecto**
 * (`PROJECT_TYPE > GLOBAL`). La familia del producto la resuelve el resolver.
 */
export interface ConversionLookup {
  /** Unidad de la cantidad (la del proyecto o la de la línea). Su existencia y estado los valida el llamador. */
  readonly fromUnitId: string;
  readonly productId?: string | null;
  /** Tipo del proyecto (`crm.tipo_proyecto`), si lo tiene. */
  readonly projectTypeId?: string | null;
}

export interface TonnageUnit {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
}

/** Regla resuelta: lo que se copia como foto (`conversionRuleId`, `conversionFactor`; RN-03.29). */
export interface ResolvedConversion {
  readonly ruleId: string;
  readonly scope: ConversionScopeCode;
  /** 8 decimales. */
  readonly factor: DecimalString;
  readonly fromUnitId: string;
  readonly toUnit: TonnageUnit;
}

export interface ConversionOptions {
  /** Campo del DTO para `details[].field`. Por defecto `measureUnitId`. */
  readonly field?: string;
  readonly tx?: TransactionContext;
}

function toResolved(rule: ConversionRuleRecord, toUnit: TonnageUnit): ResolvedConversion {
  return { ruleId: rule.id, scope: rule.scope, factor: roundDecimal(rule.factor, FACTOR_SCALE), fromUnitId: rule.fromUnitId, toUnit };
}

/**
 * Resolución de la regla de conversión hacia la unidad de tonelaje (00 §2.3 y §11,
 * 03 C.5). Transversal y de solo lectura: lo usan la clasificación del proyecto,
 * los productos asociados, el forecast, el duplicado y la vista previa
 * `GET /unit-conversions/resolve` (03 F.4), siempre con la **misma** precedencia.
 *
 * - Destino = `crm.forecast.unidad_tonelaje` (`TON`), leído en cada llamada.
 * - Solo reglas activas. Sin regla aplicable: `resolve` → `null` ("sin conversión",
 *   líneas) y `require` → `422 CONVERSION_RULE_NOT_FOUND` (proyecto en modo `RULE`).
 * - La identidad (`TON → TON`, factor 1) es una regla `GLOBAL` más de la semilla
 *   esencial; no se sintetiza (el `CHECK` "tonelaje ⇔ regla" exige una regla real).
 * - El tonelaje se calcula con `convertQuantity` (decimal exacto, 4 decimales HALF_UP).
 */
@Injectable()
export class UnitConversionResolver {
  constructor(
    @Inject(UNIT_CONVERSION_READER) private readonly reader: UnitConversionReader,
    private readonly parameters: ParameterReader,
  ) {}

  /**
   * Unidad de tonelaje configurada. Si el código no existe lanza
   * `TonnageUnitUnavailableError` (fallo de configuración → `500`).
   */
  async tonnageUnit(tx?: TransactionContext): Promise<TonnageUnit> {
    const code = await this.parameters.get<string>(TONNAGE_UNIT_PARAMETER);
    const unit = await this.reader.findUnitByCode(code, tx);
    if (!unit) {
      throw new TonnageUnitUnavailableError(code, ['UNIT_NOT_FOUND']);
    }
    return { id: unit.id, code: unit.code, symbol: unit.symbol };
  }

  /** Regla aplicable de mayor precedencia, o `null` ("sin conversión"). */
  async resolve(lookup: ConversionLookup, tx?: TransactionContext): Promise<ResolvedConversion | null> {
    const toUnit = await this.tonnageUnit(tx);
    if (!UUID_PATTERN.test(lookup.fromUnitId)) {
      return null;
    }
    const target = await this.targetFor(lookup, toUnit, tx);
    const candidates = await this.reader.findRules(target.fromUnitId, target.toUnitId, scopeKeysFor(target.keys), tx);
    const rule = selectConversionRule(candidates, target);
    return rule ? toResolved(rule, toUnit) : null;
  }

  /** Como `resolve`, pero sin regla → `422 CONVERSION_RULE_NOT_FOUND` (RN-03.27, AC-03.32). */
  async require(lookup: ConversionLookup, options: ConversionOptions = {}): Promise<ResolvedConversion> {
    const resolved = await this.resolve(lookup, options.tx);
    if (!resolved) {
      const toUnit = await this.tonnageUnit(options.tx);
      throw conversionRuleNotFoundError(options.field ?? 'measureUnitId', { fromUnitId: lookup.fromUnitId, toUnitCode: toUnit.code });
    }
    return resolved;
  }

  /**
   * Valida una regla concreta para `lookup` (RN-03.28): existe, activa, desde la
   * unidad indicada, hacia la unidad de tonelaje y de un ámbito que corresponde.
   * Si no → `422 INVALID_CONVERSION_RULE` con `details[0].reasons`. No exige que sea
   * la de mayor precedencia (para eso, `resolve`).
   */
  async assertApplicable(ruleId: string, lookup: ConversionLookup, options: ConversionOptions = {}): Promise<ResolvedConversion> {
    const field = options.field ?? 'conversionRuleId';
    const toUnit = await this.tonnageUnit(options.tx);
    const rule = UUID_PATTERN.test(ruleId) ? await this.reader.findRuleById(ruleId, options.tx) : null;
    if (!rule) {
      throw invalidConversionRuleError(field, ruleId, ['NOT_FOUND']);
    }
    const issues = ruleApplicabilityIssues(rule, await this.targetFor(lookup, toUnit, options.tx));
    if (issues.length > 0) {
      throw invalidConversionRuleError(field, ruleId, issues);
    }
    return toResolved(rule, toUnit);
  }

  /** `round(quantity × factor, 4, HALF_UP)`. Atajo de `convertQuantity` para los casos de uso. */
  tonnageFor(quantity: DecimalString, conversion: Pick<ResolvedConversion, 'factor'>): DecimalString {
    return convertQuantity(quantity, conversion.factor);
  }

  /**
   * RN-07.33 para `PATCH /parameters/crm.forecast.unidad_tonelaje`: incidencias de
   * usar `code` como unidad de tonelaje (vacío = válida).
   */
  async tonnageUnitCandidateIssues(code: string, tx?: TransactionContext): Promise<TonnageUnitIssue[]> {
    const unit: UnitRecord | null = await this.reader.findUnitByCode(code, tx);
    const identityRules = unit ? await this.reader.findRules(unit.id, unit.id, [GLOBAL_SCOPE_KEY], tx) : [];
    return tonnageUnitIssues(unit, identityRules);
  }

  private async targetFor(lookup: ConversionLookup, toUnit: TonnageUnit, tx?: TransactionContext): Promise<ConversionTarget> {
    const productId = lookup.productId && UUID_PATTERN.test(lookup.productId) ? lookup.productId : null;
    const projectTypeId = lookup.projectTypeId && UUID_PATTERN.test(lookup.projectTypeId) ? lookup.projectTypeId : null;
    const productFamilyId = productId ? await this.reader.findProductFamilyId(productId, tx) : null;
    const keys: ConversionKeys = { productId, productFamilyId, projectTypeId };
    return { fromUnitId: lookup.fromUnitId, toUnitId: toUnit.id, keys };
  }
}
