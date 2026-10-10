import { describe, expect, it } from 'vitest';

import type { MenuModule, MenuOptionNode } from '@/services/access';

import {
  activeModuleKey,
  firstNavigablePath,
  isActivePath,
  navigableOptions,
  splitMenuSections,
} from './menu-navigation';

function option(key: string, path: string | null, children: MenuOptionNode[] = []): MenuOptionNode {
  return {
    id: key,
    key,
    label: key,
    icon: null,
    path,
    order: 0,
    requiredPermission: null,
    children,
  };
}

function module(key: string, options: MenuOptionNode[], isSystem = false): MenuModule {
  return { key, label: key, icon: null, order: 0, isSystem, options };
}

const menu: MenuModule[] = [
  module('inicio', [option('panel', '/')]),
  module('ventas', [
    option('grupo', null, [option('pipeline', '/ventas/pipeline')]),
    option('cotizaciones', '/ventas/cotizaciones'),
  ]),
  module('vacio', []),
  module('administracion', [option('usuarios', '/administracion/usuarios')], true),
];

describe('isActivePath', () => {
  it('la raíz sólo coincide consigo misma', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/administracion/usuarios', '/')).toBe(false);
  });

  it('una ruta coincide con sus subrutas pero no con prefijos parciales', () => {
    expect(isActivePath('/administracion/usuarios/42', '/administracion/usuarios')).toBe(true);
    expect(isActivePath('/administracion/usuarios-baja', '/administracion/usuarios')).toBe(false);
    expect(isActivePath('/x', null)).toBe(false);
  });
});

describe('splitMenuSections', () => {
  it('separa inicio, módulos de negocio y módulos de sistema, y omite los vacíos', () => {
    const sections = splitMenuSections(menu);

    expect(sections.principal.map((item) => item.key)).toEqual(['panel']);
    expect(sections.modules.map((item) => item.key)).toEqual(['ventas']);
    expect(sections.system.map((item) => item.key)).toEqual(['administracion']);
  });
});

describe('firstNavigablePath / navigableOptions', () => {
  it('encuentra la primera ruta aunque esté anidada en un grupo', () => {
    expect(firstNavigablePath(menu[1]?.options ?? [])).toBe('/ventas/pipeline');
    expect(firstNavigablePath([])).toBeNull();
  });

  it('aplana las opciones navegables en orden de menú', () => {
    expect(navigableOptions(menu).map((item) => item.path)).toEqual([
      '/',
      '/ventas/pipeline',
      '/ventas/cotizaciones',
      '/administracion/usuarios',
    ]);
  });
});

describe('activeModuleKey', () => {
  it('devuelve el módulo que contiene la ruta actual', () => {
    expect(activeModuleKey(menu, '/ventas/pipeline')).toBe('ventas');
    expect(activeModuleKey(menu, '/')).toBe('inicio');
    expect(activeModuleKey(menu, '/no-existe')).toBeNull();
  });
});
