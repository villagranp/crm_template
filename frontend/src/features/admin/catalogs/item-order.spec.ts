import { describe, expect, it } from 'vitest';

import type { CatalogItem } from './catalogs.api';
import { parseMetadata } from './catalogs.schemas';
import { planMove } from './item-order';

function item(id: string, sortOrder: number): CatalogItem {
  return {
    id,
    catalogId: 'cat-1',
    code: id,
    label: id,
    metadata: null,
    sortOrder,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('planMove', () => {
  it('intercambia el orden con el vecino cuando son distintos', () => {
    const items = [item('a', 10), item('b', 20), item('c', 30)];
    expect(planMove(items, 1, -1)).toEqual([
      { itemId: 'b', sortOrder: 10 },
      { itemId: 'a', sortOrder: 20 },
    ]);
  });

  it('renumera cuando los vecinos empatan, enviando sólo los que cambian', () => {
    const items = [item('a', 0), item('b', 0), item('c', 30)];
    expect(planMove(items, 0, 1)).toEqual([
      { itemId: 'b', sortOrder: 10 },
      { itemId: 'a', sortOrder: 20 },
    ]);
  });

  it('no hace nada en los extremos', () => {
    const items = [item('a', 10), item('b', 20)];
    expect(planMove(items, 0, -1)).toEqual([]);
    expect(planMove(items, 1, 1)).toEqual([]);
  });
});

describe('parseMetadata', () => {
  it('vacío es null y un objeto se acepta', () => {
    expect(parseMetadata('  ')).toBeNull();
    expect(parseMetadata('{"color":"azul"}')).toEqual({ color: 'azul' });
  });

  it.each(['[1,2]', '"texto"', '{no es json', `{"x":"${'y'.repeat(5000)}"}`])('rechaza %s', (text) => {
    expect(parseMetadata(text)).toBeUndefined();
  });
});
