import { lazy } from 'react';

import { ROUTE_PATHS } from '@/routes/route-paths';

import type { CrmRoute } from '../crm-routes';

/**
 * Rutas de Actividad comercial (04 §E.1): ruta + permiso + página lazy. El
 * permiso de una ruta con opción de menú es el `requiredPermission` de esa
 * opción sembrada (`actividad-*`); las hijas (alta, detalle) llevan el de su
 * operación. Todas figuran en `app-routes.registry.json` (D-04.13).
 */
export const COMMERCIAL_ACTIVITY_ROUTES: readonly CrmRoute[] = [
  {
    path: ROUTE_PATHS.activity.agenda,
    permission: 'actividades.ver',
    Page: lazy(() => import('./agenda/AgendaPage').then((module) => ({ default: module.AgendaPage }))),
  },
  {
    path: ROUTE_PATHS.activity.pending,
    permission: 'actividades.ver',
    Page: lazy(() => import('./pending/PendingActivitiesPage').then((module) => ({ default: module.PendingActivitiesPage }))),
  },
  {
    path: ROUTE_PATHS.activity.followUp,
    permission: 'actividades.ver',
    Page: lazy(() => import('./follow-up/FollowUpPage').then((module) => ({ default: module.FollowUpPage }))),
  },
  {
    path: ROUTE_PATHS.activity.history,
    permission: 'actividades.ver',
    Page: lazy(() => import('./interactions/InteractionHistoryPage').then((module) => ({ default: module.InteractionHistoryPage }))),
  },
  {
    path: ROUTE_PATHS.activity.visits,
    permission: 'visitas.ver',
    Page: lazy(() => import('./visits/VisitsPage').then((module) => ({ default: module.VisitsPage }))),
  },
  {
    path: ROUTE_PATHS.activity.visitNew,
    permission: 'visitas.crear',
    Page: lazy(() => import('./visits/VisitFormPage').then((module) => ({ default: module.VisitFormPage }))),
  },
  {
    path: ROUTE_PATHS.activity.visitDetail,
    permission: 'visitas.ver',
    Page: lazy(() => import('./visits/VisitDetailPage').then((module) => ({ default: module.VisitDetailPage }))),
  },
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
