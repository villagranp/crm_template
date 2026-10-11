import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { CUSTOMER_FIELD_LABELS } from '../customer-format';
import type { CountryOption, CustomerFilterKey, SalesOwnerOption, StatusOption } from '../customers.api';

import { SalesOwnerPicker } from './SalesOwnerPicker';

/** Filtros del formulario (todo menos `deleted`, que es un interruptor aparte). */
export type CustomerFormFilterKey = Exclude<CustomerFilterKey, 'deleted'>;
export type CustomerFilterValues = Partial<Record<CustomerFormFilterKey, string>>;

const TEXT_FILTERS: readonly { key: CustomerFormFilterKey; label: string; maxLength: number }[] = [
  { key: 'customerCode', label: CUSTOMER_FIELD_LABELS.customerCode, maxLength: 40 },
  { key: 'crmCode', label: CUSTOMER_FIELD_LABELS.crmCode, maxLength: 30 },
  { key: 'legalName', label: CUSTOMER_FIELD_LABELS.legalName, maxLength: 200 },
  { key: 'city', label: CUSTOMER_FIELD_LABELS.city, maxLength: 120 },
];

export interface CustomerFiltersProps {
  /** Filtros aplicados (los de la URL). */
  values: CustomerFilterValues;
  countries: readonly CountryOption[] | undefined;
  statuses: readonly StatusOption[] | undefined;
  /** Nombre del responsable filtrado, si se conoce (para el chip y el selector). */
  salesOwnerName: string | null;
  /** Fija todos los filtros de una vez (una sola navegación). */
  onApply: (values: CustomerFilterValues) => void;
}

/**
 * Filtros combinables de la búsqueda (02 §E.2): se escriben en un borrador y
 * se aplican juntos; viven en la URL.
 */
export function CustomerFilters({ values, countries, statuses, salesOwnerName, onApply }: CustomerFiltersProps) {
  const formId = useId();
  const [draft, setDraft] = useState<CustomerFilterValues>(values);
  const [owner, setOwner] = useState<SalesOwnerOption | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setDraft(values);
    setOwner(
      values.salesOwnerId
        ? { id: values.salesOwnerId, displayName: salesOwnerName ?? 'Responsable seleccionado', employeeCode: null, country: null }
        : null,
    );
  }, [values, salesOwnerName]);

  const set = (key: CustomerFormFilterKey, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({ ...draft, salesOwnerId: owner?.id });
  };

  return (
    <Box
      component="form"
      id={formId}
      role="search"
      aria-label="Filtros de clientes"
      noValidate
      onSubmit={submit}
      sx={{ pt: 2 }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        {TEXT_FILTERS.map((filter) => (
          <TextField
            key={filter.key}
            size="small"
            label={filter.label}
            value={draft[filter.key] ?? ''}
            onChange={(event) => set(filter.key, event.target.value)}
            slotProps={{ htmlInput: { maxLength: filter.maxLength } }}
          />
        ))}
        <TextField
          select
          size="small"
          label={CUSTOMER_FIELD_LABELS.countryId}
          value={draft.countryId ?? ''}
          onChange={(event) => set('countryId', event.target.value)}
          disabled={!countries}
        >
          <MenuItem value="">Todos</MenuItem>
          {(countries ?? []).map((country) => (
            <MenuItem key={country.id} value={country.id}>
              {country.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={CUSTOMER_FIELD_LABELS.statusId}
          value={draft.statusId ?? ''}
          onChange={(event) => set('statusId', event.target.value)}
          disabled={!statuses}
        >
          <MenuItem value="">Todos</MenuItem>
          {(statuses ?? []).map((status) => (
            <MenuItem key={status.id} value={status.id}>
              {status.label}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <SalesOwnerPicker label={CUSTOMER_FIELD_LABELS.salesOwnerId} value={owner} onChange={setOwner} />
        </Box>
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

export interface ActiveFilterChipsProps {
  values: CustomerFilterValues;
  countries: readonly CountryOption[] | undefined;
  statuses: readonly StatusOption[] | undefined;
  salesOwnerName: string | null;
  onRemove: (key: CustomerFormFilterKey) => void;
  onClear: () => void;
}

/** Chips de los filtros activos, cada uno con su "quitar", y "Limpiar". */
export function ActiveFilterChips({ values, countries, statuses, salesOwnerName, onRemove, onClear }: ActiveFilterChipsProps) {
  const entries = (Object.entries(values) as [CustomerFormFilterKey, string | undefined][]).filter(
    (entry): entry is [CustomerFormFilterKey, string] => Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return null;
  }

  const display = (key: CustomerFormFilterKey, value: string): string => {
    switch (key) {
      case 'countryId':
        return countries?.find((country) => country.id === value)?.name ?? 'Seleccionado';
      case 'statusId':
        return statuses?.find((status) => status.id === value)?.label ?? 'Seleccionado';
      case 'salesOwnerId':
        return salesOwnerName ?? 'Seleccionado';
      default:
        return value;
    }
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => {
        const label = `${CUSTOMER_FIELD_LABELS[key]}: ${display(key, value)}`;
        return <Chip key={key} label={label} onDelete={() => onRemove(key)} />;
      })}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
