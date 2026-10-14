import { lazy } from 'react';

import { ROUTE_PATHS } from '@/routes/route-paths';

import type { CrmRoute } from '../crm-routes';

/** Permisos del módulo Reportes (05 H.1). */
export const REPORT_PERMISSIONS = {
  view: 'reportes.ver',
  export: 'reportes.exportar',
} as const;

const ReportsPendingPage = lazy(() => import('./ReportsPendingPage').then((module) => ({ default: module.ReportsPendingPage })));

/**
 * Rutas de Reportes (05 E.1, H.3): las siete opciones sembradas del módulo `reportes`,
 * todas con `reportes.ver` y registradas en `app-routes.registry.json` (DM-32).
 *
 * **Provisional:** todas apuntan a `ReportsPendingPage` (marcador "En construcción") hasta
 * que la etapa de frontend del Módulo 5 entregue las pantallas reales (E.2–E.8), que
 * sustituirán cada `Page` aquí sin cambiar ruta ni permiso.
 */
export const REPORT_ROUTES: readonly CrmRoute[] = [
  { path: ROUTE_PATHS.reports.projects, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
  { path: ROUTE_PATHS.reports.opportunities, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
  { path: ROUTE_PATHS.reports.forecast, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
  { path: ROUTE_PATHS.reports.visits, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
  { path: ROUTE_PATHS.reports.activities, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
  { path: ROUTE_PATHS.reports.dashboard, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
  { path: ROUTE_PATHS.reports.funnel, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
];
