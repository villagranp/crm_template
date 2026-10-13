import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';

import type { UserRef } from './commercial-activity.api';
import { useOwnerOptions } from './commercial-activity.queries';

export interface OwnerPickerProps {
  label: string;
  value: UserRef | null;
  onChange: (user: UserRef | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  name?: string;
  /** Usuarios que no se ofrecen (p. ej. los ya añadidos como participantes). */
  excludeIds?: readonly string[];
}

/**
 * Usuario con búsqueda en el servidor (`GET /commercial-activity/owner-options`,
 * D-04.10): sólo ofrece los usuarios activos dentro del alcance del actor. Sirve
 * para el responsable, el filtro de asesor y los participantes internos de
 * visitas y actividades. La asignación la vuelve a validar el backend.
 */
export function OwnerPicker({ label, value, onChange, required, disabled, error, helperText, name, excludeIds }: OwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // Mientras el texto es el del valor elegido no se filtra por él.
  const effectiveSearch = value && search === value.displayName ? '' : search;
  const owners = useOwnerOptions(effectiveSearch, open && !disabled);
  const options = (owners.data?.data ?? []).filter((user) => !excludeIds?.includes(user.id));

  return (
    <Autocomplete<UserRef>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, user) => onChange(user)}
      inputValue={input}
      onInputChange={(_, text) => setInput(text)}
      options={options}
      filterOptions={(all) => all}
      getOptionLabel={(user) => user.displayName}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      loading={owners.isFetching}
      loadingText="Buscando…"
      noOptionsText={owners.isError ? 'No se pudo cargar la lista de usuarios.' : 'Sin resultados'}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} name={name} label={label} required={required} error={error} helperText={helperText} />
      )}
    />
  );
}
