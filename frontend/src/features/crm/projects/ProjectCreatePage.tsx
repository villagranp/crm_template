import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingPage } from '@/features/crm/common/PendingPage';
import { ROUTE_PATHS } from '@/routes/route-paths';

const TITLE = 'Nuevo proyecto';

/**
 * Alta de proyecto (03 §E.3, F-10). Ruta y permiso definitivos (`crm-routes.ts`);
 * el contenido llega en la etapa E3 del Módulo 3, contra los DTO reales del backend.
 */
export function ProjectCreatePage() {
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
