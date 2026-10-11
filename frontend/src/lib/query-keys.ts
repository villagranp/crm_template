/**
 * Convención de claves de TanStack Query para cualquier área del frontend.
 *
 * Todas las claves de un área empiezan por `[<ámbito>, <área>]` (p. ej.
 * `['admin', 'roles']` o `['crm', 'customers']`), así que una mutación invalida
 * lo suyo con `invalidateQueries({ queryKey: keys.all })` (o `keys.lists()` si
 * el detalle sigue siendo válido) sin conocer las claves de otras áreas.
 */

/** Parámetros de una consulta de lista, listos para `httpClient.get(path, { query })`. */
export type ListQuery = Record<string, string | number | undefined>;

/**
 * Fábrica de claves de consulta de un área dentro de un ámbito.
 *
 * @example
 * export const customerKeys = createScopedQueryKeys('crm', 'customers');
 * useQuery({ queryKey: customerKeys.list(apiQuery), queryFn: () => listCustomers(apiQuery) });
 */
export function createScopedQueryKeys<TScope extends string, TArea extends string>(scope: TScope, area: TArea) {
  const all = [scope, area] as const;
  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: (query: ListQuery) => [...all, 'list', query] as const,
    details: () => [...all, 'detail'] as const,
    detail: (id: string) => [...all, 'detail', id] as const,
  };
}
