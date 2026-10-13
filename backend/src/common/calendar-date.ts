/**
 * Fechas de calendario (`date`, sin hora; DM-31) como texto `YYYY-MM-DD` entre capas
 * y en la API. Funciones puras, sin dependencias de la base ni del ORM.
 *
 * - Prisma lee y escribe `@db.Date` como `Date` a medianoche UTC: los adaptadores
 *   convierten con `toCalendarDate` / `fromCalendarDate` y nunca usan la zona local
 *   del proceso.
 * - "Hoy" depende de la zona del negocio (`crm.zona_horaria_negocio`), no de UTC:
 *   `calendarDateIn(now, timeZone)`.
 */

/** `YYYY-MM-DD` de una fecha real del calendario gregoriano. */
export type CalendarDate = string;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'string') return false;
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function assertCalendarDate(value: CalendarDate): void {
  if (!isCalendarDate(value)) {
    throw new RangeError('Invalid calendar date (expected YYYY-MM-DD)');
  }
}

/** Medianoche UTC de la fecha: el valor que espera una columna `@db.Date` de Prisma. */
export function fromCalendarDate(value: CalendarDate): Date {
  assertCalendarDate(value);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Fecha de calendario de un `Date` leído de una columna `@db.Date` (componentes UTC). */
export function toCalendarDate(value: Date): CalendarDate {
  return value.toISOString().slice(0, 10);
}

/** Días naturales de `from` a `to` (positivo si `to` es posterior). */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((fromCalendarDate(to).getTime() - fromCalendarDate(from).getTime()) / DAY_MS);
}

/** Fecha de calendario del instante `at` en la zona IANA indicada ("hoy" del negocio). */
export function calendarDateIn(at: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const value = (type: string): string => {
    const part = parts.find((entry) => entry.type === type)?.value;
    if (!part) throw new Error(`Cannot compute the calendar date in time zone ${timeZone}`);
    return part;
  };
  return `${value('year')}-${value('month')}-${value('day')}`;
}
