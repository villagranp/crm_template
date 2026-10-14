import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { REPORT_ROUTES } from './reports-routes';

describe('REPORT_ROUTES (05 E.1, H.3)', () => {
  it('las siete rutas exigen reportes.ver', () => {
    expect(REPORT_ROUTES.map((route) => [route.path, route.permission])).toEqual(
      Object.values(ROUTE_PATHS.reports).map((path) => [path, 'reportes.ver']),
    );
  });

  it('las siete pantallas tienen su página propia, cargada en diferido (sin marcador provisional)', () => {
    const pages = REPORT_ROUTES.map((route) => route.Page);
    expect(new Set(pages).size).toBe(REPORT_ROUTES.length);
    for (const page of pages) {
      // `React.lazy` devuelve un objeto con `$$typeof` REACT_LAZY_TYPE: la página no está en el bundle inicial.
      expect((page as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.lazy'));
    }
  });
});
