/**
 * Eventos de auditoría de la carga masiva (06 H.6). Solo códigos, contadores y
 * formatos: nunca valores de celdas, nombre original del archivo ni datos de
 * contacto. El alta de cada cliente la audita el Módulo 2 (`crm.customer.created`
 * con `metadata.source = IMPORT`, `sourceImportId` y `rowNumber`).
 */
export const CUSTOMER_IMPORT_AUDIT_RESOURCE = 'crm.customer_import';

export const CUSTOMER_IMPORT_AUDIT_EVENTS = {
  uploaded: 'crm.customer_import.uploaded',
  validated: 'crm.customer_import.validated',
  failed: 'crm.customer_import.failed',
  confirmed: 'crm.customer_import.confirmed',
  completed: 'crm.customer_import.completed',
  cancelled: 'crm.customer_import.cancelled',
  errorFileDownloaded: 'crm.customer_import.error_file_downloaded',
} as const;
