import { lazy } from 'react';

import { ROUTE_PATHS } from '@/routes/route-paths';

import type { CrmRoute } from '../crm-routes';

import { REPORT_PERMISSIONS } from './reports.permissions';

export { REPORT_PERMISSIONS } from './reports.permissions';

const ReportsPendingPage = lazy(() => import('./ReportsPendingPage').then((module) => ({ default: module.ReportsPendingPage })));

/**
 * Rutas de Reportes (05 E.1, H.3): las siete opciones sembradas del módulo `reportes`,
 * todas con `reportes.ver` y registradas en `app-routes.registry.json` (DM-32). Cada página se
 * carga con `React.lazy` (la lógica de reportes no pesa en la carga inicial).
 *
 * Entregadas: proyectos (F-34), oportunidades (F-35), forecast (F-36), visitas (F-37) y
 * actividades (F-38), con su exportación (F-39). **Provisional:** el dashboard (F-40) y el
 * embudo (F-41) siguen en `ReportsPendingPage` ("En construcción") hasta su tanda, que
 * sustituirá su `Page` aquí sin cambiar ruta ni permiso.
 */
export const REPORT_ROUTES: readonly CrmRoute[] = [
  {
    path: ROUTE_PATHS.reports.projects,
    permission: REPORT_PERMISSIONS.view,
    Page: lazy(() => import('./projects/ProjectsReportPage').then((module) => ({ default: module.ProjectsReportPage }))),
  },
  {
    path: ROUTE_PATHS.reports.opportunities,
    permission: REPORT_PERMISSIONS.view,
    Page: lazy(() => import('./opportunities/OpportunitiesReportPage').then((module) => ({ default: module.OpportunitiesReportPage }))),
  },
  {
    path: ROUTE_PATHS.reports.forecast,
    permission: REPORT_PERMISSIONS.view,
    Page: lazy(() => import('./forecast/ForecastReportPage').then((module) => ({ default: module.ForecastReportPage }))),
  },
  {
    path: ROUTE_PATHS.reports.visits,
    permission: REPORT_PERMISSIONS.view,
    Page: lazy(() => import('./visits/VisitsReportPage').then((module) => ({ default: module.VisitsReportPage }))),
  },
  {
    path: ROUTE_PATHS.reports.activities,
    permission: REPORT_PERMISSIONS.view,
    Page: lazy(() => import('./activities/ActivitiesReportPage').then((module) => ({ default: module.ActivitiesReportPage }))),
  },
  { path: ROUTE_PATHS.reports.dashboard, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
  { path: ROUTE_PATHS.reports.funnel, permission: REPORT_PERMISSIONS.view, Page: ReportsPendingPage },
];
