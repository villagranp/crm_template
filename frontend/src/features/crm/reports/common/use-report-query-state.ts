import { useCallback, useMemo } from 'react';

import { useTableQueryState, type TableSort, type UseTableQueryStateResult } from '@/components/data';
import { todayInTimeZone, useCommercialTimeZones } from '@/features/crm/commercial-activity/entry-points';
import type { ListQuery } from '@/lib/query-keys';

import { presetPeriod, type PeriodPreset, type ReportPeriod } from './report-period';

/**
 * Estado de una pantalla de Reportes en la URL (05 E.1): filtros, período, base de fecha,
 * búsqueda, orden y página, con **los nombres de parámetro de la API** (se puede compartir y
 * recargar una vista). Envuelve `useTableQueryState` (`@/components/data`) y añade el período:
 *
 * - `dates`: `from`/`to` (`YYYY-MM-DD`) y `dateBasis`. Con `defaultPreset` (p. ej. "Mes en curso"
 *   en visitas y actividades, C.2) la URL sin período usa ese atajo calculado con "hoy" en
 *   `crm.zona_horaria_negocio`, y **se envía a la API** (sin período la API no filtra por fecha,
 *   P-05.4). Sin `defaultPreset` (proyectos, oportunidades), sin período no se filtra.
 * - `months`: `fromMonth`/`toMonth` (`YYYY-MM`); sin ellos la API aplica M+1…M+6 (forecast).
 *
 * Los filtros son de un solo valor en la URL (la API admite repetidos; P-05.19).
 *
 * Las opciones con arrays (`filterKeys`, `sortableFields`, `defaultSort`, `period`) deben ser
 * constantes de módulo, como en `useTableQueryState`.
 */

export const DATE_PERIOD_KEYS = ['from', 'to', 'dateBasis'] as const;
export const MONTH_PERIOD_KEYS = ['fromMonth', 'toMonth'] as const;

export type DatePeriodKey = (typeof DATE_PERIOD_KEYS)[number];
export type MonthPeriodKey = (typeof MONTH_PERIOD_KEYS)[number];

export type ReportPeriodMode =
  | {
      kind: 'dates';
      /** Atajo que se aplica cuando la URL no trae período; `null` = sin período por defecto. */
      defaultPreset: PeriodPreset | null;
      /** Base de fecha por defecto del reporte (C.2); `null` si no tiene (proyectos). */
      defaultDateBasis: string | null;
    }
  | { kind: 'months' };

export interface UseReportQueryStateOptions<TFilter extends string> {
  /** Filtros propios (sin el período ni la búsqueda). */
  filterKeys: readonly TFilter[];
  sortableFields: readonly string[];
  defaultSort: TableSort;
  period: ReportPeriodMode | null;
  /** Prefijo de los parámetros si la pantalla tiene varias tablas en la URL. */
  paramPrefix?: string;
}

export type ReportFilterValues = Readonly<Record<string, string | undefined>>;

export interface ReportQueryState<TFilter extends string> {
  table: UseTableQueryStateResult<TFilter | DatePeriodKey | MonthPeriodKey>;
  /** Filtros aplicados tal como están en la URL (incluido el período si se eligió). */
  values: ReportFilterValues;
  /** Período de fechas efectivo (el de la URL o el de por defecto); `null` = sin período. */
  period: ReportPeriod | null;
  /** `true` si el período efectivo es el de por defecto (la URL no trae uno). */
  isDefaultPeriod: boolean;
  /** Base de fecha efectiva (la de la URL o la de por defecto del reporte). */
  dateBasis: string | null;
  /** "Hoy" (`YYYY-MM-DD`) en la zona del negocio: base de los atajos de período. */
  today: string;
  /** Filtros para la API sin paginación ni orden (resúmenes). */
  filterQuery: ListQuery;
  /** Filtros + página + orden (listas). */
  listQuery: ListQuery;
  /** Filtros + orden de la pantalla + `format=xlsx`, sin paginación (F-39, RN-05.44). */
  exportQuery: ListQuery;
  /** Fija todos los filtros a la vez (una navegación) y vuelve a la página 1. */
  apply: (values: ReportFilterValues) => void;
  /** Quita búsqueda, filtros y período (vuelve al período por defecto). */
  clear: () => void;
  /** Filtro o búsqueda aplicados por el usuario (el período por defecto no cuenta). */
  hasUserFilters: boolean;
}

