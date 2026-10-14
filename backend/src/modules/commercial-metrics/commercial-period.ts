import { type CalendarDate, calendarDateIn, fromCalendarDate, toCalendarDate } from '@/common/calendar-date';

import { addMonths, businessMonth, compareYearMonth, forecastWindowMonths, type MetricClock, type YearMonth } from './metric-definitions';

/**
 * Calendario del negocio (01 L.1 `commercial-period.ts`, 05 RN-05.7, RN-05.8, DEF-G):
 * "hoy", límites de día, mes, trimestre y año, y su traducción a instantes en
 * `crm.zona_horaria_negocio`. Funciones puras, sin dependencias de la base: la zona
 * llega en el `MetricClock` (la lee quien llama con `ParameterReader`).
 *
 * La ventana del forecast M+1…M+H es la de `metric-definitions.ts` (DEF-G): aquí
 * solo se reexporta, para que no haya dos implementaciones.
 */

export { forecastWindowMonths };

/** Rango de fechas de calendario, **ambos extremos incluidos** (01 F.2 `DateRange`). */
export interface DateRange {
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

/** Período por defecto de Inicio (D-01.3): mes, trimestre o año **en curso**. */
export type PeriodKind = 'MONTH' | 'QUARTER' | 'YEAR';

/**
 * Período de calendario traducido a instantes para columnas `timestamptz` (RN-05.8):
 * `[fromInstant, toExclusive)` = `[from 00:00, to+1 00:00)` en la zona del negocio.
 * Las columnas `date` se comparan con `from`/`to` tal cual.
 */
export interface BusinessDateWindow extends DateRange {
  readonly fromInstant: Date;
  readonly toExclusive: Date;
}

const DAY_MS = 86_400_000;

function zonedParts(at: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
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
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((entry) => entry.type === type)?.value;
    const parsed = Number(part);
    if (part === undefined || !Number.isInteger(parsed)) throw new Error(`Cannot read the time in time zone ${timeZone}`);
    return parsed;
  };
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

/** Desfase de la zona en `at` (ms que hay que sumar al UTC para obtener la hora local). */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const local = zonedParts(at, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Instante en que empieza el día `date` (00:00) en `timeZone`. Corrige una vez el
 * desfase para los cambios de horario (Guatemala no los tiene, pero la zona es un parámetro).
 */
export function startOfBusinessDay(date: CalendarDate, timeZone: string): Date {
  const guess = fromCalendarDate(date).getTime();
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone));
}

/** "Hoy" en la zona del negocio. */
export function businessToday(clock: MetricClock): CalendarDate {
  return calendarDateIn(clock.now, clock.businessTimeZone);
}

/** `date` + `days` días de calendario. */
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return toCalendarDate(new Date(fromCalendarDate(date).getTime() + days * DAY_MS));
}

/** `date` + `years` años de calendario (29-feb → 28-feb si el año destino no es bisiesto). */
export function addCalendarYears(date: CalendarDate, years: number): CalendarDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year + years, month - 1, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), month, 0)).getUTCDate();
  return toCalendarDate(new Date(Date.UTC(target.getUTCFullYear(), month - 1, Math.min(day, lastDay))));
}

/** Primer y último día del mes `period`. */
export function monthRange(period: YearMonth): DateRange {
  const from = new Date(Date.UTC(period.year, period.month - 1, 1));
  const to = new Date(Date.UTC(period.year, period.month, 0));
  return { from: toCalendarDate(from), to: toCalendarDate(to) };
}

/** Mes en curso de la zona del negocio como rango de fechas (DEF-G). */
export function currentMonthRange(clock: MetricClock): DateRange {
  return monthRange(businessMonth(clock));
}

/** 01 F.2 `resolvePeriod`: mes, trimestre o año **en curso** en `crm.zona_horaria_negocio` (D-01.3). */
export function resolvePeriod(kind: PeriodKind, clock: MetricClock): DateRange {
  const current = businessMonth(clock);
  switch (kind) {
    case 'MONTH':
      return monthRange(current);
    case 'QUARTER': {
      const firstMonth = Math.floor((current.month - 1) / 3) * 3 + 1;
      return { from: monthRange({ year: current.year, month: firstMonth }).from, to: monthRange({ year: current.year, month: firstMonth + 2 }).to };
    }
    case 'YEAR':
      return { from: `${current.year}-01-01`, to: `${current.year}-12-31` };
  }
}

/** RN-05.8: `[from 00:00, to+1 00:00)` en la zona del negocio. */
export function toBusinessWindow(range: DateRange, timeZone: string): BusinessDateWindow {
  return {
    from: range.from,
    to: range.to,
    fromInstant: startOfBusinessDay(range.from, timeZone),
    toExclusive: startOfBusinessDay(addCalendarDays(range.to, 1), timeZone),
  };
}

/**
 * ¿El rango supera `years` años? Se admite hasta el día anterior al aniversario:
 * de `2021-01-01` a `2025-12-31` son 5 años; `2026-01-01` ya los supera (C.2).
 */
export function exceedsYears(range: DateRange, years: number): boolean {
  return range.to >= addCalendarYears(range.from, years);
}

/** `YYYY-MM` → `{ year, month }`; `null` si no es un mes válido. */
export function parseYearMonth(value: string): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 && year >= 1 ? { year, month } : null;
}

export function formatYearMonth(period: YearMonth): string {
  return `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}`;
}

/** Meses de `from` a `to`, ambos incluidos (vacío si `from > to`). */
export function monthsBetween(from: YearMonth, to: YearMonth): YearMonth[] {
  const count = compareYearMonth(to, from) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, index) => addMonths(from, index));
}
