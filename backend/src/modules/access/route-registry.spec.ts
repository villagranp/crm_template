import { isRegisteredRoute, listRegisteredRoutes } from './route-registry';

describe('route-registry', () => {
  it('incluye las rutas de administración sembradas', () => {
    expect(isRegisteredRoute('/administracion/usuarios')).toBe(true);
    expect(listRegisteredRoutes().length).toBeGreaterThanOrEqual(9);
  });

  it('rechaza rutas sin pantalla', () => {
    expect(isRegisteredRoute('/no-existe')).toBe(false);
    expect(isRegisteredRoute('/administracion/usuarios/')).toBe(false);
  });

  it('no tiene rutas duplicadas', () => {
    const paths = listRegisteredRoutes().map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
