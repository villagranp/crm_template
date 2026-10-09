import SearchIcon from '@mui/icons-material/Search';
import { Autocomplete, Box, Button, InputAdornment, Stack, TextField } from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';

import type { AuditFilterKey } from '../audit.api';

export type AuditFilterValues = Partial<Record<AuditFilterKey, string>>;

export interface AuditFiltersProps {
  /** Filtros aplicados (los de la URL). */
  value: AuditFilterValues;
  /** Valor inmediato de la búsqueda por actor (con debounce en la página). */
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  eventOptions: readonly string[];
  onApply: (filters: AuditFilterValues) => void;
  onClear: () => void;
}

const TEXT_FILTERS: readonly { key: AuditFilterKey; label: string }[] = [
  { key: 'resourceType', label: 'Tipo de recurso' },
  { key: 'resourceId', label: 'Id del recurso' },
  { key: 'correlationId', label: 'Correlación' },
];

/**
 * Filtros de la bitácora. La búsqueda por actor se aplica al escribir (con
 * debounce); el resto, al pulsar «Aplicar», para no lanzar una consulta por
 * cada tecla en campos de identificadores.
 */
export function AuditFilters({
  value,
  searchInput,
  onSearchInputChange,
  eventOptions,
  onApply,
  onClear,
}: AuditFiltersProps) {
  const [draft, setDraft] = useState<AuditFilterValues>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const set = (key: AuditFilterKey, next: string | null) =>
    setDraft((previous) => ({ ...previous, [key]: next ?? '' }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onApply(draft);
  };

  const dateError = Boolean(draft.from && draft.to && draft.from > draft.to);

  return (
    <Box
      component="form"
      role="search"
      aria-label="Filtros de auditoría"
      noValidate
      onSubmit={submit}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        <TextField
          label="Actor"
          placeholder="Correo o identificador"
          size="small"
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Autocomplete
          freeSolo
          size="small"
          options={eventOptions}
          value={draft.event ?? ''}
          onChange={(_, next) => set('event', next)}
          onInputChange={(_, next) => set('event', next)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Evento"
              helperText="Termina en «.» para filtrar por prefijo (p. ej. auth.)"
            />
          )}
        />
        {TEXT_FILTERS.map((filter) => (
          <TextField
            key={filter.key}
            label={filter.label}
            size="small"
            value={draft[filter.key] ?? ''}
            onChange={(event) => set(filter.key, event.target.value)}
          />
        ))}
        <TextField
          label="Desde"
          type="date"
          size="small"
          value={draft.from ?? ''}
          onChange={(event) => set('from', event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Hasta"
          type="date"
          size="small"
          value={draft.to ?? ''}
          onChange={(event) => set('to', event.target.value)}
          error={dateError}
          helperText={dateError ? 'Debe ser igual o posterior a «Desde».' : undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={onClear}
          sx={{ borderColor: 'divider' }}
        >
          Limpiar filtros
        </Button>
        <Button type="submit" variant="contained" disabled={dateError}>
          Aplicar
        </Button>
      </Stack>
    </Box>
  );
}
