import type { ProjectDetail } from '../projects.api';

import { UpcomingSection } from './UpcomingSection';

/**
 * Sección 5 · Resultados (03 §E.4, F-18). El resumen por resultado sale de la
 * ficha (`summary`, DM-15: los parciales cuentan como ganados); la tabla de
 * oportunidades cerradas, su historial y "Modificar resultado" llegan con la
 * etapa E3b.
 */
export function ProjectResultsSection({ project }: { project: ProjectDetail }) {
  const { summary } = project;
  return (
    <UpcomingSection
      title="Resultados"
      description="El detalle de los resultados (motivo, porcentaje adjudicado, fecha de decisión e historial) estará disponible en la siguiente etapa del módulo."
      figures={[
        { label: 'Ganadas', value: summary.wonOpportunities },
        { label: 'Parciales', value: summary.partialOpportunities },
        { label: 'Perdidas', value: summary.lostOpportunities },
      ]}
    />
  );
}
