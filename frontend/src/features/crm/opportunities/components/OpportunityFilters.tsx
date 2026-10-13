import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';

import { CustomerPicker, type CustomerPickerValue } from '@/features/crm/customers';
import {
  formatCalendarDate,
  OwnerPicker,
  PROJECT_PERMISSIONS,
  ProjectPicker,
  type OwnerOption,
  type ProjectPickerValue,
} from '@/features/crm/projects';
import { useCan } from '@/hooks/use-permission';

import { OPPORTUNITY_DATE_FIELDS, type OpportunityDateField, type OpportunityFilterKey, type OpportunityFormOptions } from '../opportunities.api';
import { OPPORTUNITY_DATE_FIELD_LABELS, OPPORTUNITY_FIELD_LABELS, STATUS_OPTIONS } from '../opportunity-format';

import { joinList, outcomeChoices, splitList, stageChoices, type Choice } from './opportunity-filter-options';

export type OpportunityFilterValues = Partial<Record<OpportunityFilterKey, string>>;

const CUSTOMER_VIEW_PERMISSION = 'clientes.ver';

function MultiSelect({ label, values, choices, onChange, disabled }: { label: string; values: string[]; choices: readonly Choice[]; onChange: (values: string[]) => void; disabled?: boolean }) {
  const labelOf = (value: string) => choices.find((choice) => choice.value === value)?.label ?? 'Seleccionado';
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
          displayEmpty: true,
          renderValue: (selected) => ((selected as string[]).length > 0 ? (selected as string[]).map(labelOf).join(', ') : 'Todos'),
        },
        inputLabel: { shrink: true },
      }}
    >
      {choices.map((choice) => (
        <MenuItem key={choice.value} value={choice.value}>
          {choice.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

export interface OpportunityFiltersProps {
  values: OpportunityFilterValues;
  options: OpportunityFormOptions | undefined;
  onApply: (values: OpportunityFilterValues) => void;
}

/**
 * Filtros del pipeline (03 §E.7, AC-03.46): etapa, asesor, proyecto, cliente,
 * abiertas/cerradas, resultado y rangos de fecha (de la oportunidad, de la
 * siguiente acción o de la decisión). Se aplican juntos y viven en la URL con
 * los nombres de la API.
 */
export function OpportunityFilters({ values, options, onApply }: OpportunityFiltersProps) {
  const can = useCan();
  const [draft, setDraft] = useState<OpportunityFilterValues>(values);
  const [owner, setOwner] = useState<OwnerOption | null>(null);
  const [project, setProject] = useState<ProjectPickerValue | { id: string } | null>(null);
  const [customer, setCustomer] = useState<CustomerPickerValue | { id: string } | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setDraft(values);
    setRangeError(null);
    setOwner(values.ownerId ? { id: values.ownerId, displayName: 'Asesor seleccionado', countryId: null, primaryTeam: null } : null);
    setProject(values.projectId ? { id: values.projectId } : null);
    setCustomer(values.customerId ? { id: values.customerId } : null);
  }, [values]);

  const set = (key: OpportunityFilterKey, value: string | undefined) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: OpportunityFilterValues = { ...draft, ownerId: owner?.id, projectId: project?.id, customerId: customer?.id };
    if ((next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) || (next.decisionFrom && next.decisionTo && next.decisionFrom > next.decisionTo)) {
      setRangeError('"Desde" no puede ser posterior a "Hasta".');
      return;
    }
    // El rango de fechas exige su campo; sin rango, el campo no se envía.
    next.dateField = next.dateFrom || next.dateTo ? (next.dateField ?? 'opportunityDate') : undefined;
    setRangeError(null);
    onApply(next);
  };

  const dateInput = (key: 'dateFrom' | 'dateTo' | 'decisionFrom' | 'decisionTo') => (
    <TextField
      size="small"
      type="date"
      label={OPPORTUNITY_FIELD_LABELS[key]}
      value={draft[key] ?? ''}
      onChange={(event) => set(key, event.target.value || undefined)}
      error={Boolean(rangeError)}
      helperText={key === 'dateTo' || key === 'decisionTo' ? (rangeError ?? undefined) : undefined}
      slotProps={{ inputLabel: { shrink: true } }}
    />
  );

  return (
    <Box component="form" role="search" aria-label="Filtros de oportunidades" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
        <MultiSelect
          label={OPPORTUNITY_FIELD_LABELS.stageId}
          values={splitList(draft.stageId)}
          choices={stageChoices(options)}
          onChange={(selected) => set('stageId', joinList(selected))}
          disabled={!options}
        />
        <TextField select size="small" label={OPPORTUNITY_FIELD_LABELS.status} value={draft.status ?? ''} onChange={(event) => set('status', event.target.value || undefined)}>
          <MenuItem value="">Todas</MenuItem>
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <MultiSelect
          label={OPPORTUNITY_FIELD_LABELS.outcome}
          values={splitList(draft.outcome)}
          choices={outcomeChoices(options)}
          onChange={(selected) => set('outcome', joinList(selected))}
        />
        {can(PROJECT_PERMISSIONS.view) ? (
          <OwnerPicker label={OPPORTUNITY_FIELD_LABELS.ownerId} purpose="FILTER" value={owner} onChange={setOwner} />
        ) : null}
        {can(PROJECT_PERMISSIONS.view) ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <ProjectPicker label={OPPORTUNITY_FIELD_LABELS.projectId} value={project} onChange={setProject} />
          </Box>
        ) : null}
        {can(CUSTOMER_VIEW_PERMISSION) ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <CustomerPicker label={OPPORTUNITY_FIELD_LABELS.customerId} value={customer} onChange={setCustomer} />
          </Box>
        ) : null}
        <TextField select size="small" label={OPPORTUNITY_FIELD_LABELS.dateField} value={draft.dateField ?? 'opportunityDate'} onChange={(event) => set('dateField', event.target.value)}>
          {OPPORTUNITY_DATE_FIELDS.map((field) => (
            <MenuItem key={field} value={field}>
              {OPPORTUNITY_DATE_FIELD_LABELS[field]}
            </MenuItem>
          ))}
        </TextField>
        {dateInput('dateFrom')}
        {dateInput('dateTo')}
        <Box aria-hidden sx={{ display: { xs: 'none', lg: 'block' } }} />
        {dateInput('decisionFrom')}
        {dateInput('decisionTo')}
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

export interface OpportunityFilterChipsProps {
  values: OpportunityFilterValues;
  options: OpportunityFormOptions | undefined;
  onRemove: (key: OpportunityFilterKey) => void;
  onClear: () => void;
}

/** Chips de los filtros activos, cada uno con su "quitar", y "Limpiar". */
export function OpportunityFilterChips({ values, options, onRemove, onClear }: OpportunityFilterChipsProps) {
  const entries = (Object.entries(values) as [OpportunityFilterKey, string | undefined][]).filter(
    (entry): entry is [OpportunityFilterKey, string] => Boolean(entry[1]) && entry[0] !== 'dateField',
  );
  if (entries.length === 0) {
    return null;
  }
  const display = (key: OpportunityFilterKey, value: string): string => {
    switch (key) {
      case 'stageId':
        return splitList(value)
          .map((id) => stageChoices(options).find((choice) => choice.value === id)?.label ?? 'Seleccionada')
          .join(', ');
      case 'outcome':
        return splitList(value)
          .map((code) => outcomeChoices(options).find((choice) => choice.value === code)?.label ?? code)
          .join(', ');
      case 'status':
        return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
      case 'dateFrom':
      case 'dateTo':
        return `${formatCalendarDate(value)} (${OPPORTUNITY_DATE_FIELD_LABELS[(values.dateField ?? 'opportunityDate') as OpportunityDateField] ?? ''})`;
      case 'decisionFrom':
      case 'decisionTo':
        return formatCalendarDate(value);
      default:
        return 'Seleccionado';
    }
  };
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => (
        <Chip key={key} label={`${OPPORTUNITY_FIELD_LABELS[key]}: ${display(key, value)}`} onDelete={() => onRemove(key)} />
      ))}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
