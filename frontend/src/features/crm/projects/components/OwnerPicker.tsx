import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';

import type { OwnerOption, OwnerOptionPurpose } from '../projects.api';
import { useOwnerOptions } from '../projects.queries';

export interface OwnerPickerProps {
  label: string;
  value: OwnerOption | null;
  onChange: (owner: OwnerOption | null) => void;
  /**
   * `ASSIGN` (por defecto): asesores que el usuario puede asignar (RN-03.6,
   * D-03.16). `FILTER`: responsables de proyectos visibles, para filtrar.
   */
  purpose?: OwnerOptionPurpose;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  name?: string;
}

/**
 * Asesor responsable con búsqueda en el servidor (`GET /projects/owner-options`,
 * D-03.1): sólo ofrece lo que el backend considera dentro del alcance.
 */
export function OwnerPicker({ label, value, onChange, purpose = 'ASSIGN', required, disabled, error, helperText, name }: OwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // Mientras el texto es el del valor elegido no se filtra por él.
  const effectiveSearch = value && search === value.displayName ? '' : search;
  const owners = useOwnerOptions(effectiveSearch, purpose, open && !disabled);

  return (
    <Autocomplete<OwnerOption>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, owner) => onChange(owner)}
      inputValue={input}
      onInputChange={(_, text) => setInput(text)}
      options={owners.data?.data ?? []}
      filterOptions={(all) => all}
      getOptionLabel={(owner) => owner.displayName}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      renderOption={(props, owner) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <li key={key} {...rest}>
            {owner.primaryTeam ? `${owner.displayName} · ${owner.primaryTeam.name}` : owner.displayName}
          </li>
        );
      }}
      loading={owners.isFetching}
      loadingText="Buscando…"
      noOptionsText={owners.isError ? 'No se pudo cargar la lista de asesores.' : 'Sin resultados'}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} name={name} label={label} required={required} error={error} helperText={helperText} />
      )}
    />
  );
}
