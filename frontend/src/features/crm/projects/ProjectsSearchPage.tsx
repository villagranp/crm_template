import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingPage } from '@/features/crm/common/PendingPage';

const TITLE = 'Proyectos';

/**
 * Búsqueda de proyectos (03 §E.2, F-13). Ruta y permiso definitivos (`crm-routes.ts`);
 * el contenido llega en la etapa E3 del Módulo 3, contra los DTO reales del backend.
 */
export function ProjectsSearchPage() {
  return <PendingPage title={TITLE} breadcrumbs={crmBreadcrumbs({ label: TITLE })} />;
}
