import { ROUTE_PATHS } from '@/routes/route-paths';

/** `/integraciones/clientes/:importId` con el id ya codificado. */
export function customerImportDetailPath(importId: string): string {
  return ROUTE_PATHS.crm.customerImports.detail.replace(':importId', encodeURIComponent(importId));
}
