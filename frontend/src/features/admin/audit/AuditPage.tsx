import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Auditoría';

/** Pantalla de administración «Auditoría». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function AuditPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Registro de cambios de la administración." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
