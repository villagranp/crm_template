import { z } from 'zod';

/**
 * Cadenas decimales del CRM sin aritmética de punto flotante (03 §L.3, RN-03.30, RN-03.80).
 *
 * La API transporta cantidades, tonelajes, factores, montos y porcentajes como
 * **cadenas** (`"1200.0000"`, `"75.00"`), y el frontend nunca las convierte a
 * `number`: `0.1 + 0.2` no es `0.3`, y un monto de 15 dígitos enteros con 4
 * decimales no cabe en un `double`. Todo lo de aquí trabaja con dígitos
 * (`BigInt` escalado).
 *
 * - **Forma canónica** (la que se envía a la API): sin signo `+`, sin ceros a la
 *   izquierda, punto como separador y sin separador de miles: `"1234.5"`, `"0.25"`.
 * - **Especificación** (`DecimalSpec`): dígitos enteros y decimales máximos, igual
 *   que los patrones del backend (03 §H.3): `^\d{1,15}(\.\d{1,4})?$` para
 *   cantidades, tonelajes y montos (`Decimal(19,4)`); `^\d{1,3}(\.\d{1,2})?$` y
 *   0–100 para porcentajes (`Decimal(5,2)`); 8 decimales para factores y tipos de
 *   cambio (`Decimal(19,8)`).
 * - **Presentación**: `es-GT` (punto decimal, coma de miles: `1,234.50`). Los
 *   separadores se toman de `Intl` una vez; los valores nunca pasan por `Intl`.
 *
 * Validar aquí es experiencia de usuario: el backend valida de nuevo y redondea
 * (`HALF_UP`, D-03.13). Los totales y conversiones oficiales son los del backend;
 * las operaciones de este archivo sirven para vistas previas (p. ej. el borrador
 * del forecast, que usa el `conversion.factor` que devuelve el backend).
 */

/** Configuración regional de los números del CRM. */
export const DECIMAL_LOCALE = 'es-GT';

export interface DecimalSpec {
  /** Dígitos enteros máximos. */
  integerDigits: number;
  /** Decimales máximos. */
  fractionDigits: number;
  /** Valor máximo admitido (canónico), p. ej. `'100'` para porcentajes. */
  max?: string;
  /** Admite negativos (ningún campo del Módulo 3 lo hace). */
  allowNegative?: boolean;
}

/** Especificaciones de los decimales del CRM (00 §2: `Decimal(19,4)`, `(19,8)`, `(5,2)`). */
export const DECIMAL_SPECS = {
  /** Cantidades de producto y de forecast (RN-03.65). */
  quantity: { integerDigits: 15, fractionDigits: 4 },
  /** Toneladas (estimadas, manuales o calculadas). */
  tonnage: { integerDigits: 15, fractionDigits: 4 },
  /** Montos en USD o en moneda local (RN-03.38). */
  money: { integerDigits: 15, fractionDigits: 4 },
  /** Factores de conversión y tipos de cambio. */
  factor: { integerDigits: 11, fractionDigits: 8 },
  /** Porcentajes de avance y adjudicación (RN-03.33, RN-03.49). */
  percent: { integerDigits: 3, fractionDigits: 2, max: '100' },
} as const satisfies Record<string, DecimalSpec>;

export type DecimalIssue =
  'empty' | 'format' | 'negative' | 'tooManyIntegerDigits' | 'tooManyFractionDigits' | 'aboveMax';

export type DecimalParseResult = { ok: true; value: string } | { ok: false; issue: DecimalIssue };

interface Separators {
  decimal: string;
  group: string;
}

function readSeparators(locale: string): Separators {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  return {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
  };
}

const SEPARATORS = readSeparators(DECIMAL_LOCALE);
const CANONICAL = /^(-)?(\d+)(?:\.(\d+))?$/;
const GROUP_SPACES = /[\s  ]/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DECIMAL_SEPARATOR = escapeRegExp(SEPARATORS.decimal);
const GROUP_SEPARATOR = escapeRegExp(SEPARATORS.group);
/** Signo, parte entera (con separadores de miles opcionales) y decimales tras el separador local. */
const DECIMAL_INPUT = new RegExp(
  `^([+-])?([\\d${GROUP_SEPARATOR}]*)(?:${DECIMAL_SEPARATOR}(\\d*))?$`,
);
const GROUPED_INTEGER = new RegExp(`^\\d{1,3}(?:${GROUP_SEPARATOR}\\d{3})+$`);

