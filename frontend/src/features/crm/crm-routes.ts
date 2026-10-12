import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { FORECAST_PERMISSIONS, OPPORTUNITY_PERMISSIONS, PROJECT_PERMISSIONS } from './projects/projects.permissions';

/**
 * Pantallas del CRM comercial: ruta, permiso y página (cargada bajo demanda).
 *
 * Mismo patrón que `features/admin/admin-routes.ts`: el permiso de una ruta
 * con opción de menú es el `requiredPermission` de esa opción sembrada
 * (ADR-018, `backend/prisma/seed/crm-access.ts`); las rutas sin opción (alta,
 * ficha) llevan el permiso de la operación que muestran (02 §E.1, 03 §E.1).
 * `app-routes.tsx` envuelve cada página en `RequirePermission`. Los permisos se
 * importan del archivo de permisos y no de un barril, para no arrastrar al
 * bundle inicial lo que el barril exporte (pickers, tipos).
 *
 * Toda ruta de aquí figura también en
 * `backend/src/modules/access/app-routes.registry.json`;
 * `route-registry.spec.ts` falla si divergen. El menú NO se declara aquí:
 * sale de `GET /me/menu` (CLAUDE.md §8.11).
 */

export interface CrmRoute {
  path: string;
  /** Permiso `recurso.accion` que exige la ruta. */
  permission: string;
  Page: LazyExoticComponent<ComponentType>;
}

export const CRM_ROUTES: readonly CrmRoute[] = [
  {
    path: ROUTE_PATHS.crm.customers,
    permission: 'clientes.ver',
    Page: lazy(() => import('./customers/CustomersPage').then((module) => ({ default: module.CustomersPage }))),
  },
  {
    path: ROUTE_PATHS.crm.customerNew,
    permission: 'clientes.crear',
    Page: lazy(() =>
      import('./customers/CustomerCreatePage').then((module) => ({ default: module.CustomerCreatePage })),
    ),
  },
  {
    path: ROUTE_PATHS.crm.customerDetail,
    permission: 'clientes.ver',
    Page: lazy(() =>
      import('./customers/CustomerDetailPage').then((module) => ({ default: module.CustomerDetailPage })),
    ),
  },
  // Módulo 3 (03 §E.1). React Router prioriza los segmentos fijos (`equipo`,
  // `oportunidades`, `forecast`, `nuevo`) sobre `:projectId`.
  {
    path: ROUTE_PATHS.crm.projects.search,
    permission: PROJECT_PERMISSIONS.view,
    Page: lazy(() =>
      import('./projects/ProjectsSearchPage').then((module) => ({ default: module.ProjectsSearchPage })),
    ),
  },
  {
    path: ROUTE_PATHS.crm.projects.create,
    permission: PROJECT_PERMISSIONS.create,
    Page: lazy(() =>
      import('./projects/ProjectCreatePage').then((module) => ({ default: module.ProjectCreatePage })),
    ),
  },
  {
    path: ROUTE_PATHS.crm.projects.detail,
    permission: PROJECT_PERMISSIONS.view,
    Page: lazy(() =>
      import('./projects/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage })),
    ),
  },
  {
    path: ROUTE_PATHS.crm.projects.team,
    permission: PROJECT_PERMISSIONS.view,
    Page: lazy(() => import('./projects/TeamProjectsPage').then((module) => ({ default: module.TeamProjectsPage }))),
  },
  {
    path: ROUTE_PATHS.crm.projects.opportunities,
    permission: OPPORTUNITY_PERMISSIONS.view,
    Page: lazy(() =>
      import('./opportunities/OpportunitiesPage').then((module) => ({ default: module.OpportunitiesPage })),
    ),
  },
  {
    path: ROUTE_PATHS.crm.projects.opportunityDetail,
    permission: OPPORTUNITY_PERMISSIONS.view,
    Page: lazy(() =>
      import('./opportunities/OpportunityDetailPage').then((module) => ({ default: module.OpportunityDetailPage })),
    ),
  },
  {
    path: ROUTE_PATHS.crm.projects.forecast,
    permission: FORECAST_PERMISSIONS.view,
    Page: lazy(() => import('./forecast/ForecastPage').then((module) => ({ default: module.ForecastPage }))),
  },
];
