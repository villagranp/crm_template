/**
 * Fechas y horas de Actividad comercial (RN-04.9, D-04.17), solo con `Intl` y
 * `Date` nativos (D-04.1: sin librerías de fechas).
 *
 * - Los **instantes** (`*_at`) llegan en UTC y se muestran en la zona del
 *   perfil del usuario (`timeZone` de los `form-options` del módulo, que expone
 *   `useCommercialTimeZones`). Cada función recibe la zona explícita; omitida,
 *   se usa la del navegador (mientras carga o si no está disponible).
 * - Las **fechas de calendario** (`next_action_date`, `YYYY-MM-DD`) no tienen
 *   zona: se muestran tal cual, sin convertir.
 * - "Hoy" se calcula en la zona de negocio (`businessTimeZone`,
 *   `crm.zona_horaria_negocio`) con `todayInTimeZone`.
 * - Las entradas `datetime-local` (D-04.1) se interpretan en la zona del
 *   usuario: `toDateTimeLocalValue` y `fromDateTimeLocalValue` convierten a y
 *   desde ISO con el desfase de esa zona en ese instante (seguro ante cambios
 *   de horario), calculado con `Intl.DateTimeFormat`.
 */

const LOCALE = 'es-MX';
const EMPTY = '—';
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const cachedFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * `Intl.DateTimeFormat` reutilizable por locale, opciones y zona: crear uno es
 * caro (carga datos de ICU) y una agenda o una tabla formatea cientos de fechas.
 */
export function cachedDateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = cachedFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    cachedFormatters.set(key, formatter);
  }
  return formatter;
}

function formatWith(options: Intl.DateTimeFormatOptions, value: string | null | undefined, timeZone?: string): string {
  const date = parseInstant(value);
  return date ? cachedDateTimeFormat(LOCALE, { ...options, timeZone }).format(date) : EMPTY;
}

/** "12 oct 2026, 10:30" en la zona indicada (por defecto, la del navegador). */
export function formatDateTime(value: string | null | undefined, timeZone?: string): string {
  return formatWith({ dateStyle: 'medium', timeStyle: 'short' }, value, timeZone);
}

/** "12 oct 2026" de un instante. */
export function formatDate(value: string | null | undefined, timeZone?: string): string {
  return formatWith({ dateStyle: 'medium' }, value, timeZone);
}

/** "10:30" de un instante. */
export function formatTime(value: string | null | undefined, timeZone?: string): string {
  return formatWith({ timeStyle: 'short' }, value, timeZone);
}

/** Fecha de calendario `YYYY-MM-DD` como "20 oct 2026", sin conversión de zona. */
export function formatCalendarDate(value: string | null | undefined): string {
  const match = value ? CALENDAR_DATE.exec(value) : null;
  if (!match) {
    return EMPTY;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return cachedDateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** "Hoy" como `YYYY-MM-DD` en una zona (la de negocio para fechas de calendario, RN-04.9). */
export function todayInTimeZone(timeZone?: string, now: Date = new Date()): string {
  return dayKeyInTimeZone(now, timeZone) ?? '';
}

/**
 * Duración corta y legible: "45 min", "5 h", "1 día", "3 días". Se usa para el
 * vencimiento relativo ("vence en 5 h", "venció hace 2 días").
 */
export function formatDurationShort(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(milliseconds) / MS_PER_MINUTE));
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes} min`;
  }
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return `${hours} h`;
  }
  const days = Math.round(hours / HOURS_PER_DAY);
  return days === 1 ? '1 día' : `${days} días`;
}

/** Texto relativo de un vencimiento respecto de `now`: "Vence en 5 h" o "Venció hace 2 días". */
export function describeDue(dueAt: string | null | undefined, now: Date = new Date()): string | null {
  const date = parseInstant(dueAt);
  if (!date) {
    return null;
  }
  const difference = date.getTime() - now.getTime();
  return difference >= 0 ? `Vence en ${formatDurationShort(difference)}` : `Venció hace ${formatDurationShort(difference)}`;
}

/** "N min" de una duración en minutos ("1 h 30 min"). */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return EMPTY;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Componentes de pared (año, mes 1–12, día, hora, minuto, segundo) de un instante en una zona. */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let formatter = partsFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(key, formatter);
  }
  return formatter;
}

/** Hora de pared de `date` en `timeZone` (por defecto, la del navegador). */
export function zonedParts(date: Date, timeZone?: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    // Algunos motores escriben la medianoche como "24".
    hour: value('hour') % HOURS_PER_DAY,
    minute: value('minute'),
    second: value('second'),
  };
}

/** Desfase (ms) de `timeZone` respecto de UTC en el instante `epochMs`. */
function offsetAt(epochMs: number, timeZone?: string): number {
  const parts = zonedParts(new Date(epochMs), timeZone);
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const wholeSeconds = epochMs - (((epochMs % MS_PER_SECOND) + MS_PER_SECOND) % MS_PER_SECOND);
  return wall - wholeSeconds;
}

/** Hora de pared que se convierte en instante (`second` opcional). */
export type WallTime = Omit<ZonedParts, 'second'> & { second?: number };

/**
 * Instante (ms) de una hora de pared en una zona. Se prueban los desfases de
 * las 12 h anteriores y posteriores, así que un cambio de horario no desplaza
 * la hora: una hora repetida (atraso) toma su primera aparición y una que no
 * existe (adelanto) se lee con el desfase previo, como hace `Date` (02:30 → 03:30).
 */
export function zonedTimeToEpoch(wallTime: WallTime, timeZone?: string): number {
  const wall = Date.UTC(wallTime.year, wallTime.month - 1, wallTime.day, wallTime.hour, wallTime.minute, wallTime.second ?? 0);
  const offsets = [offsetAt(wall - HALF_DAY_MS, timeZone), offsetAt(wall + HALF_DAY_MS, timeZone)];
  const valid = offsets.map((offset) => wall - offset).filter((candidate) => offsetAt(candidate, timeZone) === wall - candidate);
  return valid.length > 0 ? Math.min(...valid) : wall - Math.min(...offsets);
}

const validTimeZones = new Map<string, boolean>();

/** `true` si `Intl` reconoce la zona IANA (el resultado se recuerda por zona). */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) {
    return false;
  }
  const known = validTimeZones.get(timeZone);
  if (known !== undefined) {
    return known;
  }
  let valid: boolean;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    valid = true;
  } catch {
    valid = false;
  }
  validTimeZones.set(timeZone, valid);
  return valid;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/** Valor de un `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) para un instante ISO, en la zona indicada. */
