import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Equipos';

/** Pantalla de administración «Equipos». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function TeamsPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Jerarquía de equipos, responsables y miembros." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
