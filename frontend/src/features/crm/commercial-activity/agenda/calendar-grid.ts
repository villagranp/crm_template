/**
 * Cálculo del calendario de la agenda (04 §E.2, D-04.1): sin librerías, solo
 * `Date` e `Intl` nativos. Funciones puras, sin React.
 *
 * - Los días se identifican con su clave `YYYY-MM-DD`. La rejilla es aritmética
 *   de calendario pura (fechas UTC construidas por componentes y formateadas en
 *   UTC), así que no depende de la zona del navegador ni de sus cambios de
 *   horario.
 * - Lo que une la rejilla con los instantes (`rangeFor`, `dayKeyOfInstant`,
 *   `groupByDay`) recibe la zona del usuario (RN-04.9, D-04.17); omitida, la
 *   del navegador.
 * - La semana empieza en lunes (es-MX); `weekStartsOn` permite otra.
 */

import { cachedDateTimeFormat, dayKeyInTimeZone, startOfDayEpoch } from '../common/date-time';

export type CalendarMode = 'month' | 'week' | 'day';

export const CALENDAR_MODES: readonly CalendarMode[] = ['month', 'week', 'day'];

/** 0 = domingo … 6 = sábado, como `Date.getDay()`. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const MONDAY: WeekStart = 1;

/** Tope del calendario en el backend (D-04.12, `CALENDAR_MAX_DAYS`). */
export const CALENDAR_MAX_RANGE_DAYS = 42;

const LOCALE = 'es-MX';
const DAYS_PER_WEEK = 7;
const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDay {
  /** `YYYY-MM-DD` local. */
  key: string;
  /** Día del mes (1–31). */
  dayOfMonth: number;
  /** `false` en los días de los meses vecinos que completan la rejilla del mes. */
  inMonth: boolean;
}

export interface CalendarRange {
  /** Instante ISO (`…Z`) del inicio del primer día. */
  from: string;
  /** Instante ISO (`…Z`) del final del último día (incluido). */
  to: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Fecha de calendario (medianoche UTC) por componentes. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Clave `YYYY-MM-DD` de una fecha de calendario (sus componentes UTC). */
export function toDayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Fecha de calendario (medianoche UTC) del día `YYYY-MM-DD`; `null` si la clave no es una fecha real (p. ej. 2026-02-30). */
export function parseDayKey(key: string | null | undefined): Date | null {
  const match = key ? DAY_KEY.exec(key) : null;
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = utcDate(year, month, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

export function isValidDayKey(key: string | null | undefined): key is string {
  return parseDayKey(key) !== null;
}

function requireDay(key: string): Date {
  const date = parseDayKey(key);
  if (!date) {
    throw new RangeError(`Fecha de calendario no válida: ${key}`);
  }
  return date;
}

function addDays(date: Date, days: number): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
}

/** Clave del día desplazado `days` días. */
export function addDaysToKey(key: string, days: number): string {
  return toDayKey(addDays(requireDay(key), days));
}

function daysInMonth(year: number, month: number): number {
  return utcDate(year, month + 1, 0).getUTCDate();
}

/** Primer día de la semana que contiene `date`. */
function startOfWeek(date: Date, weekStartsOn: WeekStart): Date {
  const offset = (date.getUTCDay() - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(date, -offset);
}

/** Los siete días de la semana que contiene `key`, empezando en `weekStartsOn`. */
export function weekDays(key: string, weekStartsOn: WeekStart = MONDAY): CalendarDay[] {
  const start = startOfWeek(requireDay(key), weekStartsOn);
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
    const date = addDays(start, index);
    return { key: toDayKey(date), dayOfMonth: date.getUTCDate(), inMonth: true };
  });
}

/**
 * Rejilla del mes de `key` en semanas completas (4 a 6 filas de 7 días). Los
 * días de los meses vecinos van con `inMonth = false`.
 */
export function monthGrid(key: string, weekStartsOn: WeekStart = MONDAY): CalendarDay[][] {
  const reference = requireDay(key);
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const first = utcDate(year, month, 1);
  const last = utcDate(year, month, daysInMonth(year, month));
  const gridStart = startOfWeek(first, weekStartsOn);
  const gridEnd = addDays(startOfWeek(last, weekStartsOn), DAYS_PER_WEEK - 1);

  const weeks: CalendarDay[][] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, DAYS_PER_WEEK)) {
    weeks.push(
      Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
        const date = addDays(cursor, index);
        return { key: toDayKey(date), dayOfMonth: date.getUTCDate(), inMonth: date.getUTCMonth() === month };
      }),
    );
  }
  return weeks;
}

/** Días visibles de un modo, en orden. */
export function visibleDays(mode: CalendarMode, key: string, weekStartsOn: WeekStart = MONDAY): CalendarDay[] {
  switch (mode) {
    case 'month':
      return monthGrid(key, weekStartsOn).flat();
    case 'week':
      return weekDays(key, weekStartsOn);
    case 'day':
      return [{ key, dayOfMonth: requireDay(key).getUTCDate(), inMonth: true }];
  }
}

/** Medianoche del día `key` en la zona (ms). */
function zonedStartOfDay(key: string, timeZone: string | undefined): number {
  const start = startOfDayEpoch(key, timeZone);
  if (start === null) {
    throw new RangeError(`Fecha de calendario no válida: ${key}`);
  }
  return start;
}

