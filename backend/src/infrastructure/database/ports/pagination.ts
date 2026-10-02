/**
 * Contratos de paginacion compartidos por los puertos de datos.
 * Son tipos de dominio: NO exponen conceptos del ORM ni del motor.
 */
export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly totalItems: number;
  readonly page: number;
  readonly pageSize: number;
}

export function createPage<T>(
  items: readonly T[],
  totalItems: number,
  request: PageRequest,
): Page<T> {
  return { items, totalItems, page: request.page, pageSize: request.pageSize };
}
