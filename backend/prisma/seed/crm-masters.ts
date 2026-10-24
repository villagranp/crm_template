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
  // Monedas de los países «solo clientes» (ADR-028): no se operan, pero `countries.currency_code` es obligatoria.
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'JMD', name: 'Dólar jamaiquino', symbol: 'J$', decimals: 2 },
  { code: 'DKK', name: 'Corona danesa', symbol: 'kr', decimals: 2 },
  { code: 'HTG', name: 'Gourde haitiano', symbol: 'G', decimals: 2 },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/', decimals: 2 },
  { code: 'BRL', name: 'Real brasileño', symbol: 'R$', decimals: 2 },
  { code: 'BBD', name: 'Dólar de Barbados', symbol: 'Bds$', decimals: 2 },
  { code: 'TTD', name: 'Dólar de Trinidad y Tobago', symbol: 'TT$', decimals: 2 },
  { code: 'COP', name: 'Peso colombiano', symbol: '$', decimals: 2 },
  { code: 'MXN', name: 'Peso mexicano', symbol: '$', decimals: 2 },
  { code: 'CLP', name: 'Peso chileno', symbol: '$', decimals: 0 },
  { code: 'SRD', name: 'Dólar surinamés', symbol: 'Sr$', decimals: 2 },
  { code: 'CNY', name: 'Yuan renminbi', symbol: '¥', decimals: 2 },
  { code: 'IDR', name: 'Rupia indonesia', symbol: 'Rp', decimals: 0 },
  { code: 'DOP', name: 'Peso dominicano', symbol: 'RD$', decimals: 2 },
  { code: 'GYD', name: 'Dólar guyanés', symbol: 'G$', decimals: 2 },
  { code: 'UYU', name: 'Peso uruguayo', symbol: '$U', decimals: 2 },
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
 * DM-2 (respuesta del responsable, 2026-10-10): países operativos; no se siembran Nicaragua
 * ni Panamá como operativos. Desde ADR-028 (2026-10-23) se añaden, al final, países «solo clientes»
 * (Panamá incluido). `taxIdPattern`/`phonePattern` quedan nulos en la Fase 0 (DM-3: solo
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
  // Países «solo clientes» (ADR-028, 2026-10-23): ahí no se opera, solo hay clientes. Se siembran activos para poder
  // cargarlos; los usuarios, las metas y los equipos siguen siendo de los países operativos de arriba.
  { isoCode: 'US', name: 'Estados Unidos', phonePrefix: '+1', taxIdLabel: 'EIN', currencyCode: 'USD', timeZone: 'America/New_York', sortOrder: 100 },
  { isoCode: 'PR', name: 'Puerto Rico', phonePrefix: '+1', taxIdLabel: 'Identificador fiscal', currencyCode: 'USD', timeZone: 'America/Puerto_Rico', sortOrder: 110 },
  { isoCode: 'PA', name: 'Panamá', phonePrefix: '+507', taxIdLabel: 'RUC', currencyCode: 'USD', timeZone: 'America/Panama', sortOrder: 120 },
  { isoCode: 'MX', name: 'México', phonePrefix: '+52', taxIdLabel: 'RFC', currencyCode: 'MXN', timeZone: 'America/Mexico_City', sortOrder: 130 },
  { isoCode: 'CO', name: 'Colombia', phonePrefix: '+57', taxIdLabel: 'NIT', currencyCode: 'COP', timeZone: 'America/Bogota', sortOrder: 140 },
  { isoCode: 'PE', name: 'Perú', phonePrefix: '+51', taxIdLabel: 'RUC', currencyCode: 'PEN', timeZone: 'America/Lima', sortOrder: 150 },
  { isoCode: 'CL', name: 'Chile', phonePrefix: '+56', taxIdLabel: 'RUT', currencyCode: 'CLP', timeZone: 'America/Santiago', sortOrder: 160 },
  { isoCode: 'BR', name: 'Brasil', phonePrefix: '+55', taxIdLabel: 'CNPJ', currencyCode: 'BRL', timeZone: 'America/Sao_Paulo', sortOrder: 170 },
  { isoCode: 'UY', name: 'Uruguay', phonePrefix: '+598', taxIdLabel: 'RUT', currencyCode: 'UYU', timeZone: 'America/Montevideo', sortOrder: 180 },
  { isoCode: 'DO', name: 'República Dominicana', phonePrefix: '+1', taxIdLabel: 'RNC', currencyCode: 'DOP', timeZone: 'America/Santo_Domingo', sortOrder: 190 },
  { isoCode: 'HT', name: 'Haití', phonePrefix: '+509', taxIdLabel: 'Identificador fiscal', currencyCode: 'HTG', timeZone: 'America/Port-au-Prince', sortOrder: 200 },
  { isoCode: 'JM', name: 'Jamaica', phonePrefix: '+1', taxIdLabel: 'TRN', currencyCode: 'JMD', timeZone: 'America/Jamaica', sortOrder: 210 },
  { isoCode: 'TT', name: 'Trinidad y Tobago', phonePrefix: '+1', taxIdLabel: 'Identificador fiscal', currencyCode: 'TTD', timeZone: 'America/Port_of_Spain', sortOrder: 220 },
  { isoCode: 'BB', name: 'Barbados', phonePrefix: '+1', taxIdLabel: 'Identificador fiscal', currencyCode: 'BBD', timeZone: 'America/Barbados', sortOrder: 230 },
  { isoCode: 'GY', name: 'Guyana', phonePrefix: '+592', taxIdLabel: 'Identificador fiscal', currencyCode: 'GYD', timeZone: 'America/Guyana', sortOrder: 240 },
  { isoCode: 'SR', name: 'Surinam', phonePrefix: '+597', taxIdLabel: 'Identificador fiscal', currencyCode: 'SRD', timeZone: 'America/Paramaribo', sortOrder: 250 },
  { isoCode: 'BE', name: 'Bélgica', phonePrefix: '+32', taxIdLabel: 'Número de empresa', currencyCode: 'EUR', timeZone: 'Europe/Brussels', sortOrder: 260 },
  { isoCode: 'DK', name: 'Dinamarca', phonePrefix: '+45', taxIdLabel: 'CVR', currencyCode: 'DKK', timeZone: 'Europe/Copenhagen', sortOrder: 270 },
  { isoCode: 'IT', name: 'Italia', phonePrefix: '+39', taxIdLabel: 'Partita IVA', currencyCode: 'EUR', timeZone: 'Europe/Rome', sortOrder: 280 },
  { isoCode: 'SK', name: 'Eslovaquia', phonePrefix: '+421', taxIdLabel: 'IČ DPH', currencyCode: 'EUR', timeZone: 'Europe/Bratislava', sortOrder: 290 },
  { isoCode: 'CN', name: 'China', phonePrefix: '+86', taxIdLabel: 'USCC', currencyCode: 'CNY', timeZone: 'Asia/Shanghai', sortOrder: 300 },
  { isoCode: 'ID', name: 'Indonesia', phonePrefix: '+62', taxIdLabel: 'NPWP', currencyCode: 'IDR', timeZone: 'Asia/Jakarta', sortOrder: 310 },
];

