/**
 * Piezas de datos compartidas por todas las áreas del frontend (D-02.11):
 * tablas paginadas en el servidor, barras de herramientas, diálogos, paneles
 * laterales, secciones de formulario, estados vacíos y el estado de lista en la
 * URL. Ver `features/admin/README.md` §3 y `features/crm/README.md`.
 *
 * No contienen lógica de ningún área: si algo sólo lo usa un área, vive en su
 * carpeta.
 */
export { ConfirmDialog, REASON_MIN_LENGTH } from './ConfirmDialog';
export type { ConfirmDialogProps, ConfirmDialogReasonOptions } from './ConfirmDialog';
export { DataTable } from './DataTable';
export type { DataTableColumn, DataTableProps } from './DataTable';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { DialogFooter, EntityDialog, RequiredNote } from './EntityDialog';
export type { DialogFooterProps, EntityDialogProps } from './EntityDialog';
export { EntityDrawer } from './EntityDrawer';
export type { EntityDrawerProps } from './EntityDrawer';
export { DetailList, DetailSection, FormSection, FullRow } from './FormSection';
export type { DetailListProps, DetailSectionProps, FormSectionProps } from './FormSection';
export { FilterChips, ListToolbar } from './ListToolbar';
export type { FilterChipOption, FilterChipsProps, ListToolbarProps } from './ListToolbar';
export { brandSoft, neutralSoft, subtleSurface } from './surfaces';
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
