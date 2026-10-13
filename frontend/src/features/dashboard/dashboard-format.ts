import {
  DECIMAL_LOCALE,
  formatDecimal,
  formatMoney,
  formatQuantity,
  formatTonnage,
} from '@/features/crm/common/decimal';
import type { Profile } from '@/services/access';
import { priorityTones } from '@/theme/tokens';

import type {
  AlertDisabledReason,
  AlertType,
  CustomerRef,
  DashboardPeriod,
  PeriodRange,
  ProjectRef,
  RecentActivityEventType,
  StageCount,
  TargetItem,
  TargetMetric,
  UnitRef,
  YearMonth,
} from './dashboard.types';

/**
 * Textos y formatos del Panel de control (01 §E). Los decimales llegan como
 * cadena y se formatean con `features/crm/common/decimal` (nunca se suman ni
 * se convierten a `number` para calcular). Fechas y horas en la zona horaria
 * del navegador (RN-01.3).
 */

const EMPTY = '—';

const longDateFormatter = new Intl.DateTimeFormat(DECIMAL_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const clockFormatter = new Intl.DateTimeFormat(DECIMAL_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateTimeFormatter = new Intl.DateTimeFormat(DECIMAL_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const weekdayTimeFormatter = new Intl.DateTimeFormat(DECIMAL_LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const shortDateFormatter = new Intl.DateTimeFormat(DECIMAL_LOCALE, {
  day: 'numeric',
  month: 'short',
});
const shortDateYearFormatter = new Intl.DateTimeFormat(DECIMAL_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat(DECIMAL_LOCALE, { month: 'short', year: 'numeric' });
const relativeFormatter = new Intl.RelativeTimeFormat(DECIMAL_LOCALE, { numeric: 'auto' });

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseIso(isoDate: string | null | undefined): Date | null {
  if (!isoDate) {
    return null;
  }
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// Hero (RN-01.3)
// ---------------------------------------------------------------------------

const MORNING_END_HOUR = 12;
const AFTERNOON_END_HOUR = 19;

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora local. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < MORNING_END_HOUR) {
    return 'Buenos días';
  }
  return hour < AFTERNOON_END_HOUR ? 'Buenas tardes' : 'Buenas noches';
}

/** "Martes, 13 de octubre de 2026". */
export function formatLongDate(date: Date): string {
  return capitalize(longDateFormatter.format(date));
}

/** "09:05" (24 h). */
export function formatClock(date: Date): string {
  return clockFormatter.format(date);
}

/** Etiquetas del alcance de datos (DM-10: `COUNTRY` es "País"). */
export const DATA_SCOPE_LABELS: Record<Profile['dataScope'], string> = {
  OWN: 'Propios',
  TEAM: 'Equipo',
  COUNTRY: 'País',
  ORGANIZATION: 'Organización',
};

/** Nombre de pila para el saludo ("Ana López" → "Ana"). */
export function firstNameOf(displayName: string | null | undefined): string {
  return (displayName ?? '').trim().split(/\s+/)[0] ?? '';
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

/** "Actualizado 10:42" a partir de `generatedAt`. */
export function formatUpdatedAt(isoDate: string | null | undefined): string | null {
  const date = parseIso(isoDate);
  return date ? `Actualizado ${formatClock(date)}` : null;
}

/** Fecha y hora absolutas ("13 oct 2026, 10:42"), para `title` y lectores de pantalla. */
export function formatDateTime(isoDate: string | null | undefined): string {
  const date = parseIso(isoDate);
  return date ? dateTimeFormatter.format(date) : EMPTY;
}

/** "mar, 14 oct, 09:30": fecha y hora de una visita próxima. */
export function formatVisitDateTime(isoDate: string | null | undefined): string {
  const date = parseIso(isoDate);
  return date ? capitalize(weekdayTimeFormatter.format(date)) : EMPTY;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_DAYS_LIMIT = 30;

/**
 * Fecha relativa en ambos sentidos: "hace 2 horas", "ayer", "dentro de 3 días";
 * más allá de 30 días, la fecha absoluta.
 */
export function formatRelative(isoDate: string | null | undefined, now: Date = new Date()): string {
  const date = parseIso(isoDate);
  if (!date) {
    return EMPTY;
  }
  const delta = date.getTime() - now.getTime();
  const distance = Math.abs(delta);
  const sign = delta < 0 ? -1 : 1;
  if (distance < MINUTE_MS) {
    return delta < 0 ? 'hace un momento' : 'en un momento';
  }
  if (distance < HOUR_MS) {
    return relativeFormatter.format(sign * Math.floor(distance / MINUTE_MS), 'minute');
  }
  if (distance < DAY_MS) {
    return relativeFormatter.format(sign * Math.floor(distance / HOUR_MS), 'hour');
  }
  const days = Math.floor(distance / DAY_MS);
  return days <= RELATIVE_DAYS_LIMIT
    ? relativeFormatter.format(sign * days, 'day')
    : shortDateYearFormatter.format(date);
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha de calendario `YYYY-MM-DD` como fecha local (sin desplazamiento de zona). */
function calendarDate(value: string): Date | null {
  const match = CALENDAR_DATE.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  MONTH: 'Mes en curso',
  QUARTER: 'Trimestre en curso',
  YEAR: 'Año en curso',
};

/** Rango del período: "1 oct – 31 oct 2026". */
export function formatPeriodRange(period: Pick<PeriodRange, 'from' | 'to'>): string {
  const from = calendarDate(period.from);
  const to = calendarDate(period.to);
  if (!from || !to) {
    return EMPTY;
  }
  const fromText =
    from.getFullYear() === to.getFullYear()
      ? shortDateFormatter.format(from)
      : shortDateYearFormatter.format(from);
  return `${fromText} – ${shortDateYearFormatter.format(to)}`;
}

/** "nov 2026" (se construye con sus partes: `new Date('2026-11')` se desplaza por la zona). */
export function formatMonth({ year, month }: YearMonth): string {
  return monthFormatter.format(new Date(year, month - 1, 1)).replace('.', '');
}

// ---------------------------------------------------------------------------
// Cifras
// ---------------------------------------------------------------------------

/** "1 parcial" / "3 parciales". */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Entero con separador de miles (`1,250`). */
export function formatCount(count: number): string {
  return formatDecimal(String(count));
}

/** Toneladas con dos decimales y símbolo ("1,250.50 t"). */
export function formatTonnageValue(value: string | null, unit: UnitRef | null): string {
  return formatTonnage(value, unit?.symbol ?? 't');
}

/** Cantidad con su unidad, sin mezclar unidades ("1,200 var"). */
export function formatQuantityText(quantity: string, unitSymbol: string): string {
  return formatQuantity(quantity, unitSymbol);
}

/** Las tres etapas abiertas con más oportunidades (empate: orden del catálogo). */
export function topStages(byStage: readonly StageCount[], limit = 3): StageCount[] {
  return [...byStage]
    .filter((stage) => stage.count > 0)
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .slice(0, limit);
}

/**
 * Proporción (0–1) de cada mes del forecast respecto al mayor, sólo para el
 * ancho de la mini-serie. Es presentación: el total y las cifras mostradas
 * siguen siendo las cadenas del backend.
 */
export function forecastBarRatios(tonnages: readonly string[]): number[] {
  const values = tonnages.map((tonnage) => Number(tonnage));
  const max = Math.max(0, ...values.filter((value) => Number.isFinite(value)));
  return values.map((value) => (max > 0 && Number.isFinite(value) ? value / max : 0));
}

export const TARGET_METRIC_LABELS: Record<TargetMetric, string> = {
  TONNAGE: 'Toneladas',
  AMOUNT: 'Monto',
  WON_OPPORTUNITIES: 'Oportunidades ganadas',
  VISITS: 'Visitas realizadas',
  ACTIVITIES: 'Actividades completadas',
};

/**
 * Valor de una meta en su unidad: toneladas en "t", `AMOUNT` en USD
 * (RN-01.32), el resto como conteo.
 */
export function formatTargetValue(
  value: string,
  item: Pick<TargetItem, 'metric' | 'unit' | 'currencyCode'>,
): string {
  if (item.metric === 'AMOUNT' || item.currencyCode) {
    return formatMoney(value, item.currencyCode ?? 'USD');
  }
  if (item.metric === 'TONNAGE') {
    return formatTonnage(value, item.unit?.symbol ?? 't');
  }
  const count = formatDecimal(value, { maxFractionDigits: 2 });
  return item.unit?.symbol ? `${count} ${item.unit.symbol}` : count;
}

/** Cumplimiento "64.00 %"; `null` → "No calculable" (RN-01.11). */
export function formatCompliance(percent: string | null): string {
  if (percent === null) {
    return 'No calculable';
  }
  const text = formatDecimal(percent, { minFractionDigits: 2, maxFractionDigits: 2 });
  return text === EMPTY ? 'No calculable' : `${text} %`;
}

// ---------------------------------------------------------------------------
// Actividad reciente y alertas
// ---------------------------------------------------------------------------

export const EVENT_TYPE_LABELS: Record<RecentActivityEventType, string> = {
  ACTIVIDAD_REGISTRADA: 'Actividad registrada',
  ACTIVIDAD_COMPLETADA: 'Actividad completada',
  INTERACCION: 'Interacción',
  OPORTUNIDAD_ETAPA: 'Cambio de etapa',
  OPORTUNIDAD_CERRADA: 'Oportunidad cerrada',
  OPORTUNIDAD_RESULTADO: 'Resultado de oportunidad',
  OPORTUNIDAD_CREADA: 'Oportunidad creada',
  OPORTUNIDAD_ACTUALIZADA: 'Oportunidad actualizada',
  PROYECTO_CREADO: 'Proyecto creado',
  PROYECTO_FASE: 'Cambio de fase',
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  ACTIVIDAD_VENCIDA: 'Actividades vencidas',
  VISITA_SIN_CONFIRMAR: 'Visitas sin confirmar',
  PROYECTO_SIN_ACTUALIZAR: 'Proyectos sin actualizar',
  OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'Oportunidades sin siguiente acción',
};

export const ALERT_DISABLED_REASON_LABELS: Record<AlertDisabledReason, string> = {
  DISABLED_BY_PARAMETER: 'Desactivada por la configuración del sistema.',
  PARAMETER_INVALID:
    'Desactivada: su parámetro de configuración no es válido. Avisa al administrador.',
};

export type PriorityTone = (typeof priorityTones)['high' | 'medium' | 'low'];

/** Color semántico de una prioridad por su peso de catálogo (nunca por código o etiqueta). */
export function priorityTone(weight: number | null | undefined): PriorityTone {
  if (weight !== null && weight !== undefined && weight >= priorityTones.highMinWeight) {
    return priorityTones.high;
  }
  if (weight !== null && weight !== undefined && weight >= priorityTones.mediumMinWeight) {
    return priorityTones.medium;
  }
  return priorityTones.low;
}

/** "CLI-000123 · Razón social". */
export function customerLabel(customer: CustomerRef): string {
  return `${customer.crmCode} · ${customer.name}`;
}

/** "PRY-2026-00042 · Nombre". */
export function projectLabel(project: ProjectRef): string {
  return `${project.code} · ${project.name}`;
}
