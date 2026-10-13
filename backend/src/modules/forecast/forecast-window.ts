import {
  addMonths,
  businessMonth,
  compareYearMonth,
  forecastWindowMonths,
  type YearMonth,
} from '@/modules/commercial-metrics/metric-definitions';

import {
  FORECAST_ERROR_CODES,
  forecastFieldValidationError,
  type ForecastIssue,
  forecastIssue,
  forecastIssuesError,
} from './forecast-errors';

/**
 * Ventana móvil del forecast (03 RN-03.66, RN-03.67, D-03.5) sobre DEF-G
 * (`forecastWindowMonths`, la misma que usa Inicio). Pura: recibe el instante y los
 * parámetros (`crm.zona_horaria_negocio`, `crm.forecast.horizonte_meses`).
 *
 * - M = mes en curso **en la zona del negocio** (no en UTC).
 * - Editables: M+1 … M+N. M y los pasados son de solo lectura; posteriores a M+N, tampoco.
 * - La tabla guarda períodos absolutos: la ventana es solo un filtro (la historia se conserva).
 */

export const FORECAST_MODES = ['WINDOW', 'HISTORY'] as const;
export type ForecastMode = (typeof FORECAST_MODES)[number];

/** Rango máximo del modo historial (03 F.3), en meses inclusive. */
export const HISTORY_MAX_MONTHS = 24;

/** `YYYY-MM` con mes 01–12. */
export const PERIOD_LABEL_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface ForecastWindowSettings {
  readonly timeZone: string;
  readonly horizonMonths: number;
}

/** Período con su desplazamiento respecto de M (M+1 → 1; M → 0; pasados, negativos). */
export interface ForecastPeriod extends YearMonth {
  readonly offset: number;
  readonly label: string;
}

export interface ForecastWindow {
  readonly timeZone: string;
  readonly horizonMonths: number;
  readonly current: YearMonth;
  /** M+1 … M+N, en orden. */
  readonly periods: readonly ForecastPeriod[];
}

export function periodLabel(period: YearMonth): string {
  return `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}`;
}

export function parsePeriodLabel(label: string): YearMonth | null {
  const match = PERIOD_LABEL_PATTERN.exec(label);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function computeForecastWindow(now: Date, settings: ForecastWindowSettings): ForecastWindow {
  const clock = { now, businessTimeZone: settings.timeZone };
  const current = businessMonth(clock);
  const months = forecastWindowMonths(clock, settings.horizonMonths);
  return {
    timeZone: settings.timeZone,
    horizonMonths: settings.horizonMonths,
    current,
    periods: months.map((period) => toForecastPeriod(current, period)),
  };
}

export function toForecastPeriod(current: YearMonth, period: YearMonth): ForecastPeriod {
  return { year: period.year, month: period.month, offset: compareYearMonth(period, current), label: periodLabel(period) };
}

/** ¿Editable? Solo M+1 … M+N (RN-03.66, D-03.5). */
export function isEditablePeriod(window: ForecastWindow, period: YearMonth): boolean {
  const offset = compareYearMonth(period, window.current);
  return offset >= 1 && offset <= window.horizonMonths;
}

export interface PeriodQuery {
  readonly mode: ForecastMode;
  /** `YYYY-MM` ya validados por el DTO. */
  readonly periods?: readonly string[];
  readonly from?: string;
  readonly to?: string;
}

/** Períodos consultados, ordenados y sin repetir, con su desplazamiento respecto de M. */
export interface PeriodSelection {
  readonly mode: ForecastMode;
  readonly periods: readonly ForecastPeriod[];
}

function sortedUnique(periods: readonly YearMonth[]): YearMonth[] {
  const byKey = new Map(periods.map((period) => [period.year * 12 + period.month, period]));
  return [...byKey.entries()].sort(([a], [b]) => a - b).map(([, period]) => period);
}

function mustParse(label: string, field: string): YearMonth {
  const period = parsePeriodLabel(label);
  if (!period) throw forecastFieldValidationError(field, `${field} must be a period (YYYY-MM)`);
  return period;
}

/**
 * Períodos de una consulta (03 F.3 `ForecastQueryDto`):
 *
 * - `WINDOW` (defecto): la ventana completa, o los `periods` indicados, que deben ser de
 *   la ventana (`422 FORECAST_PERIOD_OUT_OF_WINDOW`, una incidencia por período, con
 *   `field: 'periods[i]'` y `period`). `from`/`to` no se admiten (`400`).
 * - `HISTORY`: rango `from`–`to` inclusive (por defecto, los N meses que terminan en M),
 *   máximo 24 meses y `from ≤ to` (`422 INVALID_DATE_RANGE`). `periods` no se admite (`400`).
 */
export function selectPeriods(window: ForecastWindow, query: PeriodQuery): PeriodSelection {
  if (query.mode === 'WINDOW') {
    if (query.from !== undefined) throw forecastFieldValidationError('from', 'from is only allowed with mode=HISTORY');
    if (query.to !== undefined) throw forecastFieldValidationError('to', 'to is only allowed with mode=HISTORY');
    if (!query.periods || query.periods.length === 0) return { mode: 'WINDOW', periods: window.periods };
    const issues: ForecastIssue[] = [];
    const selected: YearMonth[] = [];
    query.periods.forEach((label, index) => {
      const period = mustParse(label, `periods[${index}]`);
      if (!isEditablePeriod(window, period)) {
        issues.push(forecastIssue(`periods[${index}]`, FORECAST_ERROR_CODES.periodOutOfWindow, { period: periodLabel(period) }));
      } else {
        selected.push(period);
      }
    });
    if (issues.length > 0) throw forecastIssuesError(issues);
    return { mode: 'WINDOW', periods: sortedUnique(selected).map((period) => toForecastPeriod(window.current, period)) };
  }

  if (query.periods !== undefined && query.periods.length > 0) {
    throw forecastFieldValidationError('periods', 'periods is only allowed with mode=WINDOW');
  }
  const to = query.to !== undefined ? mustParse(query.to, 'to') : window.current;
  const from = query.from !== undefined ? mustParse(query.from, 'from') : addMonths(to, -(window.horizonMonths - 1));
  const span = compareYearMonth(to, from) + 1;
  if (span < 1) {
    throw forecastIssuesError([forecastIssue('to', FORECAST_ERROR_CODES.invalidDateRange, { startField: 'from' })]);
  }
  if (span > HISTORY_MAX_MONTHS) {
    throw forecastIssuesError([
      {
        ...forecastIssue('to', FORECAST_ERROR_CODES.invalidDateRange, { startField: 'from', maxMonths: HISTORY_MAX_MONTHS }),
        message: `The range cannot exceed ${HISTORY_MAX_MONTHS} months`,
      },
    ]);
  }
  return {
    mode: 'HISTORY',
    periods: Array.from({ length: span }, (_, index) => toForecastPeriod(window.current, addMonths(from, index))),
  };
}
