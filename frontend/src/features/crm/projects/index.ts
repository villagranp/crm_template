/**
 * Barril público del submódulo de Proyectos para otros submódulos del CRM
 * (Clientes, Oportunidades, Forecast, Actividad comercial). Lo que no está aquí
 * es interno. `OpportunityPicker` se exporta desde `features/crm/opportunities`
 * y `ForecastMatrix` desde `features/crm/forecast` (03 §L.3, E3b).
 */
export {
  FORECAST_PERMISSIONS,
  OPPORTUNITY_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  PROJECT_PERMISSIONS,
} from './projects.permissions';
export { opportunityDetailPath, projectDetailPath } from './project-paths';
export { ProjectPicker } from './components/ProjectPicker';
export type { ProjectPickerProps, ProjectPickerValue } from './components/ProjectPicker';
export { CommercialStatusChip } from './components/CommercialStatusChip';
export { PhaseChip } from './components/PhaseChip';
export type { PhaseChipProps } from './components/PhaseChip';
// Piezas que reutilizan Oportunidades y Forecast (E3b).
export { OwnerPicker } from './components/OwnerPicker';
export type { OwnerPickerProps } from './components/OwnerPicker';
export { ProductPicker } from './components/ProductPicker';
export type { ProductPickerProps } from './components/ProductPicker';
export { UnitSelect } from './components/UnitSelect';
export { ConversionBadge, NO_CONVERSION_HELP } from './components/ConversionBadge';
export { FormErrorAlert } from './components/FormErrorAlert';
export {
  CONVERSION_SCOPE_LABELS,
  formatCalendarDate,
  formatDateTime,
  isCalendarDate,
  orDash,
  productLabel,
  projectLabel,
} from './project-format';
export { withReference } from './projects.errors';
// `useProject`: el Módulo 4 resuelve con él la preselección de un proyecto (04 §E.10, F-31).
export { projectKeys, useInvalidateProject, useProject } from './projects.queries';
export type { Product } from './products/project-products.api';
export type {
  CatalogRef,
  CommercialStatus,
  ConversionScope,
  CustomerRef,
  OwnerOption,
  ProjectCapabilities,
  ProjectCommercialStatusKind,
  ProjectDetail,
  ProjectListItem,
  ProjectListPhase,
  StageOption,
  TeamProjectItem,
  UnitOfMeasure,
  UnitRef,
  UserRef,
} from './projects.api';
