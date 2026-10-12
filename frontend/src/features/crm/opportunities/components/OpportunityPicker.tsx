import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import type { OpportunityListItem } from '../opportunities.api';
import { useProjectOpportunities } from '../opportunities.queries';

/** Lo que recibe el formulario que usa el selector (productos asociados; visitas y actividades del Módulo 4). */
export interface OpportunityPickerValue {
  id: string;
  code: string;
  stageLabel: string;
}

export interface OpportunityPickerProps {
  /** Proyecto cuyas oportunidades se ofrecen (`GET /projects/{projectId}/opportunities`). */
  projectId: string;
  label?: string;
  /** Oportunidad elegida; con solo el código, se muestra tal cual. */
  value: OpportunityPickerValue | { id: string; code: string } | null;
  onChange: (opportunity: OpportunityPickerValue | null) => void;
  /** `OPEN` para vincular solo oportunidades abiertas (Módulo 4, 03 §G.2). */
  status?: 'OPEN' | 'CLOSED';
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  name?: string;
}

const PICKER_PAGE_SIZE = 20;

function toValue(opportunity: OpportunityListItem): OpportunityPickerValue {
  return { id: opportunity.id, code: opportunity.code, stageLabel: opportunity.stage.label };
}

function optionLabel(option: OpportunityPickerValue | { id: string; code: string }): string {
  return 'stageLabel' in option ? `${option.code} · ${option.stageLabel}` : option.code;
}

/**
 * Selector de oportunidad de un proyecto (03 §E.9, §L.3; barril público para el
 * Módulo 4). Busca por código en las oportunidades del proyecto que el usuario
 * puede ver (`oportunidades.ver` sobre el proyecto, E2b #1).
 */
export function OpportunityPicker({
  projectId,
  label = 'Oportunidad',
  value,
  onChange,
  status,
  required,
  disabled,
  error,
  helperText,
  name,
}: OpportunityPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const selectedLabel = value ? optionLabel(value) : '';
  const effectiveSearch = search === selectedLabel ? '' : search;
  const query = useMemo(
    () => ({ search: effectiveSearch || undefined, status, page: 1, pageSize: PICKER_PAGE_SIZE, sortBy: 'code', sortOrder: 'desc' }),
    [effectiveSearch, status],
  );
  const opportunities = useProjectOpportunities(projectId, query, open && !disabled);
  const options = useMemo(() => (opportunities.data?.data ?? []).map(toValue), [opportunities.data]);

  let noOptionsText = effectiveSearch ? 'Ninguna oportunidad coincide' : 'El proyecto no tiene oportunidades';
  if (opportunities.isError) {
    noOptionsText = `No se pudo cargar las oportunidades. ${describeApiError(opportunities.error).message}`;
  }

  return (
    <Autocomplete<OpportunityPickerValue | { id: string; code: string }>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, selected) => onChange(selected && 'stageLabel' in selected ? selected : null)}
      inputValue={input}
      onInputChange={(_, text) => setInput(text)}
      options={options}
      filterOptions={(all) => all}
      getOptionLabel={optionLabel}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      loading={opportunities.isFetching}
      loadingText="Buscando…"
      noOptionsText={noOptionsText}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} name={name} label={label} required={required} error={error} helperText={helperText} />
      )}
    />
  );
}
