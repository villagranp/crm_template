import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { REPORT_ROUTES } from './reports-routes';

describe('REPORT_ROUTES (05 E.1, H.3)', () => {
  it('las siete rutas exigen reportes.ver', () => {
    expect(REPORT_ROUTES.map((route) => [route.path, route.permission])).toEqual(
      Object.values(ROUTE_PATHS.reports).map((path) => [path, 'reportes.ver']),
    );
  });

  it('los cinco reportes ya no usan el marcador provisional; dashboard y embudo sí (otra tanda)', () => {
    const pageOf = (path: string) => REPORT_ROUTES.find((route) => route.path === path)?.Page;
    const provisional = pageOf(ROUTE_PATHS.reports.dashboard);

    expect(pageOf(ROUTE_PATHS.reports.funnel)).toBe(provisional);
    const delivered = [ROUTE_PATHS.reports.projects, ROUTE_PATHS.reports.opportunities, ROUTE_PATHS.reports.forecast, ROUTE_PATHS.reports.visits, ROUTE_PATHS.reports.activities];
    const pages = delivered.map(pageOf);
    for (const page of pages) {
      expect(page).toBeDefined();
      expect(page).not.toBe(provisional);
    }
    expect(new Set(pages).size).toBe(delivered.length);
  });
});
