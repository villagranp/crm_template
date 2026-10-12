import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingPage } from '@/features/crm/common/PendingPage';
import { ROUTE_PATHS } from '@/routes/route-paths';

const TITLE = 'Detalle de oportunidad';

/**
 * Detalle de oportunidad (03 §E.7). Ruta y permiso definitivos (`crm-routes.ts`);
 * el contenido llega en la etapa E3 del Módulo 3, contra los DTO reales del backend.
 */
export function OpportunityDetailPage() {
  const breadcrumbs = crmBreadcrumbs(
    { label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search },
    { label: 'Oportunidades', to: ROUTE_PATHS.crm.projects.opportunities },
    { label: 'Detalle' },
  );
  return <PendingPage title={TITLE} breadcrumbs={breadcrumbs} />;
}
