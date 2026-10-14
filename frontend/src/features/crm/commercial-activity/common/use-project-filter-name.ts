import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { projectLabel, useProject } from '@/features/crm/projects';

/**
 * Nombre de un proyecto filtrado para su chip ("PRY-… · Nombre"), con
 * `GET /projects/{id}` sólo si el módulo de Proyectos está en el menú; `null`
 * mientras carga, sin acceso o si no existe (el chip dice "Seleccionado").
 */
export function useProjectFilterName(projectId: string | undefined): string | null {
  const availability = useModuleAvailability(CRM_MODULE_OPTION_KEYS.projects);
  const project = useProject(availability.isAvailable ? projectId : undefined);
  return project.data ? projectLabel(project.data) : null;
}
