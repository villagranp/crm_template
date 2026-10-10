import type { CatalogItem } from './catalogs.api';

export interface SortOrderChange {
  itemId: string;
  sortOrder: number;
}

/** Separación al renumerar; coincide con la del backend para elementos nuevos. */
export const SORT_ORDER_STEP = 10;

/**
 * Cambios de `sortOrder` para subir (`-1`) o bajar (`+1`) el elemento en
 * `index` dentro de `items` (ya ordenados como los muestra la pantalla).
 *
 * Si los dos vecinos tienen órdenes distintos, basta con intercambiarlos (dos
 * PATCH). Si empatan, un intercambio no movería nada: se renumera toda la
 * lista con el movimiento aplicado y se envían sólo los que cambian.
 */
export function planMove(items: readonly CatalogItem[], index: number, direction: -1 | 1): SortOrderChange[] {
  const target = index + direction;
  const moved = items[index];
  const neighbor = items[target];
  if (!moved || !neighbor) {
    return [];
  }

  if (moved.sortOrder !== neighbor.sortOrder) {
    return [
      { itemId: moved.id, sortOrder: neighbor.sortOrder },
      { itemId: neighbor.id, sortOrder: moved.sortOrder },
    ];
  }

  const reordered = [...items];
  reordered[index] = neighbor;
  reordered[target] = moved;
  return reordered
    .map((item, position) => ({ itemId: item.id, sortOrder: (position + 1) * SORT_ORDER_STEP, previous: item.sortOrder }))
    .filter((change) => change.sortOrder !== change.previous)
    .map(({ itemId, sortOrder }) => ({ itemId, sortOrder }));
}
