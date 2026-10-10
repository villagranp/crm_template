import { findCycle, missingIds } from './access-rules';

describe('findCycle', () => {
  it('acepta un árbol válido', () => {
    expect(
      findCycle([
        { id: 'a', parentId: null },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'b' },
      ]),
    ).toBeNull();
  });

  it('detecta un nodo que es su propio padre', () => {
    expect(findCycle([{ id: 'a', parentId: 'a' }])).toBe('a');
  });

  it('detecta un ciclo indirecto', () => {
    expect(
      findCycle([
        { id: 'a', parentId: 'c' },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'b' },
      ]),
    ).not.toBeNull();
  });

  it('trata un padre ausente como raíz externa', () => {
    expect(findCycle([{ id: 'a', parentId: 'fuera' }])).toBeNull();
  });
});

describe('missingIds', () => {
  it('devuelve los pedidos que no existen, sin repetir', () => {
    expect(missingIds(['a', 'b', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });
});
