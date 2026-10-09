import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Aprobaciones';

/** Pantalla de administración «Aprobaciones». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function ApprovalsPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Solicitudes de aprobación y su historial." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
