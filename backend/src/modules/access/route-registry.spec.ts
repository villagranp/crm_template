import { hasRouteParameter, isRegisteredRoute, listMenuTargetRoutes, listRegisteredRoutes } from './route-registry';

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

  it('detecta las rutas con parámetro y las excluye de los destinos de menú (D-02.12)', () => {
    expect(hasRouteParameter('/clientes/:customerId')).toBe(true);
    expect(hasRouteParameter('/clientes')).toBe(false);
    expect(listMenuTargetRoutes().every((route) => !route.path.includes(':'))).toBe(true);
    expect(listMenuTargetRoutes().length).toBe(listRegisteredRoutes().filter((route) => !route.path.includes(':')).length);
  });
});
