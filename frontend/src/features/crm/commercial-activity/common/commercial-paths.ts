import { ROUTE_PATHS } from '@/routes/route-paths';

/** Rutas del frontend de Actividad comercial con su query string (04 §E.1). */

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Historial completo filtrado por cliente, proyecto u oportunidad (E.5). */
export function interactionHistoryPath(filter: { customerId?: string; projectId?: string; opportunityId?: string }): string {
  return withQuery(ROUTE_PATHS.activity.history, filter);
}

/** Planificar visita con preselección (`?customerId=&projectId=`, E.1). */
export function planVisitPath(preset: { customerId?: string; projectId?: string } = {}): string {
  return withQuery(ROUTE_PATHS.activity.visitNew, preset);
}

/** Detalle de una visita (la pantalla la entrega la tanda de visitas). */
export function visitDetailPath(visitId: string): string {
  return ROUTE_PATHS.activity.visitDetail.replace(':visitId', encodeURIComponent(visitId));
}