// ---------------------------------------------------------------------------
// Representación interna: entero escalado (`units / 10^scale`).
// ---------------------------------------------------------------------------

interface Scaled {
  units: bigint;
  scale: number;
}

function toScaled(value: string): Scaled {
  const match = CANONICAL.exec(value.trim());
  if (!match) {
    throw new RangeError(`"${value}" no es una cadena decimal.`);
  }
  const [, sign, integer = '0', fraction = ''] = match;
  const units = BigInt(`${integer}${fraction}`);
  return { units: sign ? -units : units, scale: fraction.length };
}

function rescale(value: Scaled, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale);
}

function fromScaled({ units, scale }: Scaled): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const integer = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? digits.slice(-scale).replace(/0+$/, '') : '';
  const body = fraction ? `${integer}.${fraction}` : integer;
  return negative && body !== '0' ? `-${body}` : body;
}

/** Divide `units` entre `10^drop` redondeando la mitad hacia fuera del cero (`HALF_UP`, D-03.13). */
function divideHalfUp(units: bigint, drop: number): bigint {
  if (drop <= 0) {
    return units;
  }
  const divisor = 10n ** BigInt(drop);
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const quotient = absolute / divisor;
  const rounded = (absolute % divisor) * 2n >= divisor ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

// ---------------------------------------------------------------------------
// Validación y normalización
// ---------------------------------------------------------------------------

/** `true` si `value` está en forma canónica (`"12.5"`, `"-3"`), sin mirar ninguna especificación. */
export function isCanonicalDecimal(value: string): boolean {
  return CANONICAL.test(value);
}

/**
 * Convierte el texto que escribe el usuario en una cadena canónica validada.
 *
 * Acepta el separador decimal de `es-GT` (`.`), el separador de miles (`,`)
 * solo bien colocado (`"1,234.5"`; `"1,5"` es un error de formato, para no
 * confundir una coma decimal con miles) e ignora los espacios. Descarta ceros
 * sobrantes (`"0012.50"` → `"12.5"`). Nunca redondea: si sobran decimales,
 * falla con `tooManyFractionDigits`.
 */
export function parseDecimal(input: string, spec: DecimalSpec): DecimalParseResult {
  const compact = input.replace(GROUP_SPACES, '');
  if (compact === '') {
    return { ok: false, issue: 'empty' };
  }
  const match = DECIMAL_INPUT.exec(compact);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    return { ok: false, issue: 'format' };
  }
  const [, sign, groupedInteger = '', rawFraction = ''] = match;
  // El separador de miles solo se admite en su sitio ("1,234"): "1,5" no es 15 ni 1.5, es un error.
  if (groupedInteger.includes(SEPARATORS.group) && !GROUPED_INTEGER.test(groupedInteger)) {
    return { ok: false, issue: 'format' };
  }
  const rawInteger = groupedInteger.split(SEPARATORS.group).join('');
  const integer = rawInteger.replace(/^0+(?=\d)/, '') || '0';
  const fraction = rawFraction.replace(/0+$/, '');
  const isZero = /^0*$/.test(integer) && fraction === '';
  if (sign === '-' && !isZero && !spec.allowNegative) {
    return { ok: false, issue: 'negative' };
  }
  if (integer.length > spec.integerDigits) {
    return { ok: false, issue: 'tooManyIntegerDigits' };
  }
  if (fraction.length > spec.fractionDigits) {
    return { ok: false, issue: 'tooManyFractionDigits' };
  }
  const body = fraction ? `${integer}.${fraction}` : integer;
  const value = sign === '-' && !isZero ? `-${body}` : body;
  if (spec.max !== undefined && compareDecimals(value, spec.max) > 0) {
    return { ok: false, issue: 'aboveMax' };
  }
  return { ok: true, value };
}