export interface TeamSeed {
  code: string;
  name: string;
  description: string;
}

/** ADR-030 (2026-10-23): un equipo por canal comercial. Sin responsable ni jerarquía: los asigna el negocio. */
export const TEAMS: TeamSeed[] = [
  { code: 'CONST', name: 'Construcción', description: 'Canal de construcción.' },
  { code: 'DISTR', name: 'Distribución', description: 'Canal de distribución.' },
  { code: 'INDST', name: 'Industria', description: 'Canal de industria.' },
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
  // Unidades de las plantillas de proyectos y productos del negocio (ADR-031).
  { code: 'KM', name: 'Kilómetro', symbol: 'km', dimension: 'LENGTH', sortOrder: 55 },
  { code: 'PZA', name: 'Pieza', symbol: 'pza', dimension: 'COUNT', sortOrder: 100 },
  { code: 'ROL', name: 'Rollo', symbol: 'rol', dimension: 'COUNT', sortOrder: 110 },
  { code: 'CJS', name: 'Caja', symbol: 'cjs', dimension: 'COUNT', sortOrder: 120 },
  { code: 'PAQ', name: 'Paquete', symbol: 'paq', dimension: 'COUNT', sortOrder: 130 },
  { code: 'SET', name: 'Juego', symbol: 'set', dimension: 'COUNT', sortOrder: 140 },
  { code: 'SAC', name: 'Saco', symbol: 'sac', dimension: 'COUNT', sortOrder: 150 },
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
