import { ROUTE_PATHS } from '@/routes/route-paths';

/**
 * Fichas de origen de Actividad comercial (05 E.1): `/actividad/visitas/:id` y
 * `/actividad/actividades/:id`, ya registradas en el router (04 §E.1). Las de proyectos,
 * oportunidades y clientes salen de los barriles de 03 y 02.
 */
export function visitDetailPath(visitId: string): string {
  return ROUTE_PATHS.activity.visitDetail.replace(':visitId', encodeURIComponent(visitId));
}

export function activityDetailPath(activityId: string): string {
  return ROUTE_PATHS.activity.activityDetail.replace(':activityId', encodeURIComponent(activityId));
}
