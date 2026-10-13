/**
 * Fechas y horas de Actividad comercial (RN-04.9, D-04.17), solo con `Intl` y
 * `Date` nativos (D-04.1: sin librerías de fechas).
 *
 * - Los **instantes** (`*_at`) llegan en UTC y se muestran en la zona del
 *   usuario. El contrato aún no publica la zona del perfil (`users.time_zone`):
 *   mientras tanto se usa la del navegador (`timeZone` omitido). Cada función
 *   acepta la zona explícita para cuando el contrato la exponga.
 * - Las **fechas de calendario** (`next_action_date`, `YYYY-MM-DD`) no tienen
 *   zona: se muestran tal cual, sin convertir.
 * - "Hoy" se calcula en la zona de negocio (`crm.zona_horaria_negocio`) con
 *   `todayInTimeZone`; si no se conoce, en la del navegador.
 * - Las entradas `datetime-local` (D-04.1) trabajan en la zona del navegador:
 *   `toDateTimeLocalValue` y `fromDateTimeLocalValue` convierten a y desde ISO.
 */

const LOCALE = 'es-MX';
const EMPTY = '—';
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWith(options: Intl.DateTimeFormatOptions, value: string | null | undefined, timeZone?: string): string {
  const date = parseInstant(value);
  return date ? new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).format(date) : EMPTY;
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
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** "Hoy" como `YYYY-MM-DD` en una zona (la de negocio para fechas de calendario, RN-04.9). */
export function todayInTimeZone(timeZone?: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
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

/** Valor de un `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`, zona del navegador) para un instante ISO. */
export function toDateTimeLocalValue(value: string | null | undefined): string {
  const date = parseInstant(value);
  if (!date) {
    return '';
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valor `datetime-local` del instante actual (por defecto de "fecha de finalización"). */
export function nowDateTimeLocalValue(now: Date = new Date()): string {
  return toDateTimeLocalValue(now.toISOString());
}

/** Instante ISO con zona (`…Z`) de un valor `datetime-local`; `null` si está vacío o no es válido. */
export function fromDateTimeLocalValue(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `true` si el valor `datetime-local` es posterior a `now`. */
export function isFutureLocalValue(value: string | null | undefined, now: Date = new Date()): boolean {
  const iso = fromDateTimeLocalValue(value);
  return iso !== null && new Date(iso).getTime() > now.getTime();
}

/** Inicio del día `YYYY-MM-DD` (zona del navegador) como instante ISO, para filtros por rango. */
export function startOfDayIso(day: string | null | undefined): string | undefined {
  return CALENDAR_DATE.test(day ?? '') ? (fromDateTimeLocalValue(`${day}T00:00`) ?? undefined) : undefined;
}

/** Fin del día `YYYY-MM-DD` (zona del navegador) como instante ISO, para filtros por rango. */
export function endOfDayIso(day: string | null | undefined): string | undefined {
  if (!CALENDAR_DATE.test(day ?? '')) {
    return undefined;
  }
  const date = new Date(`${day}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
