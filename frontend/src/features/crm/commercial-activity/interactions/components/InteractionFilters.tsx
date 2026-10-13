import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';

import { CustomerPicker, type CustomerPickerValue } from '@/features/crm/customers';

import type { ActivityFormOptions } from '../../activities/activities.api';
import type { UserRef } from '../../common/commercial-activity.api';
import { formatCalendarDate } from '../../common/date-time';
import { OwnerPicker } from '../../common/OwnerPicker';
import { VISIT_TYPE_VALUE, type InteractionChipFilter, type InteractionFilterValues, type InteractionFormFilter } from '../interaction-filters';

const LABELS: Record<InteractionChipFilter, string> = {
  from: 'Desde',
  to: 'Hasta',
  customerId: 'Cliente',
  projectId: 'Proyecto',
  opportunityId: 'Oportunidad',
  userId: 'Usuario',
  sourceType: 'Tipo',
  typeId: 'Tipo',
  resultId: 'Resultado',
};

/** Tipos de actividad que cuentan como interacción (RN-04.33): los demás nunca aparecen en el historial. */
function interactionTypes(options: ActivityFormOptions | undefined) {
  return (options?.types ?? []).filter((type) => type.isInteraction);
}

export interface InteractionFiltersProps {
  /** Filtros aplicados (los de la URL); las fechas, `YYYY-MM-DD`. */
  values: InteractionFilterValues;
  /** Tipos de actividad y resultados (`/activities/form-options`); sin ellos sólo se ofrece "Visita". */
  options: ActivityFormOptions | undefined;
  userName: string | null;
  onApply: (values: Partial<Record<InteractionFormFilter, string | undefined>>) => void;
}

/**
 * Filtros del historial (04 §E.5): rango de fechas, cliente, usuario, tipo
 * (Visita o tipo de actividad) y resultado. Se aplican juntos y viven en la URL.
 */
export function InteractionFilters({ values, options, userName, onApply }: InteractionFiltersProps) {
  const [draft, setDraft] = useState<InteractionFilterValues>(values);
  const [user, setUser] = useState<UserRef | null>(null);
  const [customer, setCustomer] = useState<CustomerPickerValue | { id: string } | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setDraft(values);
    setUser(values.userId ? { id: values.userId, displayName: userName ?? 'Usuario seleccionado' } : null);
    setCustomer(values.customerId ? { id: values.customerId } : null);
  }, [values, userName]);

  const set = (key: InteractionFormFilter, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const typeValue = draft.sourceType === VISIT_TYPE_VALUE ? VISIT_TYPE_VALUE : (draft.typeId ?? '');
  const types = interactionTypes(options);
  const knownType = typeValue === '' || typeValue === VISIT_TYPE_VALUE || types.some((type) => type.id === typeValue);
  const results = options?.results ?? [];
  const knownResult = !draft.resultId || results.some((result) => result.id === draft.resultId);
  const invalidRange = Boolean(draft.from && draft.to && draft.to < draft.from);

  const setType = (value: string) =>
    setDraft((current) => ({
      ...current,
      sourceType: value === VISIT_TYPE_VALUE ? VISIT_TYPE_VALUE : '',
      typeId: value === VISIT_TYPE_VALUE ? '' : value,
    }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidRange) {
      return;
    }
    onApply({
      from: draft.from,
      to: draft.to,
      customerId: customer?.id,
      userId: user?.id,
      sourceType: draft.sourceType,
      typeId: draft.typeId,
      resultId: draft.resultId,
    });
  };

  return (
    <Box component="form" role="search" aria-label="Filtros del historial" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <TextField
          type="date"
          size="small"
          label={LABELS.from}
          value={draft.from ?? ''}
          onChange={(event) => set('from', event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="date"
          size="small"
          label={LABELS.to}
          value={draft.to ?? ''}
          onChange={(event) => set('to', event.target.value)}
          error={invalidRange}
          helperText={invalidRange ? 'No puede ser anterior a la fecha desde.' : undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <CustomerPicker label={LABELS.customerId} value={customer} onChange={setCustomer} />
        </Box>
        <OwnerPicker label={LABELS.userId} value={user} onChange={setUser} />
        <TextField select size="small" label={LABELS.typeId} value={typeValue} onChange={(event) => setType(event.target.value)}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value={VISIT_TYPE_VALUE}>Visita</MenuItem>
          {knownType ? null : <MenuItem value={typeValue}>Tipo seleccionado</MenuItem>}
          {types.map((type) => (
            <MenuItem key={type.id} value={type.id}>
              {type.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={LABELS.resultId}
          value={draft.resultId ?? ''}
          onChange={(event) => set('resultId', event.target.value)}
          disabled={!options}
        >
          <MenuItem value="">Todos</MenuItem>
          {knownResult ? null : <MenuItem value={draft.resultId}>Resultado seleccionado</MenuItem>}
          {results.map((result) => (
            <MenuItem key={result.id} value={result.id}>
              {result.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit" disabled={invalidRange}>
          Aplicar filtros
        </Button>
      </Stack>
    </Box>
  );
}

export interface ActiveInteractionFilterChipsProps {
  values: InteractionFilterValues;
  options: ActivityFormOptions | undefined;
  names: { customer: string | null; project: string | null; opportunity: string | null; user: string | null };
  onRemove: (key: InteractionChipFilter) => void;
  onClear: () => void;
}

/** Chips de los filtros activos (incluidos cliente/proyecto/oportunidad llegados por enlace) y "Limpiar". */
export function ActiveInteractionFilterChips({ values, options, names, onRemove, onClear }: ActiveInteractionFilterChipsProps) {
  const entries = (Object.entries(values) as [InteractionChipFilter, string | undefined][]).filter(
    (entry): entry is [InteractionChipFilter, string] => Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return null;
  }

  const display = (key: InteractionChipFilter, value: string): string => {
    switch (key) {
      case 'customerId':
        return names.customer ?? 'Seleccionado';
      case 'projectId':
        return names.project ?? 'Seleccionado';
      case 'opportunityId':
        return names.opportunity ?? 'Seleccionada';
      case 'userId':
        return names.user ?? 'Seleccionado';
      case 'sourceType':
        return value === VISIT_TYPE_VALUE ? 'Visita' : 'Actividad';
      case 'typeId':
        return options?.types.find((type) => type.id === value)?.label ?? 'Seleccionado';
      case 'resultId':
        return options?.results.find((result) => result.id === value)?.label ?? 'Seleccionado';
      default:
        return formatCalendarDate(value);
    }
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => (
        <Chip key={key} label={`${LABELS[key]}: ${display(key, value)}`} onDelete={() => onRemove(key)} />
      ))}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
