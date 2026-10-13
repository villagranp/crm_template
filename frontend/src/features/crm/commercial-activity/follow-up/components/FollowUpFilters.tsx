import { Box, Button, Chip, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';

import { CustomerPicker, type CustomerPickerValue } from '@/features/crm/customers';

import type { UserRef } from '../../common/commercial-activity.api';
import { useCountryOptions } from '../../common/commercial-activity.queries';
import { CountrySelect } from '../../common/CountrySelect';
import { formatCalendarDate } from '../../common/date-time';
import { OwnerPicker } from '../../common/OwnerPicker';
import type { FollowUpChipFilter, FollowUpFilterValues, FollowUpFormFilter } from '../follow-up-filters';

const LABELS: Record<FollowUpChipFilter, string> = {
  customerId: 'Cliente',
  projectId: 'Proyecto',
  ownerId: 'Asesor',
  countryId: 'País',
  withoutNextAction: 'Sin próxima acción',
  lastInteractionFrom: 'Última interacción desde',
  lastInteractionTo: 'Última interacción hasta',
};

export interface FollowUpFiltersProps {
  /** Filtros aplicados (los de la URL); las fechas, `YYYY-MM-DD`. */
  values: FollowUpFilterValues;
  /** Nombre del asesor filtrado, si se conoce. */
  ownerName: string | null;
  /** Fija todos los filtros del formulario de una vez (una sola navegación). */
  onApply: (values: Partial<Record<FollowUpFormFilter, string | undefined>>) => void;
}

/**
 * Filtros del seguimiento (04 §E.4): cliente, asesor (responsable de la fila),
 * país del cliente, "sin próxima acción" y rango de última interacción. Se
 * escriben en un borrador y se aplican juntos; viven en la URL.
 */
export function FollowUpFilters({ values, ownerName, onApply }: FollowUpFiltersProps) {
  const [draft, setDraft] = useState<FollowUpFilterValues>(values);
  const [owner, setOwner] = useState<UserRef | null>(null);
  const [customer, setCustomer] = useState<CustomerPickerValue | { id: string } | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setDraft(values);
    setOwner(values.ownerId ? { id: values.ownerId, displayName: ownerName ?? 'Asesor seleccionado' } : null);
    setCustomer(values.customerId ? { id: values.customerId } : null);
  }, [values, ownerName]);

  const set = (key: FollowUpFormFilter, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const invalidRange = Boolean(draft.lastInteractionFrom && draft.lastInteractionTo && draft.lastInteractionTo < draft.lastInteractionFrom);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidRange) {
      return;
    }
    onApply({
      customerId: customer?.id,
      ownerId: owner?.id,
      countryId: draft.countryId,
      withoutNextAction: draft.withoutNextAction,
      lastInteractionFrom: draft.lastInteractionFrom,
      lastInteractionTo: draft.lastInteractionTo,
    });
  };

  return (
    <Box component="form" role="search" aria-label="Filtros de seguimiento" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <CustomerPicker label={LABELS.customerId} value={customer} onChange={setCustomer} />
        </Box>
        <OwnerPicker label={LABELS.ownerId} value={owner} onChange={setOwner} />
        <CountrySelect value={draft.countryId ?? ''} onChange={(countryId) => set('countryId', countryId)} />
        <TextField
          type="date"
          size="small"
          label={LABELS.lastInteractionFrom}
          value={draft.lastInteractionFrom ?? ''}
          onChange={(event) => set('lastInteractionFrom', event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="date"
          size="small"
          label={LABELS.lastInteractionTo}
          value={draft.lastInteractionTo ?? ''}
          onChange={(event) => set('lastInteractionTo', event.target.value)}
          error={invalidRange}
          helperText={invalidRange ? 'No puede ser anterior a la fecha desde.' : undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControlLabel
          control={
            <Switch checked={draft.withoutNextAction === 'true'} onChange={(event) => set('withoutNextAction', event.target.checked ? 'true' : '')} />
          }
          label={LABELS.withoutNextAction}
        />
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit" disabled={invalidRange}>
          Aplicar filtros
        </Button>
      </Stack>
    </Box>
  );
}

export interface ActiveFollowUpFilterChipsProps {
  values: FollowUpFilterValues;
  customerName: string | null;
  projectName: string | null;
  ownerName: string | null;
  /** Con `clientes.ver` se resuelve el nombre del país. */
  canListCountries: boolean;
  onRemove: (key: FollowUpChipFilter) => void;
  onClear: () => void;
}

/** Chips de los filtros activos, cada uno con su "quitar", y "Limpiar". */
export function ActiveFollowUpFilterChips({
  values,
  customerName,
  projectName,
  ownerName,
  canListCountries,
  onRemove,
  onClear,
}: ActiveFollowUpFilterChipsProps) {
  const countries = useCountryOptions(canListCountries && Boolean(values.countryId));
  const entries = (Object.entries(values) as [FollowUpChipFilter, string | undefined][]).filter(
    (entry): entry is [FollowUpChipFilter, string] => Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return null;
  }

  const display = (key: FollowUpChipFilter, value: string): string | null => {
    switch (key) {
      case 'customerId':
        return customerName ?? 'Seleccionado';
      case 'projectId':
        return projectName ?? 'Seleccionado';
      case 'ownerId':
        return ownerName ?? 'Seleccionado';
      case 'countryId':
        return countries.data?.find((country) => country.id === value)?.name ?? 'Seleccionado';
      case 'withoutNextAction':
        return null;
      default:
        return formatCalendarDate(value);
    }
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => {
        const shown = display(key, value);
        return <Chip key={key} label={shown === null ? LABELS[key] : `${LABELS[key]}: ${shown}`} onDelete={() => onRemove(key)} />;
      })}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
