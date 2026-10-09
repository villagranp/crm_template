import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Usuarios';

/** Pantalla de administración «Usuarios». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function UsersPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Alta, edición, suspensión y asignaciones de los usuarios." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
