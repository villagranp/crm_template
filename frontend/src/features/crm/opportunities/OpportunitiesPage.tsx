import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingPage } from '@/features/crm/common/PendingPage';
import { ROUTE_PATHS } from '@/routes/route-paths';

const TITLE = 'Oportunidades';

/**
 * Pipeline de oportunidades (03 §E.7, F-17, F-18). Ruta y permiso definitivos (`crm-routes.ts`);
 * el contenido llega en la etapa E3 del Módulo 3, contra los DTO reales del backend.
 */
export function OpportunitiesPage() {
  return (
    <PendingPage
      title={TITLE}
      breadcrumbs={crmBreadcrumbs(
        { label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search },
        { label: TITLE },
      )}
    />
  );
}
