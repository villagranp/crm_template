import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { projectLabel } from '../project-format';
import type { ProjectDetail, ProjectListItem } from '../projects.api';
import { useProject, useProjects } from '../projects.queries';

/** Lo que recibe el formulario que usa el selector (03 §E.9; el Módulo 4 lo usa en visitas y actividades). */
export interface ProjectPickerValue {
  id: string;
  code: string;
  name: string;
  customerId: string;
}

export interface ProjectPickerProps {
  label?: string;
  /** Proyecto elegido. Puede llegar sólo con el id: se resuelve con `GET /projects/{id}`. */
  value: ProjectPickerValue | { id: string } | null;
  onChange: (project: ProjectPickerValue | null) => void;
  /** Limita la búsqueda a los proyectos de un cliente (p. ej. al registrar una visita). */
  customerId?: string;
  /** Sólo proyectos activos (fase no final, RN-03.15). */
  activeOnly?: boolean;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  name?: string;
}

const PICKER_PAGE_SIZE = 10;

function toValue(project: Pick<ProjectListItem | ProjectDetail, 'id' | 'code' | 'name' | 'customer'>): ProjectPickerValue {
  return { id: project.id, code: project.code, name: project.name, customerId: project.customer.id };
}

function isComplete(value: ProjectPickerProps['value']): value is ProjectPickerValue {
  return value !== null && 'code' in value && 'name' in value;
}

/**
 * Selector de proyecto (03 §E.9). Busca con `GET /projects?search=…` (nombre
 * o código), así que sólo ofrece proyectos visibles para el usuario.
 */
export function ProjectPicker({
  label = 'Proyecto',
  value,
  onChange,
  customerId,
  activeOnly = false,
  required,
  disabled,
  error,
  helperText,
  name,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const preselectedId = value && !isComplete(value) ? value.id : undefined;
  const preselected = useProject(preselectedId);
  const selected = useMemo<ProjectPickerValue | null>(() => {
    if (isComplete(value)) return value;
    return preselected.data ? toValue(preselected.data) : null;
  }, [value, preselected.data]);

  const selectedLabel = selected ? projectLabel(selected) : '';
  const effectiveSearch = search === selectedLabel ? '' : search;
  const query = useMemo(
    () => ({
      search: effectiveSearch || undefined,
      customerId,
      active: activeOnly ? 'true' : undefined,
      page: 1,
      pageSize: PICKER_PAGE_SIZE,
      sortBy: 'name',
      sortOrder: 'asc',
    }),
    [effectiveSearch, customerId, activeOnly],
  );
  const projects = useProjects(query, open && !disabled);
  const options = useMemo(() => (projects.data?.data ?? []).map(toValue), [projects.data]);

  let noOptionsText = effectiveSearch ? 'Ningún proyecto coincide' : 'Escribe para buscar';
  if (projects.isError) {
    noOptionsText = `No se pudo buscar proyectos. ${describeApiError(projects.error).message}`;
  }

  return (
    <Autocomplete<ProjectPickerValue>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={selected}
      onChange={(_, project) => onChange(project)}
      inputValue={input}
      onInputChange={(_, text) => setInput(text)}
      options={options}
      filterOptions={(all) => all}
      getOptionLabel={projectLabel}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      loading={projects.isFetching || preselected.isFetching}
      loadingText="Buscando…"
      noOptionsText={noOptionsText}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          name={name}
          label={label}
          required={required}
          error={error || preselected.isError}
          helperText={preselected.isError ? 'No se pudo cargar el proyecto seleccionado.' : helperText}
        />
      )}
    />
  );
}
