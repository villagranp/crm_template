import { calendarDateIn, type CalendarDate } from '@/common/calendar-date';

import { businessMonth, type MetricClock } from './metric-definitions';

/**
 * Períodos del calendario de negocio (01 RN-01.15, DEF-G, D-01.3): mes, trimestre
 * o año **en curso** en `crm.zona_horaria_negocio`, como fechas de calendario
 * inclusivas, y su conversión a instantes para comparar columnas `timestamptz`.
 * Funciones puras (sin Prisma ni Nest); las reutiliza Reportes (05 L).
 */

export type PeriodKind = 'MONTH' | 'QUARTER' | 'YEAR';

/** Fechas de calendario inclusivas (`YYYY-MM-DD`). */
export interface DateRange {
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

/** Rango máximo admitido por la API (RN-01.15). */
export const MAX_PERIOD_DAYS = 366;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Mes, trimestre o año en curso en la zona del negocio (cambio de año correcto). */
export function resolvePeriod(kind: PeriodKind, clock: MetricClock): DateRange {
  const { year, month } = businessMonth(clock);
  if (kind === 'MONTH') {
    return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}` };
  }
  if (kind === 'QUARTER') {
    const first = Math.floor((month - 1) / 3) * 3 + 1;
    const last = first + 2;
    return { from: `${year}-${pad(first)}-01`, to: `${year}-${pad(last)}-${pad(lastDayOfMonth(year, last))}` };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Días de calendario del rango, ambos incluidos. */
export function periodDays(range: DateRange): number {
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Desfase de la zona respecto de UTC en el instante dado, en milisegundos. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  return asUtc - (at.getTime() - at.getMilliseconds());
}

/** Instante en que empieza el día de calendario `date` en la zona (00:00 local). */
export function startOfBusinessDay(date: CalendarDate, timeZone: string): Date {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  // Dos pasadas: el desfase puede cambiar entre la medianoche UTC y la local (horario de verano).
  const first = utcMidnight - zoneOffsetMs(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - zoneOffsetMs(new Date(first), timeZone));
}

/** `[inicio del primer día, inicio del día siguiente al último)` en la zona, para columnas `timestamptz`. */
export function periodInstants(range: DateRange, timeZone: string): { readonly start: Date; readonly endExclusive: Date } {
  const next = new Date(Date.parse(`${range.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { start: startOfBusinessDay(range.from, timeZone), endExclusive: startOfBusinessDay(next, timeZone) };
}

/** "Hoy" en la zona del negocio. */
export function businessToday(clock: MetricClock): CalendarDate {
  return calendarDateIn(clock.now, clock.businessTimeZone);
}
