import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Catálogos';

/** Pantalla de administración «Catálogos». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function CatalogsPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Catálogos de valores y sus elementos." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
