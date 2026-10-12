import { Typography } from '@mui/material';
import { useMemo } from 'react';
import type { Location } from 'react-router-dom';

import { ForecastMatrix, type ForecastFilters } from '@/features/crm/forecast';

import type { ProjectDetail } from '../projects.api';

import { SectionCard } from './SectionCard';

const SECTION_PARAM = 'seccion';

/** Cambiar de sección de la ficha desmonta la matriz: con cambios sin guardar, también se avisa. */
function leavesSection(current: Location, next: Location): boolean {
  return (
    current.pathname !== next.pathname ||
    new URLSearchParams(current.search).get(SECTION_PARAM) !== new URLSearchParams(next.search).get(SECTION_PARAM)
  );
}

/**
 * Sección 7 · Forecast (03 §E.4, F-20, AC-03.81). La misma `ForecastMatrix` de
 * `/proyectos/forecast` filtrada por el proyecto, con los mismos totales y
 * reglas; las celdas son editables según lo que decide el backend
 * (`capabilities.canEditForecast` → `cell.editable`).
 */
export function ProjectForecastSection({ project }: { project: ProjectDetail }) {
  const filters = useMemo<ForecastFilters>(() => ({ mode: 'WINDOW', projectId: project.id }), [project.id]);
  return (
    <SectionCard title="Forecast">
      {project.capabilities.canEditForecast ? null : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Puedes consultar el forecast de este proyecto, pero no editarlo.
        </Typography>
      )}
      <ForecastMatrix
        filters={filters}
        hideProject
        emptyTitle="Sin forecast"
        emptyDescription="Asocia productos al proyecto para proyectar sus cantidades mes a mes."
        shouldBlockNavigation={leavesSection}
      />
    </SectionCard>
  );
}
