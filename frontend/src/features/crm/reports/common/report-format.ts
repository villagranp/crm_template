import { formatDecimal, formatMoney, formatTonnage } from '@/features/crm/common/decimal';

import type { ActivityCategory, ForecastMonthRef, VisitCategory } from './report-types';

/**
 * Formatos de Reportes (05 E.1): cifras con `es-GT`, importes rotulados en USD con su código
 * ISO (RN-05.13), toneladas y meses. Los decimales de la API nunca pasan a `number`
 * (`features/crm/common/decimal.ts`).
 */

export const EMPTY = '—';

/** Configuración regional de las cifras de Reportes (E.1: `Intl.NumberFormat('es-GT')`). */
export const REPORT_LOCALE = 'es-GT';

const COUNT_FORMAT = new Intl.NumberFormat(REPORT_LOCALE, { maximumFractionDigits: 0 });

/** Conteo entero (`1234` → `"1,234"`). */
export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? EMPTY : COUNT_FORMAT.format(value);
}

/** Moneda base de todos los totales (RN-05.13, `crm.moneda_base`). */
export const BASE_CURRENCY = 'USD';

/** Importe con 2 decimales y su código ISO (`"125000.0000"` → `"USD 125,000.00"`). */
export function formatUsd(value: string | null | undefined, currencyCode: string = BASE_CURRENCY): string {
  return formatMoney(value, currencyCode);
}

/** Toneladas con 2 decimales y su unidad (`"12.5"` → `"12.50 t"`); `null` → `—`. */
export function formatTons(value: string | null | undefined): string {
  return formatTonnage(value);
}

/** Cantidad con hasta 4 decimales y su unidad al lado (RN-05.12: nunca sin unidad). */
export function formatQuantityWithUnit(value: string | null | undefined, unitSymbol: string): string {
  const text = formatDecimal(value, { maxFractionDigits: 4 });
  return text === EMPTY ? EMPTY : `${text} ${unitSymbol}`;
}

/** Porcentaje con hasta 2 decimales (`"60.00"` → `"60 %"`, como el texto de AC-05.6). */
export function formatReportPercent(value: string | null | undefined): string {
  const text = formatDecimal(value, { maxFractionDigits: 2 });
  return text === EMPTY ? EMPTY : `${text} %`;
}

const MONTH_FORMAT = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Mes de calendario legible (`{2026, 11}` → `"nov 2026"`), sin conversión de zona. */
export function formatMonth({ year, month }: ForecastMonthRef): string {
  return MONTH_FORMAT.format(new Date(Date.UTC(year, month - 1, 1))).replace('.', '');
}

/** Clave estable `YYYY-MM` de un mes. */
export function monthKey({ year, month }: ForecastMonthRef): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Mes de una clave `YYYY-MM`, o `null` si no lo es. */
export function parseMonthKey(value: string | null | undefined): ForecastMonthRef | null {
  const match = value ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

/** Categorías de estado de visita (RN-05.38), en el orden del resumen. */
export const VISIT_CATEGORY_LABELS: Record<VisitCategory, string> = {
  SCHEDULED: 'Programadas',
  COMPLETED: 'Realizadas',
  CONFIRMED: 'Confirmadas',
  CANCELLED: 'Canceladas',
};

/** Categorías de actividad (RN-05.41, D-05.5: pendientes y vencidas son disjuntas). */
export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  PENDING: 'Pendientes',
  OVERDUE: 'Vencidas',
  COMPLETED: 'Realizadas',
  CANCELLED: 'Canceladas',
};

/** Tono de un chip o tarjeta (siempre con su texto: el color nunca es el único indicador). */
export type ReportTone = 'default' | 'info' | 'success' | 'warning' | 'error';

export const VISIT_CATEGORY_TONES: Record<VisitCategory, ReportTone> = {
  SCHEDULED: 'info',
  COMPLETED: 'success',
  CONFIRMED: 'success',
  CANCELLED: 'default',
};

export const ACTIVITY_CATEGORY_TONES: Record<ActivityCategory, ReportTone> = {
  PENDING: 'info',
  OVERDUE: 'error',
  COMPLETED: 'success',
  CANCELLED: 'default',
};

/** Alcance de `reportes.ver` con el que se calcula el reporte (05 H.1). */
export const SCOPE_LABELS: Record<'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION', string> = {
  OWN: 'Propios',
  TEAM: 'Equipo',
  COUNTRY: 'País',
  ORGANIZATION: 'Organización',
};
