/**
 * Maestros esenciales del CRM (00 §8.2): monedas, países, unidades de medida,
 * reglas de conversión genéricas y secuencias de códigos.
 *
 * Datos declarativos; los escribe `crm-seeders.ts`. Familias, productos y
 * equipos NO van aquí: son datos de negocio que aún no se han entregado
 * (DM-23, DM-12) y viven solo en la semilla de demostración.
 */

export interface CurrencySeed {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

/** DM-36 / ADR-024: base USD + monedas locales de los países sembrados. */
export const CURRENCIES: CurrencySeed[] = [
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2 },
  { code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2 },
  { code: 'HNL', name: 'Lempira', symbol: 'L', decimals: 2 },
  { code: 'CRC', name: 'Colón costarricense', symbol: '₡', decimals: 2 },
  { code: 'VES', name: 'Bolívar', symbol: 'Bs.', decimals: 2 },
];

export interface CountrySeed {
  isoCode: string;
  name: string;
  phonePrefix: string;
  taxIdLabel: string;
  currencyCode: string;
  timeZone: string;
  sortOrder: number;
}

/**
 * DM-2 (respuesta del responsable, 2026-10-10). No se siembran Nicaragua ni
 * Panamá. `taxIdPattern`/`phonePattern` quedan nulos en la Fase 0 (DM-3: solo
 * longitud y caracteres permitidos).
 */
export const COUNTRIES: CountrySeed[] = [
  { isoCode: 'GT', name: 'Guatemala', phonePrefix: '+502', taxIdLabel: 'NIT', currencyCode: 'GTQ', timeZone: 'America/Guatemala', sortOrder: 10 },
  { isoCode: 'SV', name: 'El Salvador', phonePrefix: '+503', taxIdLabel: 'NIT', currencyCode: 'USD', timeZone: 'America/El_Salvador', sortOrder: 20 },
  { isoCode: 'HN', name: 'Honduras', phonePrefix: '+504', taxIdLabel: 'RTN', currencyCode: 'HNL', timeZone: 'America/Tegucigalpa', sortOrder: 30 },
  {
    isoCode: 'CR',
    name: 'Costa Rica',
    phonePrefix: '+506',
    taxIdLabel: 'Cédula jurídica',
    currencyCode: 'CRC',
    timeZone: 'America/Costa_Rica',
    sortOrder: 40,
  },
  { isoCode: 'VE', name: 'Venezuela', phonePrefix: '+58', taxIdLabel: 'RIF', currencyCode: 'VES', timeZone: 'America/Caracas', sortOrder: 50 },
  { isoCode: 'EC', name: 'Ecuador', phonePrefix: '+593', taxIdLabel: 'RUC', currencyCode: 'USD', timeZone: 'America/Guayaquil', sortOrder: 60 },
];

export type UnitDimensionSeed = 'MASS' | 'LENGTH' | 'AREA' | 'VOLUME' | 'COUNT' | 'OTHER';

export interface UnitSeed {
  code: string;
  name: string;
  symbol: string;
  dimension: UnitDimensionSeed;
  sortOrder: number;
}

export const UNITS_OF_MEASURE: UnitSeed[] = [
  { code: 'TON', name: 'Tonelada', symbol: 't', dimension: 'MASS', sortOrder: 10 },
  { code: 'KG', name: 'Kilogramo', symbol: 'kg', dimension: 'MASS', sortOrder: 20 },
  { code: 'LB', name: 'Libra', symbol: 'lb', dimension: 'MASS', sortOrder: 30 },
  { code: 'QQ', name: 'Quintal', symbol: 'qq', dimension: 'MASS', sortOrder: 40 },
  { code: 'M', name: 'Metro', symbol: 'm', dimension: 'LENGTH', sortOrder: 50 },
  { code: 'M2', name: 'Metro cuadrado', symbol: 'm²', dimension: 'AREA', sortOrder: 60 },
  { code: 'M3', name: 'Metro cúbico', symbol: 'm³', dimension: 'VOLUME', sortOrder: 70 },
  { code: 'UND', name: 'Unidad', symbol: 'und', dimension: 'COUNT', sortOrder: 80 },
  { code: 'VAR', name: 'Varilla', symbol: 'var', dimension: 'COUNT', sortOrder: 90 },
];

export interface GlobalConversionSeed {
  fromUnit: string;
  toUnit: string;
  /** Texto decimal exacto: nunca `number` (factores de 8 decimales). */
  factor: string;
  description: string;
}

/**
 * Reglas genéricas y exactas (00 §8.2). Las reglas por producto, familia o tipo
 * de proyecto son datos de negocio (DM-24) y no se siembran aquí.
 */
export const GLOBAL_CONVERSIONS: GlobalConversionSeed[] = [
  { fromUnit: 'TON', toUnit: 'TON', factor: '1', description: 'Identidad: tonelada a tonelada' },
  { fromUnit: 'KG', toUnit: 'TON', factor: '0.001', description: 'Kilogramo a tonelada' },
  { fromUnit: 'LB', toUnit: 'TON', factor: '0.00045359237', description: 'Libra internacional a tonelada' },
  { fromUnit: 'QQ', toUnit: 'TON', factor: '0.045359237', description: 'Quintal de 100 lb a tonelada' },
];

export interface SequenceSeed {
  key: string;
  prefix: string;
  pattern: string;
  padding: number;
  resetPolicy: 'NONE' | 'YEAR' | 'MONTH';
}

/** Códigos humanos del CRM (00 §6.1). */
export const CRM_SEQUENCES: SequenceSeed[] = [
  { key: 'crm.cliente', prefix: 'CLI', pattern: '{prefix}-{seq}', padding: 6, resetPolicy: 'NONE' },
  { key: 'crm.proyecto', prefix: 'PRY', pattern: '{prefix}-{year}-{seq}', padding: 5, resetPolicy: 'YEAR' },
  { key: 'crm.oportunidad', prefix: 'OPO', pattern: '{prefix}-{year}-{seq}', padding: 5, resetPolicy: 'YEAR' },
  { key: 'crm.visita', prefix: 'VIS', pattern: '{prefix}-{year}-{seq}', padding: 5, resetPolicy: 'YEAR' },
  { key: 'crm.actividad', prefix: 'ACT', pattern: '{prefix}-{year}-{seq}', padding: 6, resetPolicy: 'YEAR' },
  { key: 'crm.importacion', prefix: 'IMP', pattern: '{prefix}-{year}-{seq}', padding: 4, resetPolicy: 'YEAR' },
];
