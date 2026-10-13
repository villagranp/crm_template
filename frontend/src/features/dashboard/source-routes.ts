import { useMemo } from 'react';
import { matchPath } from 'react-router-dom';

import { useCan } from '@/hooks/use-permission';
import { getShellNavigablePathsWithoutPages } from '@/routes/shell-paths';

import { DASHBOARD_PERMISSIONS } from './dashboard.permissions';
import type { PeriodRange, SourceRef, SourceType } from './dashboard.types';

/**
 * Único sitio donde el Panel de control decide a dónde lleva cada tarjeta,
 * alerta, evento o visita (01 §E.3, §E.7, RN-01.19, RN-01.22).
 *
 * Un destino sólo se enlaza si su ruta está **registrada en el router** (se
 * comprueba con `getShellNavigablePaths()` en su variante sin páginas de
 * `routes/shell-paths.ts`, el mismo árbol que valida `route-registry.spec.ts`)
 * y la sesión tiene el permiso de esa ruta. Si el módulo dueño todavía no existe (hoy, `/actividad/*`), no hay enlace y la
 * tarjeta muestra la nota de disponibilidad: al registrar la ruta, el enlace
 * aparece sin tocar Inicio (G.3).
 *
 * Los nombres de los filtros de destino son los de los contratos de los
 * dueños (D-01.4): 03 F.1/F.2 (`active`, `status`, `outcome`, `decisionFrom/To`)
 * y 04 F.1/F.2 (`statusGroup`, `bucket` repetible).
 */

/** Nota de RN-01.19 cuando la ruta de destino no existe o no se puede abrir. */
export const UNAVAILABLE_ROUTE_NOTE = 'Listado disponible cuando se habilite el módulo';

export interface LinkContext {
  /** Rutas registradas del shell (patrones, p. ej. `/proyectos/:projectId`). */
  navigablePaths: readonly string[];
  can: (permission: string) => boolean;
}

type QueryValue = string | readonly string[];

interface RouteTarget {
  path: string;
  permission: string;
  query?: Record<string, QueryValue>;
  /** Ficha con id: basta con que coincida un patrón con parámetros (`/proyectos/:projectId`). */
  isDetail?: boolean;
}

/**
 * Codifica el valor de un parámetro dejando legibles las comas de las listas
 * CSV (`outcome=WON,PARTIAL`), que los listados leen igual.
 */
function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/%2C/gi, ',');
}

function buildHref(path: string, query: Record<string, QueryValue> = {}): string {
  const parts = Object.entries(query).flatMap(([key, value]) =>
    (typeof value === 'string' ? [value] : value).map(
      (item) => `${encodeURIComponent(key)}=${encodeQueryValue(item)}`,
    ),
  );
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
}

/**
 * `true` si la ruta está registrada en el router. Un listado debe figurar tal
 * cual; una ficha (`allowParams`) basta con que coincida un patrón con
 * parámetros (`/proyectos/1234` con `/proyectos/:projectId`).
 */
export function isRegisteredPath(
  path: string,
  navigablePaths: readonly string[],
  allowParams = false,
): boolean {
  return navigablePaths.some(
    (pattern) =>
      pattern === path ||
      (allowParams &&
        pattern.includes(':') &&
        matchPath({ path: pattern, end: true }, path) !== null),
  );
}

function resolveTarget(target: RouteTarget, context: LinkContext): string | null {
  if (
    !context.can(target.permission) ||
    !isRegisteredPath(target.path, context.navigablePaths, target.isDetail)
  ) {
    return null;
  }
  return buildHref(target.path, target.query);
}

// ---------------------------------------------------------------------------
// Tarjetas de indicador (E.3)
// ---------------------------------------------------------------------------

export type KpiCardKey =
  | 'activeProjects'
  | 'openOpportunities'
  | 'wonOpportunities'
  | 'lostOpportunities'
  | 'forecast'
  | 'pendingVisits'
  | 'pendingActivities'
  | 'overdueActivities';

const LIST_PATHS = {
  projects: '/proyectos',
  opportunities: '/proyectos/oportunidades',
  forecast: '/proyectos/forecast',
  visits: '/actividad/visitas',
  pendingActivities: '/actividad/pendientes',
} as const;

