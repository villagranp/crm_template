/**
 * Barril público del submódulo de Clientes (features/crm/README.md §1): lo
 * único que Proyectos y Actividad pueden importar de aquí.
 */
export { CustomerPicker } from './components/CustomerPicker';
export type { CustomerPickerProps, CustomerPickerValue } from './components/CustomerPicker';
export { customerDetailPath } from './customer-paths';
export type { CustomerAccess, CustomerListItem } from './customers.api';
/**
 * `useCustomer(id)`: ficha (`GET /customers/:id`, `clientes.ver`). Reportes la usa para nombrar el
 * chip de un cliente elegido tras recargar (05 P-05.28); fuera de alcance responde 404.
 */
export { useCustomer } from './customers.queries';
