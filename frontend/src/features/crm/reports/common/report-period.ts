import { z } from 'zod';

import { formatCalendarDate } from '@/features/crm/commercial-activity/entry-points';

import { formatMonth, monthKey, parseMonthKey } from './report-format';
import type { ForecastMonthRef } from './report-types';

/**
 * Períodos de Reportes (05 C.2, RN-05.8, P-05.4): fechas de calendario `YYYY-MM-DD`
 * inclusivas que el backend interpreta en `crm.zona_horaria_negocio`; `from` y `to` van
 * juntos o ninguno. Los atajos (E.1) se calculan desde "hoy" en esa misma zona.
 */

export interface ReportPeriod {
  from: string;
  to: string;
}

export const PERIOD_PRESETS = ['CURRENT_MONTH', 'CURRENT_QUARTER', 'CURRENT_YEAR', 'LAST_12_MONTHS'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  CURRENT_MONTH: 'Mes en curso',
  CURRENT_QUARTER: 'Trimestre en curso',
  CURRENT_YEAR: 'Año en curso',
  LAST_12_MONTHS: 'Últimos 12 meses',
};

/** Rango máximo de un período de fechas (C.2: 5 años en los cinco reportes). */
export const MAX_PERIOD_YEARS = 5;
/** Rango máximo del forecast (C.2: 24 meses incluidos). */
export const MAX_FORECAST_MONTHS = 24;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_PER_YEAR = 12;
const MONTHS_PER_QUARTER = 3;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Fecha `YYYY-MM-DD` con aritmética de calendario (el día y el mes pueden desbordar). */
function dayKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** `true` si `value` es una fecha de calendario real `YYYY-MM-DD`. */
export function isCalendarDay(value: string | null | undefined): value is string {
  const match = value ? CALENDAR_DATE.exec(value) : null;
  if (!match) {
    return false;
  }
  return dayKey(Number(match[1]), Number(match[2]), Number(match[3])) === value;
}

function partsOf(today: string): { year: number; month: number } {
  const [year = 0, month = 1] = today.split('-').map(Number);
  return { year, month };
}

/** Último día del mes (`month` de 1 a 12; desborda hacia el año siguiente). */
function endOfMonth(year: number, month: number): string {
  return dayKey(year, month + 1, 0);
}

