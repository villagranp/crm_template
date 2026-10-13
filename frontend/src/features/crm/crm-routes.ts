import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { COMMERCIAL_ACTIVITY_ROUTES } from './commercial-activity/commercial-activity-routes';

/**
 * Pantallas del CRM comercial: ruta, permiso y página (cargada bajo demanda).
 *
 * Mismo patrón que `features/admin/admin-routes.ts`: el permiso de una ruta
 * con opción de menú es el `requiredPermission` de esa opción sembrada
 * (ADR-018, `backend/prisma/seed/crm-access.ts`); las rutas sin opción (alta,
 * ficha) llevan el permiso de la operación que muestran (02 §E.1).
 * `app-routes.tsx` envuelve cada página en `RequirePermission`.
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
  // Actividad comercial (04 E.1): `commercial-activity/commercial-activity-routes.ts`.
  ...COMMERCIAL_ACTIVITY_ROUTES,
];
