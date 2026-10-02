/**
 * Shared API contract types.
 *
 * These mirror the backend contract documented in API-STANDARDS.md. They are
 * intentionally generic: no business entity belongs in this file.
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<TItem> {
  data: TItem[];
  pagination: PaginationMeta;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown[];
  correlationId?: string;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}
