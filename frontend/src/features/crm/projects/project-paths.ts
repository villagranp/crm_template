import { ROUTE_PATHS } from '@/routes/route-paths';

/** `/proyectos/:projectId` con el id ya codificado. */
export function projectDetailPath(projectId: string): string {
  return ROUTE_PATHS.crm.projects.detail.replace(':projectId', encodeURIComponent(projectId));
}

/** `/proyectos/oportunidades/:opportunityId` con el id ya codificado. */
export function opportunityDetailPath(opportunityId: string): string {
  return ROUTE_PATHS.crm.projects.opportunityDetail.replace(
    ':opportunityId',
    encodeURIComponent(opportunityId),
  );
}
