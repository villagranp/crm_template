/**
 * Barril público del submódulo de Forecast (03 §L.3): la ficha del proyecto
 * reutiliza la misma matriz filtrada por el proyecto (AC-03.81). Lo demás es
 * interno.
 */
export { ForecastMatrix } from './components/ForecastMatrix';
export type { ForecastMatrixProps } from './components/ForecastMatrix';
export type { ForecastFilters, ForecastMode } from './forecast.api';
