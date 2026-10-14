import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { ProjectPicker, type ProjectPickerValue } from '@/features/crm/projects';

export type ProjectFilterValue = ProjectPickerValue | { id: string } | null;

export interface ProjectFilterFieldProps {
  value: ProjectFilterValue;
  onChange: (project: ProjectPickerValue | null) => void;
  /** Con un cliente elegido en el mismo panel, sólo se ofrecen sus proyectos. */
  customerId?: string;
  label?: string;
}

/**
 * Filtro "Proyecto" de los listados del módulo (04 §E.4, §E.5, §E.6):
 * `ProjectPicker` del Módulo 3 (proyectos visibles, `GET /projects?search=`).
 * Sin la opción de menú de Proyectos (D-02.10) no se ofrece ni se llama a su API.
 */
export function ProjectFilterField({ value, onChange, customerId, label = 'Proyecto' }: ProjectFilterFieldProps) {
  const availability = useModuleAvailability(CRM_MODULE_OPTION_KEYS.projects);
  if (!availability.isAvailable) {
    return null;
  }
  return <ProjectPicker label={label} value={value} onChange={onChange} customerId={customerId} />;
}
