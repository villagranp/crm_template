import type { QueryClient } from '@tanstack/react-query';

/**
 * Cachés de un submódulo del CRM que dependen de datos de otro (AGENTS §9.7,
 * revisión E5 del Módulo 3). Proyectos no puede importar de Forecast ni de
 * Oportunidades (ellos importan de Proyectos), así que las raíces de esas claves
 * se declaran aquí, una vez. `crm-cache.spec.ts` comprueba que coinciden con las
 * fábricas de cada submódulo (`forecastKeys.all`, `opportunityKeys.all`,
 * `customerKeys.projects`, `projectKeys.teamLists`).
 */
export const CRM_CACHE_ROOTS = {
  /** Filas y totales del forecast, de cualquier filtro. */
  forecast: ['crm', 'forecast'],
  /** Listas, tablero, resúmenes y detalles de oportunidades. */
  opportunities: ['crm', 'opportunities'],
  /** Proyectos listados en la ficha de cada cliente (AC-03.14). */
  customerProjects: ['crm', 'customers', 'projects'],
  /** Vista "Proyectos del equipo" (incluye totales del forecast). */
  projectTeamLists: ['crm', 'projects', 'team-view'],
} as const;

export type CrmDerivedCache = keyof typeof CRM_CACHE_ROOTS;

/** Invalida las cachés derivadas indicadas (sin esperar a que se recarguen las que no están montadas). */
export function invalidateCrmCaches(queryClient: QueryClient, caches: readonly CrmDerivedCache[]): Promise<unknown> {
  return Promise.all(caches.map((cache) => queryClient.invalidateQueries({ queryKey: CRM_CACHE_ROOTS[cache] })));
}
