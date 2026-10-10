/** Piezas compartidas por las pantallas de administración. Ver `features/admin/README.md`. */
export { adminBreadcrumbs } from './admin-breadcrumbs';
export { ADMIN_ERROR_CODES, ADMIN_ONLY_NOTE, createQueryKeys, describeApiError } from './admin-api';
export type { ApiErrorView, ListQuery, Paginated } from './admin-api';
export { AdminDialog, DialogFooter, RequiredNote } from './AdminDialog';
export type { AdminDialogProps, DialogFooterProps } from './AdminDialog';
export { AdminDrawer } from './AdminDrawer';
export type { AdminDrawerProps } from './AdminDrawer';
export { initialsOf, recordsSubtitle } from './admin-format';
export { AdminListCard, ListCardTool, RefreshTool } from './AdminListCard';
export type { AdminListCardProps, ListCardToolProps } from './AdminListCard';
export { brandSoft, neutralSoft, subtleSurface } from './admin-surfaces';
export { ConfirmDialog, REASON_MIN_LENGTH } from './ConfirmDialog';
export type { ConfirmDialogProps, ConfirmDialogReasonOptions } from './ConfirmDialog';
export { DataTable } from './DataTable';
export type { DataTableColumn, DataTableProps } from './DataTable';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { DetailList, DetailSection, FormSection, FullRow } from './FormSection';
export type { DetailListProps, DetailSectionProps, FormSectionProps } from './FormSection';
export { FilterChips, ListToolbar } from './ListToolbar';
export type { FilterChipOption, FilterChipsProps, ListToolbarProps } from './ListToolbar';
export { RowIdentity } from './RowIdentity';
export type { RowIdentityProps } from './RowIdentity';
export { useFilterCounts } from './use-filter-counts';
export type { UseFilterCountsOptions } from './use-filter-counts';
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
