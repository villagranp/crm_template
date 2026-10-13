import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';

import { EmptyState } from '@/components/data';
import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';

import { SectionCard, SectionLoading } from './SectionCard';

/**
 * Sección 8 · Seguimiento comercial (03 §E.4, §F.4, AC-03.16). Los datos son
 * del Módulo 4 (`CommercialActivitySection projectId`, `NewActivityButton`,
 * `PlanVisitButton`), que los montará aquí al entregar sus puntos de entrada.
 * Hasta entonces no importa nada de ese módulo ni llama a `/follow-ups` ni a
 * `/interactions`: muestra el estado informativo (D-02.10). La ficha sólo la
 * monta con `actividades.ver` o `visitas.ver` (`FOLLOW_UP_PERMISSIONS`); el
 * Módulo 4 le añadirá las props `projectId` y `customerId` que necesiten sus
 * componentes.
 */
export function ProjectFollowUpSection() {
  const availability = useModuleAvailability(CRM_MODULE_OPTION_KEYS.activities);

  return (
    <SectionCard title="Seguimiento comercial">
      {availability.status === 'loading' ? (
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
