import { lazy } from 'react';

import { ROUTE_PATHS } from '@/routes/route-paths';

import type { CrmRoute } from '../crm-routes';

const CommercialActivityPendingPage = lazy(() =>
  import('./CommercialActivityPendingPage').then((module) => ({ default: module.CommercialActivityPendingPage })),
);

/**
 * Rutas de Actividad comercial (04 §E.1): ruta + permiso + página lazy. El
 * permiso de una ruta con opción de menú es el `requiredPermission` de esa
 * opción sembrada (`actividad-*`); las hijas (alta, detalle) llevan el de su
 * operación. Todas figuran en `app-routes.registry.json` (D-04.13).
 *
 * PROVISIONAL: agenda, seguimiento, historial y visitas siguen con
 * `CommercialActivityPendingPage` hasta que llegue su tanda de pantallas.
 */
export const COMMERCIAL_ACTIVITY_ROUTES: readonly CrmRoute[] = [
  { path: ROUTE_PATHS.activity.agenda, permission: 'actividades.ver', Page: CommercialActivityPendingPage },
  {
    path: ROUTE_PATHS.activity.pending,
    permission: 'actividades.ver',
    Page: lazy(() => import('./pending/PendingActivitiesPage').then((module) => ({ default: module.PendingActivitiesPage }))),
  },
  { path: ROUTE_PATHS.activity.followUp, permission: 'actividades.ver', Page: CommercialActivityPendingPage },
  { path: ROUTE_PATHS.activity.history, permission: 'actividades.ver', Page: CommercialActivityPendingPage },
  { path: ROUTE_PATHS.activity.visits, permission: 'visitas.ver', Page: CommercialActivityPendingPage },
  { path: ROUTE_PATHS.activity.visitNew, permission: 'visitas.crear', Page: CommercialActivityPendingPage },
  { path: ROUTE_PATHS.activity.visitDetail, permission: 'visitas.ver', Page: CommercialActivityPendingPage },
  {
    path: ROUTE_PATHS.activity.activities,
    permission: 'actividades.ver',
    Page: lazy(() => import('./activities/ActivitiesPage').then((module) => ({ default: module.ActivitiesPage }))),
  },
  {
    path: ROUTE_PATHS.activity.activityNew,
    permission: 'actividades.crear',
    Page: lazy(() => import('./activities/ActivityFormPage').then((module) => ({ default: module.ActivityFormPage }))),
  },
  {
    path: ROUTE_PATHS.activity.activityDetail,
    permission: 'actividades.ver',
    Page: lazy(() => import('./activities/ActivityDetailPage').then((module) => ({ default: module.ActivityDetailPage }))),
  },
];
