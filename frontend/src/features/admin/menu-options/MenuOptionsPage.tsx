import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, UnderConstruction } from '@/features/admin/common';

const TITLE = 'Opciones de menú';

/** Pantalla de administración «Opciones de menú». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function MenuOptionsPage() {
  return (
    <>
      <PageHeader title={TITLE} subtitle="Estructura del menú y la ruta y el permiso de cada opción." breadcrumbs={adminBreadcrumbs(TITLE)} />
      <UnderConstruction />
    </>
  );
}
