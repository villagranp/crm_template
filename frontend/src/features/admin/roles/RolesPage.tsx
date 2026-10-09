import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Roles y permisos';

/** Pantalla de administración «Roles y permisos». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function RolesPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Roles del sistema y propios, con sus permisos y opciones de menú." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