/** Mensaje en español de una incidencia de `parseDecimal`. */
export function describeDecimalIssue(issue: DecimalIssue, spec: DecimalSpec): string {
  switch (issue) {
    case 'empty':
      return 'Este campo es obligatorio.';
    case 'format':
      return 'Escribe un número válido (punto como separador decimal).';
    case 'negative':
      return 'Debe ser mayor o igual que 0.';
    case 'tooManyIntegerDigits':
      return `Admite como máximo ${spec.integerDigits} dígitos enteros.`;
    case 'tooManyFractionDigits':
      return spec.fractionDigits === 0
        ? 'Debe ser un número entero.'
        : `Admite como máximo ${spec.fractionDigits} decimales.`;
    case 'aboveMax':
      return `Debe ser como máximo ${formatDecimal(spec.max ?? '0')}.`;
  }
}

interface DecimalSchemaOptions {
  /** Si es `false`, la cadena vacía es válida y se transforma en `null`. */
  required?: boolean;
}

/**
 * Esquema Zod de un campo decimal de formulario. Valida el texto del usuario y
 * lo transforma en la cadena canónica que espera la API (o `null` si es
 * opcional y está vacío).
 *
 * @example
 * const schema = z.object({ quantity: decimalSchema(DECIMAL_SPECS.quantity) });
 */
export function decimalSchema(
  spec: DecimalSpec,
  options: { required: false },
): z.ZodType<string | null, z.ZodTypeDef, string>;
export function decimalSchema(
  spec: DecimalSpec,
  options?: DecimalSchemaOptions,
): z.ZodType<string, z.ZodTypeDef, string>;
export function decimalSchema(
  spec: DecimalSpec,
  { required = true }: DecimalSchemaOptions = {},
): z.ZodType<string | null, z.ZodTypeDef, string> {
  return z.string().transform((raw, context) => {
    const result = parseDecimal(raw, spec);
    if (result.ok) {
      return result.value;
    }
    if (result.issue === 'empty' && !required) {
      return null;
    }
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: describeDecimalIssue(result.issue, spec),
    });
    return z.NEVER;
  });
}

// ---------------------------------------------------------------------------
// Aritmética exacta (vistas previas; la autoridad es el backend)
// ---------------------------------------------------------------------------

/** -1, 0 o 1 comparando dos cadenas canónicas. */
export function compareDecimals(left: string, right: string): -1 | 0 | 1 {
  const a = toScaled(left);
  const b = toScaled(right);
  const scale = Math.max(a.scale, b.scale);
  const difference = rescale(a, scale) - rescale(b, scale);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

/** Suma exacta de cadenas canónicas (`[]` → `"0"`). */
export function sumDecimals(values: readonly string[]): string {
  const scaled = values.map(toScaled);
  const scale = Math.max(0, ...scaled.map((value) => value.scale));
  const units = scaled.reduce((total, value) => total + rescale(value, scale), 0n);
  return fromScaled({ units, scale });
}

/** Producto exacto; con `fractionDigits`, redondeado `HALF_UP` (tonelaje = cantidad × factor, 4 decimales). */
export function multiplyDecimals(left: string, right: string, fractionDigits?: number): string {
  const a = toScaled(left);
  const b = toScaled(right);
  const product: Scaled = { units: a.units * b.units, scale: a.scale + b.scale };
  return fractionDigits === undefined
    ? fromScaled(product)
    : roundDecimal(fromScaled(product), fractionDigits);
}

/** Redondea a `fractionDigits` decimales con `HALF_UP` (la mitad se aleja del cero). */
export function roundDecimal(value: string, fractionDigits: number): string {
  const scaled = toScaled(value);
  if (scaled.scale <= fractionDigits) {
    return fromScaled(scaled);
  }
  return fromScaled({
    units: divideHalfUp(scaled.units, scaled.scale - fractionDigits),
    scale: fractionDigits,
  });
}

/** Forma canónica de una cadena decimal de la API (`"12.5000"` → `"12.5"`). */
export function normalizeDecimal(value: string): string {
  return fromScaled(toScaled(value));
}

// ---------------------------------------------------------------------------
// Presentación (es-GT)
// ---------------------------------------------------------------------------

const EMPTY = '—';

export interface FormatDecimalOptions {
  /** Decimales mínimos (rellena con ceros). Por defecto 0. */
  minFractionDigits?: number;
  /** Decimales máximos (redondea `HALF_UP`). Por defecto, los que tenga el valor. */
  maxFractionDigits?: number;
  /** Separador de miles. Por defecto `true`; los campos en edición lo omiten. */
  useGrouping?: boolean;
}

function groupInteger(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATORS.group);
}