/** Rango de un atajo a partir de "hoy" (`YYYY-MM-DD` en la zona del negocio). */
export function presetPeriod(preset: PeriodPreset, today: string): ReportPeriod {
  const { year, month } = partsOf(today);
  switch (preset) {
    case 'CURRENT_MONTH':
      return { from: dayKey(year, month, 1), to: endOfMonth(year, month) };
    case 'CURRENT_QUARTER': {
      const first = Math.floor((month - 1) / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER + 1;
      return { from: dayKey(year, first, 1), to: endOfMonth(year, first + MONTHS_PER_QUARTER - 1) };
    }
    case 'CURRENT_YEAR':
      return { from: dayKey(year, 1, 1), to: dayKey(year, MONTHS_PER_YEAR, 31) };
    case 'LAST_12_MONTHS':
      // 11 meses cerrados + el mes en curso (12 meses de calendario).
      return { from: dayKey(year, month - (MONTHS_PER_YEAR - 1), 1), to: endOfMonth(year, month) };
  }
}

/** Atajo que coincide exactamente con un período, o `null` si es personalizado. */
export function matchingPreset(period: ReportPeriod, today: string): PeriodPreset | null {
  return (
    PERIOD_PRESETS.find((preset) => {
      const candidate = presetPeriod(preset, today);
      return candidate.from === period.from && candidate.to === period.to;
    }) ?? null
  );
}

/** "Mes en curso (1 oct 2026 – 31 oct 2026)" o "1 oct 2026 – 15 oct 2026". */
export function describePeriod(period: ReportPeriod, today: string): string {
  const range = `${formatCalendarDate(period.from)} – ${formatCalendarDate(period.to)}`;
  const preset = matchingPreset(period, today);
  return preset ? `${PERIOD_PRESET_LABELS[preset]} (${range})` : range;
}

/** `true` si `to` cae en o después del aniversario de `from` + `years` (P-05.4: se admite hasta el día anterior). */
export function exceedsYears(period: ReportPeriod, years: number): boolean {
  const [year = 0, month = 1, day = 1] = period.from.split('-').map(Number);
  return period.to >= dayKey(year + years, month, day);
}

/** Meses de calendario que toca un período (`2025-01-15 – 2026-12-31` → 24), como el backend del dashboard. */
export function calendarMonthsOf(period: ReportPeriod): number {
  const from = partsOf(period.from);
  const to = partsOf(period.to);
  return (to.year - from.year) * MONTHS_PER_YEAR + (to.month - from.month) + 1;
}

/** Número de meses (incluidos) entre dos meses. */
export function monthsBetween(from: ForecastMonthRef, to: ForecastMonthRef): number {
  return (to.year - from.year) * MONTHS_PER_YEAR + (to.month - from.month) + 1;
}

/** "nov 2026 – abr 2027". */
export function describeMonthRange(from: ForecastMonthRef, to: ForecastMonthRef): string {
  return `${formatMonth(from)} – ${formatMonth(to)}`;
}

/** Horizonte del forecast por defecto (C.2, `crm.forecast.horizonte_meses`). */
export const DEFAULT_FORECAST_HORIZON = 6;

/** Ventana por defecto del forecast (C.2: M+1…M+6 desde "hoy" en la zona del negocio). */
export function defaultForecastWindow(today: string, horizon = DEFAULT_FORECAST_HORIZON): { fromMonth: string; toMonth: string } {
  const { year, month } = partsOf(today);
  const at = (offset: number): ForecastMonthRef => {
    const index = year * MONTHS_PER_YEAR + (month - 1) + offset;
    return { year: Math.floor(index / MONTHS_PER_YEAR), month: (index % MONTHS_PER_YEAR) + 1 };
  };
  return { fromMonth: monthKey(at(1)), toMonth: monthKey(at(horizon)) };
}

// ---------------------------------------------------------------------------
// Esquemas (espejo de las reglas del backend, P-05.4): validar aquí es experiencia de
// usuario; el backend responde 400 / 422 PERIOD_TOO_LONG igualmente.
// ---------------------------------------------------------------------------

export const PERIOD_MESSAGES = {
  bothRequired: 'Indica la fecha inicial y la final, o ninguna.',
  invalidDate: 'Escribe una fecha válida.',
  fromAfterTo: 'La fecha inicial no puede ser posterior a la final.',
  tooLong: (years: number) => `El período no puede superar ${years} años.`,
  tooManyMonths: (months: number) => `El período no puede abarcar más de ${months} meses.`,
  dateBasisRequired: 'Elige la fecha por la que se filtra el período.',
  monthsBothRequired: 'Indica el mes inicial y el final, o ninguno.',
  invalidMonth: 'Escribe un mes válido.',
  monthsReversed: 'El mes inicial no puede ser posterior al final.',
  monthsTooLong: (months: number) => `El rango no puede superar ${months} meses.`,
} as const;

/** Borrador de período de fechas del formulario de filtros (`''` = vacío). */
export interface PeriodDraft {
  from: string;
  to: string;
  dateBasis: string;
}

export interface PeriodDraftSchemaOptions {
  maxYears?: number;
  /**
   * Máximo en **meses de calendario** (dashboard: 24, P-05.14). Si se indica, sustituye a
   * `maxYears` (el backend cuenta meses tocados, no aniversarios).
   */
  maxMonths?: number;
  /** Proyectos no tiene base por defecto: con período, la base es obligatoria (P-05.4). */
  dateBasisRequired?: boolean;
}

/** Esquema del período de fechas: juntos o ninguno, fechas reales, `from ≤ to`, máximo de años y base si se exige. */
export function periodDraftSchema({ maxYears = MAX_PERIOD_YEARS, maxMonths, dateBasisRequired = false }: PeriodDraftSchemaOptions = {}) {
  return z.object({ from: z.string(), to: z.string(), dateBasis: z.string() }).superRefine((draft, context) => {
    const { from, to } = draft;
    if (!from && !to) {
      return;
    }
    if (!from || !to) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [from ? 'to' : 'from'], message: PERIOD_MESSAGES.bothRequired });
      return;
    }
    if (!isCalendarDay(from) || !isCalendarDay(to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [isCalendarDay(from) ? 'to' : 'from'], message: PERIOD_MESSAGES.invalidDate });
      return;
    }
    if (from > to) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: PERIOD_MESSAGES.fromAfterTo });
    } else if (maxMonths !== undefined) {
      if (calendarMonthsOf({ from, to }) > maxMonths) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: PERIOD_MESSAGES.tooManyMonths(maxMonths) });
      }
    } else if (exceedsYears({ from, to }, maxYears)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: PERIOD_MESSAGES.tooLong(maxYears) });
    }
    if (dateBasisRequired && !draft.dateBasis) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['dateBasis'], message: PERIOD_MESSAGES.dateBasisRequired });
    }
  });
}

/** Borrador de rango de meses del forecast (`YYYY-MM`, `''` = vacío). */
export interface MonthRangeDraft {
  fromMonth: string;
  toMonth: string;
}

/** Esquema del rango de meses del forecast: juntos o ninguno, `fromMonth ≤ toMonth`, máximo 24 meses incluidos. */
export function monthRangeDraftSchema({ maxMonths = MAX_FORECAST_MONTHS }: { maxMonths?: number } = {}) {
  return z.object({ fromMonth: z.string(), toMonth: z.string() }).superRefine(({ fromMonth, toMonth }, context) => {
    if (!fromMonth && !toMonth) {
      return;
    }
    if (!fromMonth || !toMonth) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [fromMonth ? 'toMonth' : 'fromMonth'], message: PERIOD_MESSAGES.monthsBothRequired });
      return;
    }
    const from = parseMonthKey(fromMonth);
    const to = parseMonthKey(toMonth);
    if (!from || !to) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [from ? 'toMonth' : 'fromMonth'], message: PERIOD_MESSAGES.invalidMonth });
      return;
    }
    if (fromMonth > toMonth) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['toMonth'], message: PERIOD_MESSAGES.monthsReversed });
    } else if (monthsBetween(from, to) > maxMonths) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['toMonth'], message: PERIOD_MESSAGES.monthsTooLong(maxMonths) });
    }
  });
}

/** Primer mensaje por campo de un `ZodError` (para pintarlo bajo su campo). */
export function issuesByField(error: z.ZodError | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error?.issues ?? []) {
    const field = String(issue.path[0] ?? '');
    if (field && !result[field]) {
      result[field] = issue.message;
    }
  }
  return result;
}