const PAGING_KEYS = ['page', 'pageSize', 'sortBy', 'sortOrder'] as const;

export function useReportQueryState<TFilter extends string>({
  filterKeys,
  sortableFields,
  defaultSort,
  period: periodMode,
  paramPrefix,
}: UseReportQueryStateOptions<TFilter>): ReportQueryState<TFilter> {
  const allKeys = useMemo<readonly (TFilter | DatePeriodKey | MonthPeriodKey)[]>(() => {
    if (periodMode?.kind === 'dates') {
      return [...filterKeys, ...DATE_PERIOD_KEYS];
    }
    if (periodMode?.kind === 'months') {
      return [...filterKeys, ...MONTH_PERIOD_KEYS];
    }
    return filterKeys;
  }, [filterKeys, periodMode]);

  const table = useTableQueryState<TFilter | DatePeriodKey | MonthPeriodKey>({
    filterKeys: allKeys,
    sortableFields,
    defaultSort,
    paramPrefix,
  });
  const { businessTimeZone } = useCommercialTimeZones();
  const today = todayInTimeZone(businessTimeZone);
  const values = table.state.filters as ReportFilterValues;

  const urlPeriod = values.from && values.to ? { from: values.from, to: values.to } : null;
  const defaultPreset = periodMode?.kind === 'dates' ? periodMode.defaultPreset : null;
  const defaultPeriod = useMemo(() => (defaultPreset ? presetPeriod(defaultPreset, today) : null), [defaultPreset, today]);
  const period = periodMode?.kind === 'dates' ? (urlPeriod ?? defaultPeriod) : null;
  const isDefaultPeriod = periodMode?.kind === 'dates' && !urlPeriod && defaultPeriod !== null;
  const dateBasis = periodMode?.kind === 'dates' ? (values.dateBasis ?? periodMode.defaultDateBasis) : null;

  const { apiQuery } = table;
  const periodFrom = period?.from;
  const periodTo = period?.to;
  const filterQuery = useMemo<ListQuery>(() => {
    const query: ListQuery = { ...apiQuery };
    for (const key of PAGING_KEYS) {
      delete query[key];
    }
    if (periodFrom && periodTo) {
      query.from = periodFrom;
      query.to = periodTo;
    }
    return query;
  }, [apiQuery, periodFrom, periodTo]);

  const listQuery = useMemo<ListQuery>(
    () => ({ ...filterQuery, page: apiQuery.page, pageSize: apiQuery.pageSize, sortBy: apiQuery.sortBy, sortOrder: apiQuery.sortOrder }),
    [filterQuery, apiQuery],
  );

  const exportQuery = useMemo<ListQuery>(
    () => ({ ...filterQuery, sortBy: apiQuery.sortBy, sortOrder: apiQuery.sortOrder, format: 'xlsx' }),
    [filterQuery, apiQuery],
  );

  const { setFilters, clearFilters: clear } = table;
  const apply = useCallback(
    (next: ReportFilterValues) =>
      setFilters(Object.fromEntries(allKeys.map((key) => [key, next[key]])) as Partial<Record<TFilter | DatePeriodKey | MonthPeriodKey, string | undefined>>),
    [setFilters, allKeys],
  );

  const hasUserFilters = Boolean(table.state.search) || Object.values(values).some(Boolean);

  return { table, values, period, isDefaultPeriod, dateBasis, today, filterQuery, listQuery, exportQuery, apply, clear, hasUserFilters };
}
