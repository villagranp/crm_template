import type { CalendarDate } from '@/common/calendar-date';

export type { CalendarDate } from '@/common/calendar-date';

/** Orden de dos fechas de calendario `YYYY-MM-DD` (comparación léxica exacta). */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `YYYY-MM` de un período del forecast. */
export function formatYearMonth(period: { readonly year: number; readonly month: number }): string {
  return `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}`;
}