/**
 * Rango `{from, to}` para `GET /agenda/calendar`: del inicio de la primera
 * celda visible al final de la última, en la zona del usuario. Un mes ocupa
 * como mucho 6 semanas = 42 días, el tope del backend (D-04.12). Si un cambio
 * de horario alargara el rango más de 42 días exactos, `to` se recorta a
 * `from + 42 días` para no recibir `400 RANGE_TOO_WIDE` (solo se pierde, en ese
 * caso, la última hora).
 */
export function rangeFor(mode: CalendarMode, key: string, weekStartsOn: WeekStart = MONDAY, timeZone?: string): CalendarRange {
  const days = visibleDays(mode, key, weekStartsOn);
  const first = zonedStartOfDay(days[0]?.key ?? key, timeZone);
  const afterLast = zonedStartOfDay(addDaysToKey(days[days.length - 1]?.key ?? key, 1), timeZone);
  const cap = first + CALENDAR_MAX_RANGE_DAYS * DAY_MS;
  return { from: new Date(first).toISOString(), to: new Date(Math.min(afterLast - 1, cap)).toISOString() };
}

/**
 * Mueve la fecha de referencia `delta` meses, semanas o días. Al cambiar de mes
 * se conserva el día si existe y si no se usa el último (31 de enero + 1 mes =
 * 28 o 29 de febrero).
 */
export function shiftReference(mode: CalendarMode, key: string, delta: number): string {
  const date = requireDay(key);
  switch (mode) {
    case 'month': {
      const target = utcDate(date.getUTCFullYear(), date.getUTCMonth() + delta, 1);
      const day = Math.min(date.getUTCDate(), daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
      return toDayKey(utcDate(target.getUTCFullYear(), target.getUTCMonth(), day));
    }
    case 'week':
      return toDayKey(addDays(date, delta * DAYS_PER_WEEK));
    case 'day':
      return toDayKey(addDays(date, delta));
  }
}

/** Clave del día de un instante ISO en la zona indicada; `null` si no es válido. */
export function dayKeyOfInstant(instant: string, timeZone?: string): string | null {
  return dayKeyInTimeZone(instant, timeZone);
}

/**
 * Agrupa eventos por su día (`YYYY-MM-DD`) en la zona indicada, cada grupo
 * ordenado por instante ascendente (a igual hora, se conserva el orden de llegada).
 */
export function groupByDay<T extends { date: string }>(items: readonly T[], timeZone?: string): Map<string, T[]> {
  const sorted = items
    .map((item, index) => ({ item, index, time: new Date(item.date).getTime() }))
    .filter((entry) => !Number.isNaN(entry.time))
    .sort((left, right) => left.time - right.time || left.index - right.index);
  const groups = new Map<string, T[]>();
  for (const { item } of sorted) {
    const key = dayKeyOfInstant(item.date, timeZone);
    if (key === null) {
      continue;
    }
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/** Formatea una fecha de calendario en UTC, donde viven sus componentes. */
function format(options: Intl.DateTimeFormatOptions, date: Date): string {
  return cachedDateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(date);
}

/** Mes abreviado sin punto final ("oct"). */
function shortMonth(date: Date): string {
  return format({ month: 'short' }, date).replace(/\.$/, '');
}

/** "lunes, 12 de octubre de 2026". */
export function dayLongLabel(key: string): string {
  return format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, requireDay(key));
}

/**
 * Título del periodo visible:
 * - mes: "octubre de 2026";
 * - semana: "12 – 18 oct 2026", "28 sep – 4 oct 2026" o "29 dic 2025 – 4 ene 2026";
 * - día: "lunes, 12 de octubre de 2026".
 */
export function periodLabel(mode: CalendarMode, key: string, weekStartsOn: WeekStart = MONDAY): string {
  const date = requireDay(key);
  switch (mode) {
    case 'month':
      return format({ month: 'long', year: 'numeric' }, date);
    case 'day':
      return dayLongLabel(key);
    case 'week': {
      const days = weekDays(key, weekStartsOn);
      const start = requireDay(days[0]?.key ?? key);
      const end = requireDay(days[DAYS_PER_WEEK - 1]?.key ?? key);
      const endText = `${end.getUTCDate()} ${shortMonth(end)} ${end.getUTCFullYear()}`;
      if (start.getUTCFullYear() !== end.getUTCFullYear()) {
        return `${start.getUTCDate()} ${shortMonth(start)} ${start.getUTCFullYear()} – ${endText}`;
      }
      if (start.getUTCMonth() !== end.getUTCMonth()) {
        return `${start.getUTCDate()} ${shortMonth(start)} – ${endText}`;
      }
      return `${start.getUTCDate()} – ${endText}`;
    }
  }
}

export interface WeekdayName {
  /** "lun". */
  short: string;
  /** "lunes". */
  long: string;
}

/** Nombres de los días en el orden de la rejilla, empezando en `weekStartsOn`. */
export function weekdayNames(weekStartsOn: WeekStart = MONDAY): WeekdayName[] {
  // 2026-10-04 es domingo: base fija para recorrer los siete días.
  const sunday = utcDate(2026, 9, 4);
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
    const date = addDays(sunday, (weekStartsOn + index) % DAYS_PER_WEEK);
    return { short: format({ weekday: 'short' }, date).replace(/\.$/, ''), long: format({ weekday: 'long' }, date) };
  });
}

/** "3 eventos", "1 evento", "Sin eventos". */
export function eventCountLabel(count: number): string {
  if (count === 0) {
    return 'Sin eventos';
  }
  return count === 1 ? '1 evento' : `${count} eventos`;
}
