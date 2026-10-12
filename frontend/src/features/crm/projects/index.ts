/**
 * Barril público del submódulo de Proyectos para otros submódulos del CRM
 * (Clientes, Oportunidades, Forecast, Actividad comercial). Lo que no está aquí
 * es interno. Llegarán en E3: `ProjectPicker`, `OpportunityPicker` y los tipos de
 * `ProjectListItemDto` (03 §L.3).
 */
export {
  FORECAST_PERMISSIONS,
  OPPORTUNITY_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  PROJECT_PERMISSIONS,
} from './projects.permissions';
export { opportunityDetailPath, projectDetailPath } from './project-paths';
