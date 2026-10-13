import { Box, Button, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { CustomerPicker, type CustomerPickerValue } from '@/features/crm/customers';

import type { UserRef } from '../../common/commercial-activity.api';
import { useCustomerLookup } from '../../common/commercial-activity.queries';
import { formatCalendarDate } from '../../common/date-time';
import { OwnerPicker } from '../../common/OwnerPicker';
import type { ActivityFormOptions } from '../activities.api';

/** Filtros que puede ofrecer una pantalla de actividades (los nombres son los de la API). */
export type ActivityFilterField =
  | 'typeId'
  | 'statusId'
  | 'priorityId'
  | 'ownerId'
  | 'customerId'
  | 'scheduledFrom'
  | 'scheduledTo'
  | 'dueFrom'
  | 'dueTo'
  | 'overdue';

export type ActivityFilterValues = Partial<Record<ActivityFilterField, string>>;

const ACTIVITY_FILTER_LABELS: Record<ActivityFilterField, string> = {
  typeId: 'Tipo',
  statusId: 'Estado',
  priorityId: 'Prioridad',
  ownerId: 'Asesor',
  customerId: 'Cliente',
  scheduledFrom: 'Fecha desde',
  scheduledTo: 'Fecha hasta',
  dueFrom: 'Vence desde',
  dueTo: 'Vence hasta',
  overdue: 'Solo vencidas',
};

export interface ActivityFiltersProps {
  /** Filtros que ofrece la pantalla, en orden. */
  fields: readonly ActivityFilterField[];
  /** Filtros aplicados (los de la URL). Las fechas van como `YYYY-MM-DD`. */
  values: ActivityFilterValues;
  options: ActivityFormOptions | undefined;
  /** Nombre del asesor filtrado, si se conoce (para el selector y el chip). */
  ownerName: string | null;
  /** Fija todos los filtros de una vez (una sola navegación). */
  onApply: (values: ActivityFilterValues) => void;
  /** Nombre accesible del formulario. */
  label: string;
}

const DATE_FIELDS: readonly ActivityFilterField[] = ['scheduledFrom', 'scheduledTo', 'dueFrom', 'dueTo'];

/**
 * Filtros combinables de las listas de actividades (04 §E.3, §E.9): se escriben
 * en un borrador y se aplican juntos; viven en la URL. Tipos, estados y
 * prioridades salen de `form-options`; asesores de `owner-options`.
 */
export function ActivityFilters({ fields, values, options, ownerName, onApply, label }: ActivityFiltersProps) {
  const formId = useId();
  const [draft, setDraft] = useState<ActivityFilterValues>(values);
  const [owner, setOwner] = useState<UserRef | null>(null);
  const [customer, setCustomer] = useState<CustomerPickerValue | { id: string } | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setDraft(values);
    setOwner(values.ownerId ? { id: values.ownerId, displayName: ownerName ?? 'Asesor seleccionado' } : null);
    setCustomer(values.customerId ? { id: values.customerId } : null);
  }, [values, ownerName]);

  const set = (key: ActivityFilterField, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const has = (field: ActivityFilterField) => fields.includes(field);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({ ...draft, ownerId: owner?.id, customerId: customer?.id });
  };

  const catalogSelect = (field: 'typeId' | 'statusId' | 'priorityId', items: readonly { id: string; label: string }[] | undefined) => (
    <TextField
      key={field}
      select
      size="small"
      label={ACTIVITY_FILTER_LABELS[field]}
      value={draft[field] ?? ''}
      onChange={(event) => set(field, event.target.value)}
      disabled={!items}
    >
      <MenuItem value="">Todos</MenuItem>
      {(items ?? []).map((item) => (
        <MenuItem key={item.id} value={item.id}>
          {item.label}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Box component="form" id={formId} role="search" aria-label={label} noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        {has('typeId') ? catalogSelect('typeId', options?.types) : null}
        {has('statusId') ? catalogSelect('statusId', options?.statuses) : null}
        {has('priorityId') ? catalogSelect('priorityId', options?.priorities) : null}
        {has('ownerId') ? <OwnerPicker label={ACTIVITY_FILTER_LABELS.ownerId} value={owner} onChange={setOwner} /> : null}
        {has('customerId') ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <CustomerPicker label={ACTIVITY_FILTER_LABELS.customerId} value={customer} onChange={setCustomer} />
          </Box>
        ) : null}
        {DATE_FIELDS.filter(has).map((field) => (
          <TextField
            key={field}
            type="date"
            size="small"
            label={ACTIVITY_FILTER_LABELS[field]}
            value={draft[field] ?? ''}
            onChange={(event) => set(field, event.target.value)}
          />
        ))}
        {has('overdue') ? (
          <FormControlLabel
            control={<Switch checked={draft.overdue === 'true'} onChange={(event) => set('overdue', event.target.checked ? 'true' : '')} />}
            label={ACTIVITY_FILTER_LABELS.overdue}
          />
        ) : null}
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

export interface ActiveActivityFilterChipsProps {
  values: ActivityFilterValues;
  options: ActivityFormOptions | undefined;
  ownerName: string | null;
  onRemove: (key: ActivityFilterField) => void;
  onClear: () => void;
}

/** Chips de los filtros activos, cada uno con su "quitar", y "Limpiar". */
export function ActiveActivityFilterChips({ values, options, ownerName, onRemove, onClear }: ActiveActivityFilterChipsProps) {
  const customer = useCustomerLookup(values.customerId);
  const entries = (Object.entries(values) as [ActivityFilterField, string | undefined][]).filter(
    (entry): entry is [ActivityFilterField, string] => Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return null;
  }

  const display = (key: ActivityFilterField, value: string): string | null => {
    switch (key) {
      case 'typeId':
        return options?.types.find((item) => item.id === value)?.label ?? 'Seleccionado';
      case 'statusId':
        return options?.statuses.find((item) => item.id === value)?.label ?? 'Seleccionado';
      case 'priorityId':
        return options?.priorities.find((item) => item.id === value)?.label ?? 'Seleccionada';
      case 'ownerId':
        return ownerName ?? 'Seleccionado';
      case 'customerId':
        return customer.data?.legalName ?? 'Seleccionado';
      case 'overdue':
        return null;
      default:
        return formatCalendarDate(value);
    }
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => {
        const shown = display(key, value);
        const chipLabel = shown === null ? ACTIVITY_FILTER_LABELS[key] : `${ACTIVITY_FILTER_LABELS[key]}: ${shown}`;
        return <Chip key={key} label={chipLabel} onDelete={() => onRemove(key)} />;
      })}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
