import { formatMonth } from '../common/report-format';
import type { ForecastMonthRef } from '../common/report-types';

import type { TrendMetric } from './dashboard.api';

/** Etiquetas de los indicadores con tendencia (RN-05.52), en el orden del contrato. */
export const TREND_METRIC_LABELS: Record<TrendMetric, string> = {
  OPPORTUNITIES_IDENTIFIED: 'Oportunidades identificadas',
  WON: 'Oportunidades ganadas',
  LOST: 'Oportunidades perdidas',
  ACTIVITIES_COMPLETED: 'Actividades realizadas',
  VISITS_COMPLETED: 'Visitas realizadas',
};

/** Base de fecha de cada tendencia (RN-05.52), para la descripción del panel. */
export const TREND_METRIC_BASIS: Record<TrendMetric, string> = {
  OPPORTUNITIES_IDENTIFIED: 'por fecha de identificación',
  WON: 'por fecha de decisión; incluye parciales',
  LOST: 'por fecha de decisión',
  ACTIVITIES_COMPLETED: 'por fecha de realización',
  VISITS_COMPLETED: 'realizadas y confirmadas, por fecha real',
};

/** Etiqueta del asesor de una fila del dashboard (`null` = "Otros", fuera del top 10). */
export const OTHER_OWNERS_LABEL = 'Otros';

/**
 * Valor numérico de un decimal de la API **sólo para la geometría** de una gráfica; las cifras
 * que se leen (tabla, *tooltip*) se formatean siempre desde la cadena original.
 */
export function chartNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function monthLabels(months: readonly ForecastMonthRef[]): string[] {
  return months.map((month) => formatMonth(month));
}
