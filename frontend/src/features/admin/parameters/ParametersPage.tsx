import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Parámetros';

/** Pantalla de administración «Parámetros». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function ParametersPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Valores de configuración que lee la aplicación." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