export function toDateTimeLocalValue(value: string | null | undefined, timeZone?: string): string {
  const date = parseInstant(value);
  if (!date) {
    return '';
  }
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Valor `datetime-local` del instante actual en la zona indicada (por defecto de "fecha de finalización"). */
export function nowDateTimeLocalValue(now: Date = new Date(), timeZone?: string): string {
  return toDateTimeLocalValue(now.toISOString(), timeZone);
}

/**
 * Instante ISO con zona (`…Z`) de un valor `datetime-local` interpretado en la
 * zona indicada; `null` si está vacío o no es una fecha y hora reales.
 */
export function fromDateTimeLocalValue(value: string | null | undefined, timeZone?: string): string | null {
  const match = value ? LOCAL_DATE_TIME.exec(value.trim()) : null;
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (!isRealDate(year, month, day) || hour >= HOURS_PER_DAY || minute >= MINUTES_PER_HOUR || second >= SECONDS_PER_MINUTE) {
    return null;
  }
  return new Date(zonedTimeToEpoch({ year, month, day, hour, minute, second }, timeZone)).toISOString();
}

/** `true` si el valor `datetime-local` (en la zona indicada) es posterior a `now`. */
export function isFutureLocalValue(value: string | null | undefined, now: Date = new Date(), timeZone?: string): boolean {
  const iso = fromDateTimeLocalValue(value, timeZone);
  return iso !== null && new Date(iso).getTime() > now.getTime();
}

/** Medianoche del día `YYYY-MM-DD` en la zona indicada (ms), o `null` si no es una fecha real. */
export function startOfDayEpoch(day: string | null | undefined, timeZone?: string): number | null {
  const match = day ? CALENDAR_DATE.exec(day) : null;
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  return isRealDate(year, month, date) ? zonedTimeToEpoch({ year, month, day: date, hour: 0, minute: 0 }, timeZone) : null;
}

/** Clave `YYYY-MM-DD` desplazada `days` días (aritmética de calendario, sin zona). */
export function shiftDayKey(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Inicio del día `YYYY-MM-DD` (en la zona indicada) como instante ISO, para filtros por rango. */
export function startOfDayIso(day: string | null | undefined, timeZone?: string): string | undefined {
  const start = startOfDayEpoch(day, timeZone);
  return start === null ? undefined : new Date(start).toISOString();
}

/**
 * Fin del día `YYYY-MM-DD` (en la zona indicada, último milisegundo) como
 * instante ISO: inicio del día siguiente menos 1 ms, así que un día con cambio
 * de horario dura 23 o 25 horas.
 */
export function endOfDayIso(day: string | null | undefined, timeZone?: string): string | undefined {
  if (!day || startOfDayEpoch(day, timeZone) === null) {
    return undefined;
  }
  const next = startOfDayEpoch(shiftDayKey(day, 1), timeZone);
  return next === null ? undefined : new Date(next - 1).toISOString();
}

/** Clave `YYYY-MM-DD` del día de un instante en la zona indicada; `null` si no es válido. */
export function dayKeyInTimeZone(value: string | Date, timeZone?: string): string | null {
  const date = typeof value === 'string' ? parseInstant(value) : value;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
