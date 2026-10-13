/**
 * Aritmética decimal exacta sobre cadenas, sin `number` de punto flotante
 * (03 RN-03.30, RN-03.80, D-03.13; ADR-024 §5 y su addendum).
 *
 * Por qué aquí y así:
 * - El dominio y la aplicación no pueden importar `Prisma.Decimal` (CLAUDE.md §8.2)
 *   y no se añade una librería nueva sin ADR (§8.6). `BigInt` (ES2020) basta para
 *   las cuatro operaciones que necesita el CRM: redondear, sumar, multiplicar y dividir.
 * - Las columnas `numeric` viajan como **cadenas decimales** entre capas y en la API.
 *   Los adaptadores Prisma convierten con `Decimal.toFixed()` (nunca `toString()`,
 *   que puede devolver notación exponencial); aun así este módulo acepta `1e-8`.
 * - Redondeo único: `HALF_UP` (la mitad se aleja de cero), como `ROUND_HALF_UP`
 *   de PostgreSQL `round()` y de decimal.js.
 *
 * Toda función que redondea devuelve exactamente `scale` decimales
 * (`multiplyDecimal('3', '0.5', 4) === '1.5000'`), sin `-0`.
 */

/** Texto decimal con punto como separador (`'1200.5'`, `'-0.0025'`, `'7.75000000'`). */
export type DecimalString = string;

export const ROUNDING_MODE = 'HALF_UP' as const;

const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
const PLAIN_PATTERN = /^-?\d+(?:\.\d+)?$/;
/** Exponente máximo admitido en notación científica: evita `10n ** 1e9`. */
const MAX_EXPONENT = 1000;

interface Scaled {
  /** Valor sin punto: `12.50` → `1250n` con `scale = 2`. */
  readonly units: bigint;
  readonly scale: number;
}

/** El texto no es un decimal válido. Es un error de programación o de un adaptador, no del usuario. */
export class InvalidDecimalError extends Error {
  constructor(readonly input: string) {
    super('Invalid decimal value');
    this.name = 'InvalidDecimalError';
  }
}

export interface DecimalFormatOptions {
  /** Máximo de decimales admitidos (p. ej. 4 para `Decimal(19, 4)`). */
  readonly maxScale?: number;
  /** Máximo de dígitos enteros (p. ej. 15 para `Decimal(19, 4)`). */
  readonly maxIntegerDigits?: number;
  /** Por defecto `false`: las cantidades, montos, factores y tasas del CRM son ≥ 0. */
  readonly allowNegative?: boolean;
}

/**
 * ¿Es un decimal en notación simple (`-?d+(.d+)?`) que cumple los límites? Pensado
 * para validar cadenas recibidas en DTOs o leídas de la base.
 */
export function isDecimalString(value: unknown, options: DecimalFormatOptions = {}): value is DecimalString {
  if (typeof value !== 'string' || !PLAIN_PATTERN.test(value)) {
    return false;
  }
  if (!options.allowNegative && value.startsWith('-')) {
    return false;
  }
  const [integerPart = '', fractionPart = ''] = value.replace('-', '').split('.');
  if (options.maxScale !== undefined && fractionPart.length > options.maxScale) {
    return false;
  }
  const significantInteger = integerPart.replace(/^0+(?=\d)/, '');
  return options.maxIntegerDigits === undefined || significantInteger.length <= options.maxIntegerDigits;
}

function parse(value: DecimalString): Scaled {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidDecimalError(value);
  }
  const [, sign, integerPart = '0', fractionPart = '', exponentText] = match;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
    throw new InvalidDecimalError(value);
  }
  let units = BigInt(`${integerPart}${fractionPart}`);
  let scale = fractionPart.length - exponent;
  if (scale < 0) {
    units *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { units: sign === '-' ? -units : units, scale };
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** `numerator / denominator` redondeado HALF_UP a entero (denominador > 0). */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = abs(numerator);
  let quotient = magnitude / denominator;
  if ((magnitude % denominator) * 2n >= denominator) {
    quotient += 1n;
  }
  return negative ? -quotient : quotient;
}

/** Lleva un valor a `scale` decimales con HALF_UP. */
function rescale(value: Scaled, scale: number): bigint {
  if (value.scale === scale) {
    return value.units;
  }
  if (value.scale < scale) {
    return value.units * 10n ** BigInt(scale - value.scale);
  }
  return divideHalfUp(value.units, 10n ** BigInt(value.scale - scale));
}

function format(units: bigint, scale: number): DecimalString {
  const digits = abs(units).toString().padStart(scale + 1, '0');
  const integerPart = digits.slice(0, digits.length - scale);
  const fractionPart = digits.slice(digits.length - scale);
  const text = scale > 0 ? `${integerPart}.${fractionPart}` : integerPart;
  return units < 0n ? `-${text}` : text;
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 30) {
    throw new RangeError(`Decimal scale must be an integer between 0 and 30, got ${scale}`);
  }
}

/** `round(value, scale, HALF_UP)` con exactamente `scale` decimales. */
export function roundDecimal(value: DecimalString, scale: number): DecimalString {
  assertScale(scale);
  return format(rescale(parse(value), scale), scale);
}

/** `round(a × b, scale, HALF_UP)`. Tonelaje = `multiplyDecimal(cantidad, factor, 4)` (RN-03.30). */
export function multiplyDecimal(a: DecimalString, b: DecimalString, scale: number): DecimalString {
  assertScale(scale);
  const left = parse(a);
  const right = parse(b);
  return format(rescale({ units: left.units * right.units, scale: left.scale + right.scale }, scale), scale);
}

/**
 * `round(dividend / divisor, scale, HALF_UP)`. Monto USD = `divideDecimal(monto, tasa, 4)`
 * (RN-03.80). Un divisor cero lanza `RangeError` (las tasas son > 0 por `CHECK`).
 */
export function divideDecimal(dividend: DecimalString, divisor: DecimalString, scale: number): DecimalString {
  assertScale(scale);
  const top = parse(dividend);
  const bottom = parse(divisor);
  if (bottom.units === 0n) {
    throw new RangeError('Division by zero');
  }
  // a/b × 10^scale = (ua × 10^(sb + scale)) / (ub × 10^sa)
  let numerator = top.units * 10n ** BigInt(bottom.scale + scale);
  let denominator = bottom.units * 10n ** BigInt(top.scale);
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  return format(divideHalfUp(numerator, denominator), scale);
}

/** Suma exacta redondeada a `scale` (totales: RN-03.74, RN-03.31). Lista vacía → cero. */
export function sumDecimals(values: readonly DecimalString[], scale: number): DecimalString {
  assertScale(scale);
  const parsed = values.map(parse);
  const common = Math.max(scale, ...parsed.map((value) => value.scale));
  const total = parsed.reduce((sum, value) => sum + rescale(value, common), 0n);
  return format(rescale({ units: total, scale: common }, scale), scale);
}

/** `-1`, `0` o `1` (comparación exacta, sin redondear). */
export function compareDecimal(a: DecimalString, b: DecimalString): -1 | 0 | 1 {
  const left = parse(a);
  const right = parse(b);
  const common = Math.max(left.scale, right.scale);
  const difference = rescale(left, common) - rescale(right, common);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}

export function isZeroDecimal(value: DecimalString): boolean {
  return parse(value).units === 0n;
}
