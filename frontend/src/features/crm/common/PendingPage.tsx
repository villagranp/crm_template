import { PageHeader, type BreadcrumbItem } from '@/components/layout/PageHeader';

import { PendingScreen } from './PendingScreen';

export interface PendingPageProps {
  title: string;
  breadcrumbs: BreadcrumbItem[];
  description?: string;
}

/**
 * Página del CRM con ruta, permiso y migas ya definitivos cuya pantalla aún no
 * se ha construido (p. ej. las del Módulo 3 antes de su etapa E3). Permite
 * registrar la ruta, sembrar su opción de menú y probar la navegación sin
 * llevar a un 404; la pantalla real sustituye el contenido del mismo archivo.
 */
export function PendingPage({ title, breadcrumbs, description }: PendingPageProps) {
  return (
    <>
      <PageHeader title={title} breadcrumbs={breadcrumbs} />
      <PendingScreen description={description} />
    </>
  );
}
