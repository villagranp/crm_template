/**
 * Piezas compartidas por las pantallas de administración. Ver `features/admin/README.md`.
 *
 * Las piezas que no son propias de la administración viven en
 * `@/components/data` y `@/lib` (D-02.11); este barril las reexporta con los
 * nombres de siempre para que las áreas de administración no cambien.
 * `AdminDialog`/`AdminDrawer` son alias de `EntityDialog`/`EntityDrawer`.
 */
export {
  brandSoft,
  ConfirmDialog,
  DataTable,
  DEFAULT_PAGE_SIZE,
  DetailList,
  DetailSection,
  DialogFooter,
  EmptyState,
  EntityDialog as AdminDialog,
  EntityDrawer as AdminDrawer,
  FilterChips,
  FormSection,
  FullRow,
  ListToolbar,
  neutralSoft,
  PAGE_SIZE_OPTIONS,
  REASON_MIN_LENGTH,
  RequiredNote,
  SEARCH_DEBOUNCE_MS,
  subtleSurface,
  useTableQueryState,
} from '@/components/data';
export type {
  ConfirmDialogProps,
  ConfirmDialogReasonOptions,
  DataTableColumn,
  DataTableProps,
  DetailListProps,
  DetailSectionProps,
  DialogFooterProps,
  EmptyStateProps,
  EntityDialogProps as AdminDialogProps,
  EntityDrawerProps as AdminDrawerProps,
  FilterChipOption,
  FilterChipsProps,
  FormSectionProps,
  ListToolbarProps,
  SortDirection,
  TableQueryState,
  TableSort,
  UseTableQueryStateOptions,
  UseTableQueryStateResult,
} from '@/components/data';
export { adminBreadcrumbs } from './admin-breadcrumbs';
export { ADMIN_ERROR_CODES, ADMIN_ONLY_NOTE, createQueryKeys, describeApiError } from './admin-api';
export type { ApiErrorView, ListQuery, Paginated } from './admin-api';
export { initialsOf, recordsSubtitle } from './admin-format';
export { AdminListCard, ListCardTool, RefreshTool } from './AdminListCard';
export type { AdminListCardProps, ListCardToolProps } from './AdminListCard';
export { RowIdentity } from './RowIdentity';
export type { RowIdentityProps } from './RowIdentity';
export { useFilterCounts } from './use-filter-counts';
export type { UseFilterCountsOptions } from './use-filter-counts';
export { UnderConstruction } from './UnderConstruction';
