import type { ProjectDetail } from '../projects.api';

import { UpcomingSection } from './UpcomingSection';

/**
 * Sección 4 · Oportunidades (03 §E.4, F-17). Recibe el proyecto ya cargado;
 * su tabla (código, etapa, fecha, asesor, estimación en moneda original y en
 * USD, siguiente acción) y sus acciones llegan con la etapa E3b, contra
 * `GET /projects/{id}/opportunities`. Mientras tanto, el resumen de la ficha.
 */
export function ProjectOpportunitiesSection({ project }: { project: ProjectDetail }) {
  const { summary } = project;
  return (
    <UpcomingSection
      title="Oportunidades"
      description="La lista de oportunidades del proyecto, con su etapa y su estimación, estará disponible en la siguiente etapa del módulo."
      figures={[
        { label: 'Oportunidades', value: project.opportunityCount },
        { label: 'Abiertas', value: summary.openOpportunities },
      ]}
    />
  );
}
