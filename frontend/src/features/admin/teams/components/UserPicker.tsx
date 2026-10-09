import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/features/admin/common';

import type { UserOption } from '../teams.api';
import { useUserSearch } from '../teams.queries';

export interface UserPickerProps {
  label: string;
  value: UserOption | null;
  onChange: (user: UserOption | null) => void;
  /** Ids que no se ofrecen (p. ej. los que ya son miembros). */
  excludeIds?: ReadonlySet<string>;
  disabled?: boolean;
  helperText?: string;
  /** Con `true`, el valor se vacía tras elegir (modo "añadir"). */
  clearOnSelect?: boolean;
}

/** Selector de usuario con búsqueda en el servidor (`GET /users?search=`), con debounce. */
export function UserPicker({ label, value, onChange, excludeIds, disabled, helperText, clearOnSelect }: UserPickerProps) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const users = useUserSearch(search, open && !disabled);
  const options = (users.data ?? []).filter((user) => !excludeIds?.has(user.id));

  return (
    <Autocomplete<UserOption>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={clearOnSelect ? null : value}
      onChange={(_, user) => {
        onChange(user);
        if (clearOnSelect) {
          setInput('');
        }
      }}
      inputValue={input}
      onInputChange={(_, text, reason) => {
        if (reason !== 'reset' || !clearOnSelect) {
          setInput(text);
        }
      }}
      options={options}
      filterOptions={(all) => all}
      getOptionLabel={(user) => user.displayName}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      renderOption={(props, user) => (
        <li {...props} key={user.id}>
          {`${user.displayName} · ${user.email}`}
        </li>
      )}
      loading={users.isFetching}
      loadingText="Buscando…"
      noOptionsText={users.isError ? 'No se pudo buscar usuarios.' : 'Sin resultados'}
      disabled={disabled}
      renderInput={(params) => <TextField {...params} label={label} helperText={helperText} />}
    />
  );
}
