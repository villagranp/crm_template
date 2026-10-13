import { PROJECT_DATE_FIELD_LABELS } from '../project-format';
import { PROJECT_DATE_FIELDS, type ProjectFilterKey, type ProjectFormOptions } from '../projects.api';

/**
 * Opciones y utilidades de los filtros de proyectos (03 §E.2, §E.6): listas
 * desde `form-options` y filtros repetibles separados por comas.
 */

/** Separador de los filtros repetibles en la URL y en la API ("Precisiones de implementación" E1). */
const LIST_SEPARATOR = ',';

export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinList(values: readonly string[]): string | undefined {
  return values.length > 0 ? values.join(LIST_SEPARATOR) : undefined;
}

export interface FilterOption {
  value: string;
  label: string;
}

/** Opciones del filtro de estado comercial (RN-03.14): cualquier etapa abierta, una etapa abierta concreta o los cerrados. */
export function commercialStatusOptions(options: ProjectFormOptions | undefined): FilterOption[] {
  const openStages = (options?.stages ?? []).filter((stage) => !stage.isClosed);
  return [
    { value: 'OPEN_STAGE', label: 'Con oportunidad abierta' },
    ...openStages.map((stage) => ({ value: `OPEN_STAGE:${stage.id}`, label: `En ${stage.label}` })),
    { value: 'WON', label: 'Ganado' },
    { value: 'LOST', label: 'Perdido' },
    { value: 'NO_OPPORTUNITIES', label: 'Sin oportunidades' },
  ];
}

export const ACTIVE_OPTIONS: readonly FilterOption[] = [
  { value: 'true', label: 'Activos' },
  { value: 'false', label: 'Finalizados' },
];

/** Opciones de cada filtro de lista, desde `form-options` (nada fijo salvo los estados de DEF-B). */
export function filterOptionsFor(key: ProjectFilterKey, options: ProjectFormOptions | undefined): FilterOption[] {
  switch (key) {
    case 'countryId':
      return (options?.countries ?? []).map((country) => ({ value: country.id, label: country.name }));
    case 'projectTypeId':
      return (options?.projectTypes ?? []).map((item) => ({ value: item.id, label: item.label }));
    case 'phaseId':
      return (options?.phases ?? []).map((item) => ({ value: item.id, label: item.label }));
    case 'stageId':
      return (options?.stages ?? []).map((item) => ({ value: item.id, label: item.label }));
    case 'commercialStatus':
      return commercialStatusOptions(options);
    case 'active':
      return [...ACTIVE_OPTIONS];
    case 'dateField':
      return PROJECT_DATE_FIELDS.map((field) => ({ value: field, label: PROJECT_DATE_FIELD_LABELS[field] }));
    default:
      return [];
  }
}
