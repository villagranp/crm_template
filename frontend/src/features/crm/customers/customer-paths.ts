import { ROUTE_PATHS } from '@/routes/route-paths';

/** `/clientes/:customerId` con el id ya codificado. */
export function customerDetailPath(customerId: string): string {
  return ROUTE_PATHS.crm.customerDetail.replace(':customerId', encodeURIComponent(customerId));
}
