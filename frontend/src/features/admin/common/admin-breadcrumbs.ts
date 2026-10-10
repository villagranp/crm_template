import type { BreadcrumbItem } from '@/components/layout/PageHeader';
import { ROUTE_PATHS } from '@/routes/route-paths';

/** Migas estándar de una pantalla de administración: Inicio › Administración › <pantalla>. */
export function adminBreadcrumbs(current: string): BreadcrumbItem[] {
  return [{ label: 'Inicio', to: ROUTE_PATHS.home }, { label: 'Administración' }, { label: current }];
}
