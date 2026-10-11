import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';

import type { SalesOwnerOption } from '../customers.api';
import { useSalesOwnerOptions } from '../customers.queries';

export interface SalesOwnerPickerProps {
  label: string;
  value: SalesOwnerOption | null;
  onChange: (owner: SalesOwnerOption | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  /** Nombre del campo para el formulario (accesibilidad y pruebas). */
  name?: string;
}

/**
 * Responsable de ventas con búsqueda en el servidor
 * (`GET /customers/sales-owner-options`, D-02.2): sólo ofrece los usuarios que
 * el backend considera asignables por este usuario.
 */
export function SalesOwnerPicker({ label, value, onChange, required, disabled, error, helperText, name }: SalesOwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // Mientras el texto es el del valor elegido no se filtra por él.
  const effectiveSearch = value && search === value.displayName ? '' : search;
  const owners = useSalesOwnerOptions(effectiveSearch, open && !disabled);

  return (
    <Autocomplete<SalesOwnerOption>
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
        const extra = [owner.employeeCode, owner.country?.name].filter(Boolean).join(' · ');
        return (
          <li key={key} {...rest}>
            {extra ? `${owner.displayName} · ${extra}` : owner.displayName}
          </li>
        );
      }}
      loading={owners.isFetching}
      loadingText="Buscando…"
      noOptionsText={owners.isError ? 'No se pudo cargar la lista de responsables.' : 'Sin resultados'}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} name={name} label={label} required={required} error={error} helperText={helperText} />
      )}
    />
  );
}
