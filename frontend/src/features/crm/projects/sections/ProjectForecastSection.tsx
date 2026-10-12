import type { ProjectDetail } from '../projects.api';

import { UpcomingSection } from './UpcomingSection';

/**
 * Sección 7 · Forecast (03 §E.4, F-20). La matriz M+6 filtrada por el proyecto
 * (`ForecastMatrix`, la misma de `/proyectos/forecast`) llega con la etapa E3b;
 * la edición seguirá a `capabilities.canEditForecast`.
 */
export function ProjectForecastSection({ project }: { project: ProjectDetail }) {
  return (
    <UpcomingSection
      title="Forecast"
      description={
        project.summary.productLines > 0
          ? 'La proyección mensual M+6 de los productos del proyecto estará disponible en la siguiente etapa del módulo.'
          : 'Asocia productos para proyectar. La matriz M+6 estará disponible en la siguiente etapa del módulo.'
      }
      figures={[{ label: 'Productos asociados', value: project.summary.productLines }]}
    />
  );
}
