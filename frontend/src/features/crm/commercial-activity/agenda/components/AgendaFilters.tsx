import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';

import { CustomerPicker, type CustomerPickerValue } from '@/features/crm/customers';
import { usePermission } from '@/hooks/use-permission';

import type { ActivityTypeOption } from '../../activities/activities.api';
import type { UserRef } from '../../common/commercial-activity.api';
import { COMMERCIAL_RELATED_PERMISSIONS } from '../../common/commercial-activity.permissions';
import { useCountryOptions, useCustomerLookup } from '../../common/commercial-activity.queries';
import { CountrySelect } from '../../common/CountrySelect';
import { formatCalendarDate } from '../../common/date-time';
import { OwnerPicker } from '../../common/OwnerPicker';
import { AGENDA_FILTER_LABELS, STATUS_GROUP_LABELS } from '../agenda-format';
import { AGENDA_STATUS_GROUPS, VISIT_TYPE_FILTER, type AgendaFilterKey, type AgendaFilterValues } from '../agenda.api';

const RANGE_ERROR = 'La fecha "Hasta" no puede ser anterior a "Desde".';

export interface AgendaTypeOptions {
  /** Se ofrece "Visita" (con `visitas.ver`). */
  includeVisit: boolean;
  /** Tipos de actividad del catálogo (con `actividades.ver`). */
  activityTypes: readonly ActivityTypeOption[];
}

export interface AgendaFiltersProps {
  /** Filtros aplicados (los de la URL). */
  values: AgendaFilterValues;
  typeOptions: AgendaTypeOptions;
  /** El listado pide el rango; el calendario lo fija según la vista. */
  showDateRange: boolean;
  ownerName: string | null;
  /** Fija todos los filtros de una vez (una sola navegación); recibe también el asesor elegido, para su chip. */
  onApply: (values: AgendaFilterValues, owner: UserRef | null) => void;
}

function typeLabel(value: string, options: AgendaTypeOptions): string {
  if (value === VISIT_TYPE_FILTER) {
    return 'Visita';
  }
  return options.activityTypes.find((type) => type.id === value)?.label ?? 'Seleccionado';
}

/**
 * Filtros de la agenda (04 §E.2), comunes al calendario y al listado: asesor,
 * país, tipo (Visita + tipos de actividad, un solo selector), estado (grupos de
 * RN-04.35) y cliente; en el listado, además, el rango de fechas. Se escriben
 * en un borrador y se aplican juntos; viven en la URL.
 */
export function AgendaFilters({ values, typeOptions, showDateRange, ownerName, onApply }: AgendaFiltersProps) {
  const [draft, setDraft] = useState<AgendaFilterValues>(values);
  const [owner, setOwner] = useState<UserRef | null>(null);
  const [customer, setCustomer] = useState<CustomerPickerValue | { id: string } | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setDraft(values);
    setOwner(values.ownerId ? { id: values.ownerId, displayName: ownerName ?? 'Asesor seleccionado' } : null);
    setCustomer(values.customerId ? { id: values.customerId } : null);
  }, [values, ownerName]);

  const set = (key: AgendaFilterKey, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const rangeInvalid = showDateRange && Boolean(draft.from && draft.to && draft.to < draft.from);
  const types = [...typeOptions.activityTypes].sort((left, right) => left.sortOrder - right.sortOrder);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rangeInvalid) {
      return;
    }
    onApply({ ...draft, ownerId: owner?.id, customerId: customer?.id }, owner);
  };

  return (
    <Box component="form" role="search" aria-label="Filtros de la agenda" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <OwnerPicker label={AGENDA_FILTER_LABELS.ownerId} value={owner} onChange={setOwner} />
        <CountrySelect label={AGENDA_FILTER_LABELS.countryId} value={draft.countryId ?? ''} onChange={(value) => set('countryId', value)} />
        <TextField select size="small" label={AGENDA_FILTER_LABELS.type} value={draft.type ?? ''} onChange={(event) => set('type', event.target.value)}>
          <MenuItem value="">Todos</MenuItem>
          {typeOptions.includeVisit ? <MenuItem value={VISIT_TYPE_FILTER}>Visita</MenuItem> : null}
          {types.map((type) => (
            <MenuItem key={type.id} value={type.id}>
              {type.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={AGENDA_FILTER_LABELS.statusGroup}
          value={draft.statusGroup ?? ''}
          onChange={(event) => set('statusGroup', event.target.value)}
        >
          <MenuItem value="">Todos</MenuItem>
          {AGENDA_STATUS_GROUPS.map((group) => (
            <MenuItem key={group} value={group}>
              {STATUS_GROUP_LABELS[group]}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <CustomerPicker label={AGENDA_FILTER_LABELS.customerId} value={customer} onChange={setCustomer} />
        </Box>
        {showDateRange ? (
          <>
            <TextField
              type="date"
              size="small"
              label={AGENDA_FILTER_LABELS.from}
              value={draft.from ?? ''}
              onChange={(event) => set('from', event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="date"
              size="small"
              label={AGENDA_FILTER_LABELS.to}
              value={draft.to ?? ''}
              onChange={(event) => set('to', event.target.value)}
              error={rangeInvalid}
              helperText={rangeInvalid ? RANGE_ERROR : undefined}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </>
        ) : null}
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

export interface ActiveAgendaFilterChipsProps {
  /** Filtros activos que se muestran (sin vacíos). */
  values: AgendaFilterValues;
  typeOptions: AgendaTypeOptions;
  ownerName: string | null;
  onRemove: (key: AgendaFilterKey) => void;
  onClear: () => void;
}

/** Chips de los filtros activos, cada uno con su "quitar", y "Limpiar". */
export function ActiveAgendaFilterChips({ values, typeOptions, ownerName, onRemove, onClear }: ActiveAgendaFilterChipsProps) {
  const canListCountries = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewCustomers);
  const countries = useCountryOptions(canListCountries && Boolean(values.countryId));
  const customer = useCustomerLookup(values.customerId);
  const entries = (Object.entries(values) as [AgendaFilterKey, string | undefined][]).filter(
    (entry): entry is [AgendaFilterKey, string] => Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return null;
  }

  const display = (key: AgendaFilterKey, value: string): string => {
    switch (key) {
      case 'ownerId':
        return ownerName ?? 'Seleccionado';
      case 'countryId':
        return countries.data?.find((country) => country.id === value)?.name ?? 'Seleccionado';
      case 'type':
        return typeLabel(value, typeOptions);
      case 'statusGroup':
        return STATUS_GROUP_LABELS[value as keyof typeof STATUS_GROUP_LABELS] ?? value;
      case 'customerId':
        return customer.data?.legalName ?? 'Seleccionado';
      case 'from':
      case 'to':
        return formatCalendarDate(value);
    }
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => (
        <Chip key={key} label={`${AGENDA_FILTER_LABELS[key]}: ${display(key, value)}`} onDelete={() => onRemove(key)} />
      ))}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
