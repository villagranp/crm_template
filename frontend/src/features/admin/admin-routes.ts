import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { ROUTE_PATHS } from '@/routes/route-paths';

/**
 * Pantallas de administración: ruta, permiso y página (cargada bajo demanda).
 *
 * El permiso de cada ruta es el `requiredPermission` de su opción de menú
 * sembrada (ADR-018, PLAN-ADMIN §5); `app-routes.tsx` envuelve cada página en
 * `RequirePermission`. Si cambia una ruta, cambia también en
 * `backend/src/modules/access/app-routes.registry.json` y en la semilla del
 * menú; `route-registry.spec.ts` falla si el router y el registro divergen.
 *
 * Las páginas van con `React.lazy` para que el código de administración no
 * engorde el chunk inicial: sólo se descarga al entrar (y con permiso).
 */

export interface AdminRoute {
  path: string;
  /** Permiso `recurso.accion` que exige la ruta (el de su opción de menú). */
  permission: string;
  Page: LazyExoticComponent<ComponentType>;
}

export const ADMIN_ROUTES: readonly AdminRoute[] = [
  {
    path: ROUTE_PATHS.admin.users,
    permission: 'usuarios.ver',
    Page: lazy(() => import('./users/UsersPage').then((module) => ({ default: module.UsersPage }))),
  },
  {
    path: ROUTE_PATHS.admin.roles,
    permission: 'roles.ver',
    Page: lazy(() => import('./roles/RolesPage').then((module) => ({ default: module.RolesPage }))),
  },
  {
    path: ROUTE_PATHS.admin.menuOptions,
    permission: 'opciones.ver',
    Page: lazy(() => import('./menu-options/MenuOptionsPage').then((module) => ({ default: module.MenuOptionsPage }))),
  },
  {
    path: ROUTE_PATHS.admin.teams,
    permission: 'equipos.ver',
    Page: lazy(() => import('./teams/TeamsPage').then((module) => ({ default: module.TeamsPage }))),
  },
  {
    path: ROUTE_PATHS.admin.catalogs,
    permission: 'catalogos.ver',
    Page: lazy(() => import('./catalogs/CatalogsPage').then((module) => ({ default: module.CatalogsPage }))),
  },
  {
    path: ROUTE_PATHS.admin.parameters,
    permission: 'parametros.ver',
    Page: lazy(() => import('./parameters/ParametersPage').then((module) => ({ default: module.ParametersPage }))),
  },
  // Módulo 7 (07 E.5): opciones `admin-tipos-cambio`, `admin-productos` y `admin-conversiones` de la semilla.
  {
    path: ROUTE_PATHS.admin.exchangeRates,
    permission: 'parametros.ver',
    Page: lazy(() =>
      import('./exchange-rates/ExchangeRatesPage').then((module) => ({ default: module.ExchangeRatesPage })),
    ),
  },
  {
    path: ROUTE_PATHS.admin.products,
    permission: 'productos.ver',
    Page: lazy(() => import('./products/ProductsPage').then((module) => ({ default: module.ProductsPage }))),
  },
  {
    path: ROUTE_PATHS.admin.conversions,
    permission: 'productos.ver',
    Page: lazy(() => import('./conversions/ConversionsPage').then((module) => ({ default: module.ConversionsPage }))),
  },
  {
    path: ROUTE_PATHS.admin.approvals,
    permission: 'aprobaciones.ver',
    Page: lazy(() => import('./approvals/ApprovalsPage').then((module) => ({ default: module.ApprovalsPage }))),
  },
  {
    path: ROUTE_PATHS.admin.audit,
    permission: 'auditoria.ver',
    Page: lazy(() => import('./audit/AuditPage').then((module) => ({ default: module.AuditPage }))),
  },
  // Ajustes 1 (AJ1-2): opción `admin-minuto-seguridad` de la semilla.
  {
    path: ROUTE_PATHS.admin.safetyMinutes,
    permission: 'minuto_seguridad.ver',
    Page: lazy(() =>
      import('./safety-minutes/SafetyMinutesPage').then((module) => ({ default: module.SafetyMinutesPage })),
    ),
  },
];