function kpiTarget(card: KpiCardKey, period?: Pick<PeriodRange, 'from' | 'to'>): RouteTarget {
  const decision: Record<string, QueryValue> = period
    ? { decisionFrom: period.from, decisionTo: period.to }
    : {};
  switch (card) {
    case 'activeProjects':
      return {
        path: LIST_PATHS.projects,
        permission: DASHBOARD_PERMISSIONS.projects,
        query: { active: 'true' },
      };
    case 'openOpportunities':
      return {
        path: LIST_PATHS.opportunities,
        permission: DASHBOARD_PERMISSIONS.opportunities,
        query: { status: 'OPEN' },
      };
    case 'wonOpportunities':
      return {
        path: LIST_PATHS.opportunities,
        permission: DASHBOARD_PERMISSIONS.opportunities,
        query: { outcome: 'WON,PARTIAL', ...decision },
      };
    case 'lostOpportunities':
      return {
        path: LIST_PATHS.opportunities,
        permission: DASHBOARD_PERMISSIONS.opportunities,
        query: { outcome: 'LOST', ...decision },
      };
    case 'forecast':
      return { path: LIST_PATHS.forecast, permission: DASHBOARD_PERMISSIONS.forecast };
    case 'pendingVisits':
      return {
        path: LIST_PATHS.visits,
        permission: DASHBOARD_PERMISSIONS.visits,
        query: { statusGroup: 'PENDING' },
      };
    case 'pendingActivities':
      return {
        path: LIST_PATHS.pendingActivities,
        permission: DASHBOARD_PERMISSIONS.activities,
        query: { bucket: ['DUE_SOON', 'PENDING'] },
      };
    case 'overdueActivities':
      return {
        path: LIST_PATHS.pendingActivities,
        permission: DASHBOARD_PERMISSIONS.activities,
        query: { bucket: 'OVERDUE' },
      };
  }
}

/**
 * Enlace de una tarjeta K1–K8 al listado de su módulo con el filtro de E.3, o
 * `null` si la ruta no está registrada o falta su permiso (RN-01.19).
 *
 * @param period Período de K3/K4 (`decisionFrom`/`decisionTo`), el que devolvió el backend.
 */
export function kpiCardHref(
  card: KpiCardKey,
  context: LinkContext,
  period?: Pick<PeriodRange, 'from' | 'to'>,
): string | null {
  return resolveTarget(kpiTarget(card, period), context);
}

// ---------------------------------------------------------------------------
// Fichas de origen (E.7)
// ---------------------------------------------------------------------------

/**
 * Ficha de cada tipo de origen. Las de Actividad comercial (`/actividad/…`)
 * son las que definirá el Módulo 4; mientras no estén registradas, no hay enlace.
 */
const DETAIL_ROUTES: Record<SourceType, { prefix: string; permission: string }> = {
  PROJECT: { prefix: '/proyectos', permission: DASHBOARD_PERMISSIONS.projects },
  OPPORTUNITY: {
    prefix: '/proyectos/oportunidades',
    permission: DASHBOARD_PERMISSIONS.opportunities,
  },
  VISIT: { prefix: '/actividad/visitas', permission: DASHBOARD_PERMISSIONS.visits },
  ACTIVITY: { prefix: '/actividad/actividades', permission: DASHBOARD_PERMISSIONS.activities },
};

const CUSTOMER_DETAIL_PREFIX = '/clientes';

function detailPath(prefix: string, id: string): string {
  return `${prefix}/${encodeURIComponent(id)}`;
}

/** Ficha del registro de origen de una alerta, evento o visita, o `null` si no se puede abrir. */
export function sourceHref(
  source: Pick<SourceRef, 'type' | 'id'>,
  context: LinkContext,
): string | null {
  const route = DETAIL_ROUTES[source.type];
  if (!route) {
    return null;
  }
  return resolveTarget(
    { path: detailPath(route.prefix, source.id), permission: route.permission, isDetail: true },
    context,
  );
}

/** Ficha del cliente relacionado, o `null` si Clientes no está disponible para la sesión. */
export function customerHref(customerId: string, context: LinkContext): string | null {
  return resolveTarget(
    {
      path: detailPath(CUSTOMER_DETAIL_PREFIX, customerId),
      permission: DASHBOARD_PERMISSIONS.customers,
      isDetail: true,
    },
    context,
  );
}

/** Ficha de una visita por su id (próximas visitas). */
export function visitHref(visitId: string, context: LinkContext): string | null {
  return sourceHref({ type: 'VISIT', id: visitId }, context);
}

let cachedNavigablePaths: readonly string[] | null = null;

/**
 * Rutas registradas del router, calculadas una vez. Se usa la variante sin
 * páginas de `getShellNavigablePaths()` (`routes/shell-paths.ts`, idéntica por
 * prueba) porque `app-routes.tsx` importa a su vez la página de Inicio.
 */
function shellNavigablePaths(): readonly string[] {
  cachedNavigablePaths ??= getShellNavigablePathsWithoutPages();
  return cachedNavigablePaths;
}

/** Contexto de enlaces de la sesión: rutas registradas y comprobador de permisos. */
export function useLinkContext(): LinkContext {
  const can = useCan();
  return useMemo(() => ({ navigablePaths: shellNavigablePaths(), can }), [can]);
}
