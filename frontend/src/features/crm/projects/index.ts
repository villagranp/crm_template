/**
 * Barril público del submódulo de Proyectos para otros submódulos del CRM
 * (Clientes, Oportunidades, Forecast, Actividad comercial). Lo que no está aquí
 * es interno. `OpportunityPicker` llegará con la etapa E3b (03 §L.3).
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
export type {
  CommercialStatus,
  ProjectCapabilities,
  ProjectCommercialStatusKind,
  ProjectDetail,
  ProjectListItem,
  ProjectListPhase,
  StageOption,
  TeamProjectItem,
} from './projects.api';