/**
 * Cadena decimal de la API → texto `es-GT` (`"1234567.5"` → `"1,234,567.5"`).
 * `null`, `undefined`, vacío o no decimal → `"—"`.
 */
export function formatDecimal(
  value: string | null | undefined,
  options: FormatDecimalOptions = {},
): string {
  if (value === null || value === undefined || !isCanonicalDecimal(value.trim())) {
    return EMPTY;
  }
  const { minFractionDigits = 0, maxFractionDigits, useGrouping = true } = options;
  const rounded =
    maxFractionDigits === undefined
      ? normalizeDecimal(value)
      : roundDecimal(value, maxFractionDigits);
  const negative = rounded.startsWith('-');
  const [integer = '0', fraction = ''] = (negative ? rounded.slice(1) : rounded).split('.');
  const paddedFraction = fraction.padEnd(minFractionDigits, '0');
  const integerText = useGrouping ? groupInteger(integer) : integer;
  return `${negative ? '-' : ''}${integerText}${paddedFraction ? `${SEPARATORS.decimal}${paddedFraction}` : ''}`;
}

/** Porcentaje (`"75.00"` → `"75%"`, `"12.5"` → `"12.5%"`), hasta 2 decimales. */
export function formatPercent(value: string | null | undefined): string {
  const text = formatDecimal(value, { maxFractionDigits: 2 });
  return text === EMPTY ? EMPTY : `${text}%`;
}

/**
 * Monto con su moneda (`"1234.5", "GTQ"` → `"GTQ 1,234.50"`). Se muestra el
 * código ISO y no el símbolo: `$` es ambiguo entre USD y otras monedas.
 *
 * @param fractionDigits Decimales de la moneda (`currencies.decimals` de las
 *   opciones de formulario); por defecto 2.
 */
export function formatMoney(
  value: string | null | undefined,
  currencyCode: string | null | undefined,
  fractionDigits = 2,
): string {
  const text = formatDecimal(value, {
    minFractionDigits: fractionDigits,
    maxFractionDigits: fractionDigits,
  });
  if (text === EMPTY) {
    return EMPTY;
  }
  return currencyCode ? `${currencyCode} ${text}` : text;
}

/** Cantidad con unidad (`"480", "VAR"` → `"480 VAR"`), hasta 4 decimales. */
export function formatQuantity(
  value: string | null | undefined,
  unitSymbol?: string | null,
): string {
  const text = formatDecimal(value, { maxFractionDigits: 4 });
  return text === EMPTY || !unitSymbol ? text : `${text} ${unitSymbol}`;
}

/** Toneladas (`"1.6125"` → `"1.61 t"`), con 2 decimales por defecto. */
export function formatTonnage(
  value: string | null | undefined,
  unitSymbol = 't',
  fractionDigits = 2,
): string {
  const text = formatDecimal(value, {
    minFractionDigits: fractionDigits,
    maxFractionDigits: fractionDigits,
  });
  return text === EMPTY ? EMPTY : `${text} ${unitSymbol}`;
}

/** Texto para editar un valor canónico: sin separador de miles (`"1234.5"`). */
export function toEditableDecimal(value: string | null | undefined): string {
  if (value === null || value === undefined || !isCanonicalDecimal(value.trim())) {
    return value ?? '';
  }
  return formatDecimal(value, { useGrouping: false });
}
