import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';

import { CustomerPicker } from '@/features/crm/customers';

import { formatCalendarDate, PROJECT_DATE_FIELD_LABELS, PROJECT_FIELD_LABELS } from '../project-format';
import {
  PROJECT_DATE_FIELDS,
  type OwnerOption,
  type ProjectDateField,
  type ProjectFilterKey,
  type ProjectFormOptions,
} from '../projects.api';
import type { ProjectCustomerValue } from '../projects.schemas';

import { OwnerPicker } from './OwnerPicker';
import { ACTIVE_OPTIONS, filterOptionsFor, joinList, splitList, type FilterOption } from './project-filter-options';

export type ProjectFilterValues = Partial<Record<ProjectFilterKey, string>>;

export interface MultiSelectFilterProps {
  label: string;
  values: string[];
  options: readonly FilterOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}

/** Selector múltiple de un filtro repetible (se envía separado por comas). */
export function MultiSelectFilter({ label, values, options, onChange, disabled }: MultiSelectFilterProps) {
  const labelOf = (value: string) => options.find((option) => option.value === value)?.label ?? 'Seleccionado';
  return (
    <TextField
      select
      size="small"
      label={label}
      value={values}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value as unknown as string[] | string;
        onChange(typeof next === 'string' ? splitList(next) : next);
      }}
      slotProps={{
        select: {
          multiple: true,
          renderValue: (selected) => ((selected as string[]).length > 0 ? (selected as string[]).map(labelOf).join(', ') : 'Todos'),
          displayEmpty: true,
        },
        inputLabel: { shrink: true },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

type MultiKey = 'countryId' | 'projectTypeId' | 'phaseId' | 'stageId' | 'commercialStatus';

export interface ProjectFiltersProps {
  /** Filtros aplicados (los de la URL). */
  values: ProjectFilterValues;
  options: ProjectFormOptions | undefined;
  /** Nombre del asesor filtrado, si se conoce (chip y selector). */
  ownerName: string | null;
  /** Fija todos los filtros de una vez (una sola navegación). */
  onApply: (values: ProjectFilterValues) => void;
}

/**
 * Filtros combinables de la búsqueda (03 §E.2, RN-03.16): se escriben en un
 * borrador y se aplican juntos; viven en la URL con los nombres de la API.
 */
export function ProjectFilters({ values, options, ownerName, onApply }: ProjectFiltersProps) {
  const formId = useId();
  const [draft, setDraft] = useState<ProjectFilterValues>(values);
  const [owner, setOwner] = useState<OwnerOption | null>(null);
  const [customer, setCustomer] = useState<ProjectCustomerValue | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setDraft(values);
    setDateError(null);
    setOwner(values.ownerId ? { id: values.ownerId, displayName: ownerName ?? 'Asesor seleccionado', countryId: null, primaryTeam: null } : null);
    setCustomer(values.customerId ? { id: values.customerId } : null);
  }, [values, ownerName]);

  const set = (key: ProjectFilterKey, value: string | undefined) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: ProjectFilterValues = { ...draft, ownerId: owner?.id, customerId: customer?.id };
    const hasRange = Boolean(next.dateFrom || next.dateTo);
    if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
      setDateError('"Desde" no puede ser posterior a "Hasta".');
      return;
    }
    // RN-03.17: el rango exige campo de fecha; sin rango, el campo no se envía.
    next.dateField = hasRange ? (next.dateField ?? 'estimatedDecisionDate') : undefined;
    setDateError(null);
    onApply(next);
  };

  const multi = (key: MultiKey): ReactNode => (
    <MultiSelectFilter
      key={key}
      label={PROJECT_FIELD_LABELS[key]}
      values={splitList(draft[key])}
      options={filterOptionsFor(key, options)}
      onChange={(selected) => set(key, joinList(selected))}
      disabled={!options}
    />
  );

  return (
    <Box component="form" id={formId} role="search" aria-label="Filtros de proyectos" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        <TextField
          size="small"
          label={PROJECT_FIELD_LABELS.code}
          value={draft.code ?? ''}
          onChange={(event) => set('code', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 30 } }}
        />
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <CustomerPicker label={PROJECT_FIELD_LABELS.customerId} value={customer} onChange={setCustomer} />
        </Box>
        <TextField
          size="small"
          label={PROJECT_FIELD_LABELS.city}
          value={draft.city ?? ''}
          onChange={(event) => set('city', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 120 } }}
        />
        {multi('countryId')}
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <OwnerPicker label={PROJECT_FIELD_LABELS.ownerId} purpose="FILTER" value={owner} onChange={setOwner} />
        </Box>
        {multi('projectTypeId')}
        {multi('phaseId')}
        {multi('stageId')}
        {multi('commercialStatus')}
        <TextField
          select
          size="small"
          label={PROJECT_FIELD_LABELS.active}
          value={draft.active ?? ''}
          onChange={(event) => set('active', event.target.value || undefined)}
        >
          <MenuItem value="">Todos</MenuItem>
          {ACTIVE_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={PROJECT_FIELD_LABELS.dateField}
          value={draft.dateField ?? 'estimatedDecisionDate'}
          onChange={(event) => set('dateField', event.target.value)}
        >
          {PROJECT_DATE_FIELDS.map((field) => (
            <MenuItem key={field} value={field}>
              {PROJECT_DATE_FIELD_LABELS[field]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label={PROJECT_FIELD_LABELS.dateFrom}
          value={draft.dateFrom ?? ''}
          onChange={(event) => set('dateFrom', event.target.value || undefined)}
          error={Boolean(dateError)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={PROJECT_FIELD_LABELS.dateTo}
          value={draft.dateTo ?? ''}
          onChange={(event) => set('dateTo', event.target.value || undefined)}
          error={Boolean(dateError)}
          helperText={dateError ?? undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

export interface ActiveFilterChipsProps {
  values: ProjectFilterValues;
  options: ProjectFormOptions | undefined;
  customerName: string | null;
  ownerName: string | null;
  onRemove: (key: ProjectFilterKey) => void;
  onClear: () => void;
}

/** Chips de los filtros activos (los repetibles, con todos sus valores), cada uno con su "quitar", y "Limpiar". */
export function ActiveFilterChips({ values, options, customerName, ownerName, onRemove, onClear }: ActiveFilterChipsProps) {
  // El campo de fecha va dentro del chip del rango.
  const entries = (Object.entries(values) as [ProjectFilterKey, string | undefined][]).filter(
    (entry): entry is [ProjectFilterKey, string] => Boolean(entry[1]) && entry[0] !== 'dateField',
  );
  if (entries.length === 0) {
    return null;
  }

  const display = (key: ProjectFilterKey, value: string): string => {
    switch (key) {
      case 'customerId':
        return customerName ?? 'Seleccionado';
      case 'ownerId':
        return ownerName ?? 'Seleccionado';
      case 'dateFrom':
      case 'dateTo':
        return `${formatCalendarDate(value)} (${PROJECT_DATE_FIELD_LABELS[(values.dateField ?? 'estimatedDecisionDate') as ProjectDateField] ?? ''})`;
      case 'code':
      case 'city':
        return value;
      default: {
        const choices = filterOptionsFor(key, options);
        return splitList(value)
          .map((item) => choices.find((choice) => choice.value === item)?.label ?? 'Seleccionado')
          .join(', ');
      }
    }
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => (
        <Chip key={key} label={`${PROJECT_FIELD_LABELS[key]}: ${display(key, value)}`} onDelete={() => onRemove(key)} />
      ))}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
