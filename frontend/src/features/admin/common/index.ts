/** Piezas compartidas por las pantallas de administración. Ver `features/admin/README.md`. */
export { adminBreadcrumbs } from './admin-breadcrumbs';
export { ADMIN_ERROR_CODES, ADMIN_ONLY_NOTE, createQueryKeys, describeApiError } from './admin-api';
export type { ApiErrorView, ListQuery, Paginated } from './admin-api';
export { ConfirmDialog, REASON_MIN_LENGTH } from './ConfirmDialog';
export type { ConfirmDialogProps, ConfirmDialogReasonOptions } from './ConfirmDialog';
export { DataTable } from './DataTable';
export type { DataTableColumn, DataTableProps } from './DataTable';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { UnderConstruction } from './UnderConstruction';
export {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  useTableQueryState,
} from './use-table-query-state';
export type {
  SortDirection,
  TableQueryState,
  TableSort,
  UseTableQueryStateOptions,
  UseTableQueryStateResult,
} from './use-table-query-state';
