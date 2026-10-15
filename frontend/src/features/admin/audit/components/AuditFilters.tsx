import SearchIcon from '@mui/icons-material/Search';
import {
  Autocomplete,
  Box,
  Button,
  createFilterOptions,
  InputAdornment,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';

import type { AuditFilterKey } from '../audit.api';
import { KNOWN_RESOURCE_TYPES, RESOURCE_TYPE_LABEL } from '../audit-format';

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
  { key: 'resourceId', label: 'Registro' },
  { key: 'correlationId', label: 'Correlación' },
];

/** Mismo patrón que el backend para `field` (07 F.6): 1–100 caracteres `[A-Za-z0-9_.]`. */
const FIELD_PATTERN = /^[A-Za-z0-9_.]{1,100}$/;

/** Busca el tipo por su etiqueta ("cliente") o por su código ("crm.customer"). */
const filterResourceTypes = createFilterOptions<string>({
  stringify: (type) => `${RESOURCE_TYPE_LABEL[type] ?? ''} ${type}`,
  ignoreAccents: true,
});

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
    onApply({ ...draft, field: draft.field?.trim() ?? '' });
  };

  const dateError = Boolean(draft.from && draft.to && draft.from > draft.to);
  const fieldValue = draft.field?.trim() ?? '';
  const fieldError = fieldValue !== '' && !FIELD_PATTERN.test(fieldValue);
  const entityLabel = draft.resourceType ? RESOURCE_TYPE_LABEL[draft.resourceType] : undefined;

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
        <Autocomplete
          freeSolo
          size="small"
          options={KNOWN_RESOURCE_TYPES}
          filterOptions={filterResourceTypes}
          value={draft.resourceType ?? ''}
          onChange={(_, next) => set('resourceType', next)}
          onInputChange={(_, next) => set('resourceType', next)}
          renderOption={(props, type) => {
            const { key, ...optionProps } = props;
            return (
              <Box component="li" key={key} {...optionProps}>
                <Stack sx={{ minWidth: 0 }}>
                  <span>{RESOURCE_TYPE_LABEL[type] ?? type}</span>
                  <Box
                    component="span"
                    sx={{ typography: 'caption', color: 'text.secondary', overflowWrap: 'anywhere' }}
                  >
                    {type}
                  </Box>
                </Stack>
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Entidad"
              helperText={entityLabel ?? 'Elige un tipo o escribe uno (p. ej. crm.customer).'}
            />
          )}
        />
        <TextField
          label="Campo"
          size="small"
          value={draft.field ?? ''}
          onChange={(event) => set('field', event.target.value)}
          error={fieldError}
          helperText={
            fieldError
              ? 'Sólo letras, dígitos, punto y guion bajo (máx. 100).'
              : 'Nombre del campo cambiado, p. ej. phaseId.'
          }
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
        <Button type="submit" variant="contained" disabled={dateError || fieldError}>
          Aplicar
        </Button>
      </Stack>
    </Box>
  );
}
