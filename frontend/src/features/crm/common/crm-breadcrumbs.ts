import type { BreadcrumbItem } from '@/components/layout/PageHeader';
import { ROUTE_PATHS } from '@/routes/route-paths';

/** Migas de una pantalla del CRM: Inicio › <tramos del módulo>. */
export function crmBreadcrumbs(...items: BreadcrumbItem[]): BreadcrumbItem[] {
  return [{ label: 'Inicio', to: ROUTE_PATHS.home }, ...items];
}
