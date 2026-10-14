/**
 * Permisos que deciden qué bloques del Panel de control se pintan y se
 * consultan (01 §H.1, RN-01.4). Son los códigos exactos del catálogo sembrado
 * (00 §5.2): Inicio no crea ningún permiso.
 *
 * Sólo deciden qué se muestra: el backend vuelve a exigir el permiso de cada
 * endpoint (`@RequirePermission` / `@RequireAnyPermission`) y filtra por ámbito.
 */
export const DASHBOARD_PERMISSIONS = {
  /** K1 (`/dashboard/indicators/projects`). */
  projects: 'proyectos.ver',
  /** K2–K4 (`/dashboard/indicators/opportunities`). */
  opportunities: 'oportunidades.ver',
  /** K5 (`/dashboard/indicators/forecast`). */
  forecast: 'forecast.ver',
  /** K6 y próximas visitas (`/dashboard/indicators/visits`, `/dashboard/upcoming-visits`). */
  visits: 'visitas.ver',
  /** K7 y K8 (`/dashboard/indicators/activities`). */
  activities: 'actividades.ver',
  /** K9 (`/dashboard/indicators/targets`). */
  targets: 'metas.ver',
  /** Sólo para enlazar la ficha del cliente relacionado (no es fuente de ningún bloque). */
  customers: 'clientes.ver',
} as const;

/** Fuentes de la actividad reciente (D.5): basta una (D-01.1). */
export const RECENT_ACTIVITY_PERMISSIONS = [
  DASHBOARD_PERMISSIONS.activities,
  DASHBOARD_PERMISSIONS.visits,
  DASHBOARD_PERMISSIONS.opportunities,
  DASHBOARD_PERMISSIONS.projects,
] as const;

/** Fuentes de la bandeja de alertas y su resumen (D.6): basta una (D-01.1). */
export const ALERT_PERMISSIONS = [
  DASHBOARD_PERMISSIONS.activities,
  DASHBOARD_PERMISSIONS.visits,
  DASHBOARD_PERMISSIONS.projects,
  DASHBOARD_PERMISSIONS.opportunities,
] as const;

/** Permisos de fuente comercial (RN-01.7): sin ninguno, cero peticiones a `/dashboard/*`. */
export const COMMERCIAL_SOURCE_PERMISSIONS = [
  DASHBOARD_PERMISSIONS.projects,
  DASHBOARD_PERMISSIONS.opportunities,
  DASHBOARD_PERMISSIONS.forecast,
  DASHBOARD_PERMISSIONS.visits,
  DASHBOARD_PERMISSIONS.activities,
  DASHBOARD_PERMISSIONS.targets,
] as const;

/** Qué bloques del panel puede ver la sesión. */
export interface DashboardAccess {
  projects: boolean;
  opportunities: boolean;
  forecast: boolean;
  visits: boolean;
  activities: boolean;
  targets: boolean;
  recentActivity: boolean;
  alerts: boolean;
  /** `false` → aviso "Todavía no tienes indicadores comerciales asignados" (RN-01.7). */
  anyCommercialSource: boolean;
}

/** Acceso por bloque a partir de un comprobador de permisos (`useCan()`). */
export function resolveDashboardAccess(can: (permission: string) => boolean): DashboardAccess {
  return {
    projects: can(DASHBOARD_PERMISSIONS.projects),
    opportunities: can(DASHBOARD_PERMISSIONS.opportunities),
    forecast: can(DASHBOARD_PERMISSIONS.forecast),
    visits: can(DASHBOARD_PERMISSIONS.visits),
    activities: can(DASHBOARD_PERMISSIONS.activities),
    targets: can(DASHBOARD_PERMISSIONS.targets),
    recentActivity: RECENT_ACTIVITY_PERMISSIONS.some((permission) => can(permission)),
    alerts: ALERT_PERMISSIONS.some((permission) => can(permission)),
    anyCommercialSource: COMMERCIAL_SOURCE_PERMISSIONS.some((permission) => can(permission)),
  };
}
