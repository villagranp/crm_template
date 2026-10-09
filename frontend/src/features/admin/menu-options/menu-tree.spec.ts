import { describe, expect, it } from 'vitest';

import type { MenuOption } from './menu-options.api';
import { buildMenuTree, moveAmongSiblings, withDescendants } from './menu-tree';

const MODULE = { id: 'm-1', key: 'administracion', name: 'Administración' };

function option(id: string, overrides: Partial<MenuOption> = {}): MenuOption {
  return {
    id,
    key: id,
    parentId: null,
    label: id.toUpperCase(),
    description: null,
    icon: null,
    kind: 'LINK',
    path: '/',
    sortOrder: 0,
    requiredPermissionId: null,
    requiredPermissionCode: null,
    isPublic: false,
    isSystem: false,
    isActive: true,
    module: MODULE,
    ...overrides,
  };
}

describe('buildMenuTree', () => {
  it('anida por padre y ordena por posición', () => {
    const tree = buildMenuTree([
      option('b', { sortOrder: 20 }),
      option('g', { kind: 'GROUP', path: null, sortOrder: 10 }),
      option('c', { parentId: 'g', sortOrder: 5 }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.nodes.map((node) => node.option.id)).toEqual(['g', 'b']);
    expect(tree[0]?.nodes[0]?.children.map((node) => [node.option.id, node.depth])).toEqual([['c', 1]]);
  });

  it('una opción con padre desconocido sale en la raíz', () => {
    const tree = buildMenuTree([option('a', { parentId: 'borrada' })]);
    expect(tree[0]?.nodes.map((node) => node.option.id)).toEqual(['a']);
  });
});

describe('withDescendants', () => {
  it('incluye la opción y toda su descendencia', () => {
    const options = [option('a'), option('b', { parentId: 'a' }), option('c', { parentId: 'b' }), option('d')];
    expect([...withDescendants(options, 'a')].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('moveAmongSiblings', () => {
  const siblings = [option('a', { sortOrder: 10 }), option('b', { sortOrder: 20 }), option('c', { sortOrder: 30 })];

  it('intercambia con la anterior y devuelve sólo los cambios', () => {
    expect(moveAmongSiblings(siblings, 'b', 'up')).toEqual([
      { id: 'b', parentId: null, sortOrder: 10 },
      { id: 'a', parentId: null, sortOrder: 20 },
    ]);
  });

  it('no hace nada en el extremo', () => {
    expect(moveAmongSiblings(siblings, 'c', 'down')).toEqual([]);
    expect(moveAmongSiblings(siblings, 'a', 'up')).toEqual([]);
  });

  it('renumera órdenes repetidos', () => {
    const messy = [option('a', { sortOrder: 0 }), option('b', { sortOrder: 0 })];
    expect(moveAmongSiblings(messy, 'b', 'up')).toEqual([
      { id: 'b', parentId: null, sortOrder: 10 },
      { id: 'a', parentId: null, sortOrder: 20 },
    ]);
  });
});
