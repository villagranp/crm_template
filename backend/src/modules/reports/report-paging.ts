import type { ReportPageRequest, SortOrder } from './ports/reporting.repository.port';

/** Paginación y orden pedidos (ya validados por el DTO contra la lista blanca). */
export interface ReportPageQuery<TSort extends string> {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: TSort;
  readonly sortOrder?: SortOrder;
}

/**
 * Orden efectivo (RN-05.14, E.2–E.6): sin `sortBy`, el campo y el sentido por defecto del
 * reporte (o el `sortOrder` pedido); con `sortBy`, el `sortOrder` pedido o ascendente.
 * El desempate por `id` lo añade el adaptador.
 */
export function reportPage<TSort extends string>(
  query: ReportPageQuery<TSort>,
  defaults: { readonly sortBy: TSort; readonly sortOrder: SortOrder },
): ReportPageRequest<TSort> {
  return {
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy ?? defaults.sortBy,
    sortOrder: query.sortOrder ?? (query.sortBy ? 'asc' : defaults.sortOrder),
  };
}
