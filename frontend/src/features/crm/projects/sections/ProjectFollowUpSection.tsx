import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';

import { EmptyState } from '@/components/data';
import { CommercialActivitySection, NewActivityButton, PlanVisitButton } from '@/features/crm/commercial-activity/entry-points';
import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';

import type { ProjectDetail } from '../projects.api';

import { SectionCard, SectionLoading } from './SectionCard';

const TITLE = 'Seguimiento comercial';

export interface ProjectFollowUpSectionProps {
  project: Pick<ProjectDetail, 'id' | 'customer'>;
}

/**
 * Sección 8 · Seguimiento comercial (03 §E.4, §F.4, AC-03.16). Los datos y los
 * botones son del Módulo 4 (04 §E.11): `CommercialActivitySection projectId`
 * (seguimiento, próximas visitas y actividades e historial reciente, de
 * `GET /follow-ups/trace?projectId=`), `NewActivityButton` y `PlanVisitButton`
 * con el cliente y el proyecto preseleccionados; cada pieza se oculta sin su
 * permiso. Si el menú no trae ninguna opción del Módulo 4 (actividades o
 * visitas, D-02.10) no se llama a sus endpoints y se muestra el estado
 * informativo. La ficha sólo monta la sección con `actividades.ver` o
 * `visitas.ver` (`FOLLOW_UP_PERMISSIONS`).
 */
export function ProjectFollowUpSection({ project }: ProjectFollowUpSectionProps) {
  // "Alguna opción del módulo de Actividad comercial" (03 §E.4): actividades o visitas.
  const activities = useModuleAvailability(CRM_MODULE_OPTION_KEYS.activities);
  const visits = useModuleAvailability(CRM_MODULE_OPTION_KEYS.visits);

  if (activities.isAvailable || visits.isAvailable) {
    return (
      <CommercialActivitySection
        projectId={project.id}
        title={TITLE}
        actions={
          <>
            <NewActivityButton customerId={project.customer.id} projectId={project.id} />
            <PlanVisitButton customerId={project.customer.id} projectId={project.id} />
          </>
        }
      />
    );
  }

  return (
    <SectionCard title={TITLE}>
      {activities.isLoading ? (
        <SectionLoading label="Cargando el seguimiento" rows={2} />
      ) : (
        <EmptyState
          icon={<HourglassEmptyOutlinedIcon />}
          title="Disponible próximamente"
          description="El seguimiento comercial estará disponible con el módulo de Actividad comercial."
        />
      )}
    </SectionCard>
  );
}
