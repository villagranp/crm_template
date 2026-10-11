/**
 * Incidencia de validación de un campo, con el mismo `code` que el error HTTP
 * equivalente (02 F.6.1). La usan los validadores que devuelven **todas** las
 * incidencias de una entrada (alta, edición e importación de clientes) en lugar
 * de lanzar en la primera. Misma forma que `customer_import_rows.errors`.
 *
 * `message` nunca repite el valor recibido: podría ser un dato personal (SECURITY.md).
 */
export interface FieldIssue {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}
