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
  /** Unidad de tonelaje ya leída (`tonnageUnit()` antes de abrir la transacción). */
  readonly tonnageUnit?: TonnageUnit;
}

/**
 * Contexto de una resolución dentro de la transacción de un caso de uso: `tx` para leer
 * reglas y familias con la conexión de la transacción y `tonnageUnit` **leída antes** de
 * abrirla, porque el parámetro se lee con `ParameterReader` (pool). Con ambos, la
 * resolución no abre ninguna conexión extra mientras se sostienen bloqueos (AGENTS §9.12,
 * 03 "Precisiones", Revisión E5, M1).
 */
export interface ResolveContext {
  readonly tx?: TransactionContext;
  readonly tonnageUnit?: TonnageUnit;
}

function lookupKeyOf(lookup: ConversionLookup): string {
  return `${lookup.fromUnitId}|${lookup.productId ?? ''}|${lookup.projectTypeId ?? ''}`;
}

/** Clave estable de una búsqueda (la de los mapas de `resolveMany`). */
export function conversionLookupKey(lookup: ConversionLookup): string {
  return lookupKeyOf(lookup);
}

function validUuid(value: string | null | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function sameUuid(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
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

  /**
   * Regla aplicable de mayor precedencia, o `null` ("sin conversión"). Dentro de una
   * transacción con bloqueos se pasa siempre `tonnageUnit` ya leída (ver `ResolveContext`).
   */
  async resolve(lookup: ConversionLookup, tx?: TransactionContext, tonnageUnit?: TonnageUnit): Promise<ResolvedConversion | null> {
    const toUnit = tonnageUnit ?? (await this.tonnageUnit(tx));
    if (!UUID_PATTERN.test(lookup.fromUnitId)) {
      return null;
    }
    const target = await this.targetFor(lookup, toUnit, tx);
    const candidates = await this.reader.findRules(target.fromUnitId, target.toUnitId, scopeKeysFor(target.keys), tx);
    const rule = selectConversionRule(candidates, target);
    return rule ? toResolved(rule, toUnit) : null;
  }

  /**
   * Varias búsquedas de una vez (lote del forecast, Revisión E5, m3): la unidad de
   * tonelaje se lee una vez, las familias y las reglas con una consulta cada una, y la
   * selección es la misma función pura que `resolve` (resultados idénticos). Devuelve un
   * mapa por clave de búsqueda (`conversionLookupKey`).
   */
  async resolveMany(lookups: readonly ConversionLookup[], context: ResolveContext = {}): Promise<Map<string, ResolvedConversion | null>> {
    const result = new Map<string, ResolvedConversion | null>();
    const distinct = new Map(lookups.map((lookup) => [lookupKeyOf(lookup), lookup]));
    if (distinct.size === 0) return result;
    const toUnit = context.tonnageUnit ?? (await this.tonnageUnit(context.tx));
    const valid = [...distinct.entries()].filter(([key, lookup]) => {
      if (UUID_PATTERN.test(lookup.fromUnitId)) return true;
      result.set(key, null);
      return false;
    });
    const productIds = [...new Set(valid.map(([, lookup]) => validUuid(lookup.productId)).filter((id): id is string => id !== null))];
    const families = productIds.length > 0 ? await this.reader.findProductFamilyIds(productIds, context.tx) : new Map<string, string>();
    const targets = valid.map(([key, lookup]) => {
      const productId = validUuid(lookup.productId);
      const keys: ConversionKeys = {
        productId,
        productFamilyId: productId ? (families.get(productId) ?? families.get(productId.toLowerCase()) ?? null) : null,
        projectTypeId: validUuid(lookup.projectTypeId),
      };
      return { key, target: { fromUnitId: lookup.fromUnitId, toUnitId: toUnit.id, keys } satisfies ConversionTarget };
    });
    const fromUnitIds = [...new Set(targets.map(({ target }) => target.fromUnitId))];
    const scopeKeys = [...new Set(targets.flatMap(({ target }) => scopeKeysFor(target.keys)))];
    const candidates = targets.length > 0 ? await this.reader.findRulesForMany(fromUnitIds, toUnit.id, scopeKeys, context.tx) : [];
    for (const { key, target } of targets) {
      const rule = selectConversionRule(
        candidates.filter((candidate) => sameUuid(candidate.fromUnitId, target.fromUnitId)),
        target,
      );
      result.set(key, rule ? toResolved(rule, toUnit) : null);
    }
    return result;
  }

  /** Como `resolve`, pero sin regla → `422 CONVERSION_RULE_NOT_FOUND` (RN-03.27, AC-03.32). */
  async require(lookup: ConversionLookup, options: ConversionOptions = {}): Promise<ResolvedConversion> {
    const toUnit = options.tonnageUnit ?? (await this.tonnageUnit(options.tx));
    const resolved = await this.resolve(lookup, options.tx, toUnit);
    if (!resolved) {
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
    const toUnit = options.tonnageUnit ?? (await this.tonnageUnit(options.tx));
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
