/**
 * Barril público del submódulo de carga masiva de clientes (Módulo 6,
 * features/crm/README.md §1): lo único que otros submódulos pueden importar
 * de aquí (p. ej. la ficha del cliente para enlazar su `sourceImport`).
 */
export { customerImportDetailPath } from './customer-import-paths';
export { CUSTOMER_IMPORT_PERMISSIONS } from './customer-imports.permissions';
export { ImportStatusChip } from './components/ImportStatusChip';
export type { CustomerImport, CustomerImportListItem, ImportStatus } from './customer-imports.api';
