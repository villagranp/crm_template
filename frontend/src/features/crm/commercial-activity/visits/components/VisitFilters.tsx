import { Box, Button, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import { useId, useState, type FormEvent } from 'react';

import { CustomerPicker, type CustomerPickerValue } from '@/features/crm/customers';

import type { UserRef } from '../../common/commercial-activity.api';
import { useCountryOptions, useCustomerLookup } from '../../common/commercial-activity.queries';
import { CountrySelect } from '../../common/CountrySelect';
import { formatCalendarDate } from '../../common/date-time';
import { OwnerPicker } from '../../common/OwnerPicker';
import { ProjectFilterField, type ProjectFilterValue } from '../../common/ProjectFilterField';
import { useProjectFilterName } from '../../common/use-project-filter-name';
import { useResyncOnChange } from '../../common/use-resync-on-change';
import type { VisitFormOptions } from '../visits.api';

import type { VisitFilterField, VisitFilterValues } from '../visit-format';

export type { VisitFilterField, VisitFilterValues };

const LABELS: Record<VisitFilterField, string> = {
  from: 'Desde',
  to: 'Hasta',
  statusId: 'Estado',
  ownerId: 'Asesor',
  customerId: 'Cliente',
  projectId: 'Proyecto',
  countryId: 'País',
  unregistered: 'Sin registrar',
  pendingConfirmation: 'Pendientes de confirmar',
};

export interface VisitFiltersProps {
  values: VisitFilterValues;
  options: VisitFormOptions | undefined;
  /** Fija todos los filtros de una vez (una sola navegación). */
  onApply: (values: VisitFilterValues) => void;
}

/**
 * Filtros combinables del listado de visitas (04 §E.6): rango de fechas,
 * estado (catálogo `crm.estado_visita`), asesor, cliente, proyecto
 * (`ProjectPicker` de 03, si su módulo está en el menú), país, "sin
 * registrar" (RN-04.22) y "pendientes de confirmar". Se escriben en un
 * borrador y se aplican juntos; viven en la URL.
 */
export function VisitFilters({ values, options, onApply }: VisitFiltersProps) {
  const formId = useId();
  const [draft, setDraft] = useState<VisitFilterValues>(values);
  const [owner, setOwner] = useState<UserRef | { id: string } | null>(values.ownerId ? { id: values.ownerId } : null);
  const [customer, setCustomer] = useState<CustomerPickerValue | { id: string } | null>(values.customerId ? { id: values.customerId } : null);
  const [project, setProject] = useState<ProjectFilterValue>(values.projectId ? { id: values.projectId } : null);

  // La URL manda (atrás/adelante, "Limpiar", un chip quitado), pero sólo si
  // cambian los filtros: un nuevo render con los mismos no borra el borrador.
  useResyncOnChange(values, (applied) => {
    setDraft(applied);
    setOwner(applied.ownerId ? { id: applied.ownerId } : null);
    setCustomer(applied.customerId ? { id: applied.customerId } : null);
    setProject(applied.projectId ? { id: applied.projectId } : null);
  });

  const set = (key: VisitFilterField, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({ ...draft, ownerId: owner?.id, customerId: customer?.id, projectId: project?.id });
  };
  const statuses = [...(options?.statuses ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <Box component="form" id={formId} role="search" aria-label="Filtros de visitas" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <TextField type="date" size="small" label={LABELS.from} value={draft.from ?? ''} onChange={(event) => set('from', event.target.value)} />
        <TextField type="date" size="small" label={LABELS.to} value={draft.to ?? ''} onChange={(event) => set('to', event.target.value)} />
        <TextField select size="small" label={LABELS.statusId} value={draft.statusId ?? ''} onChange={(event) => set('statusId', event.target.value)} disabled={!options}>
          <MenuItem value="">Todos</MenuItem>
          {statuses.map((status) => (
            <MenuItem key={status.id} value={status.id}>
              {status.label}
            </MenuItem>
          ))}
        </TextField>
        <OwnerPicker label={LABELS.ownerId} value={owner} fallbackName="Asesor seleccionado" onChange={setOwner} />
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <CustomerPicker label={LABELS.customerId} value={customer} onChange={setCustomer} />
        </Box>
        <Box sx={{ gridColumn: { sm: 'span 2' }, '&:empty': { display: 'none' } }}>
          <ProjectFilterField label={LABELS.projectId} value={project} onChange={setProject} customerId={customer?.id} />
        </Box>
        <CountrySelect value={draft.countryId ?? ''} onChange={(countryId) => set('countryId', countryId)} />
        <Stack>
          <FormControlLabel
            control={<Switch checked={draft.unregistered === 'true'} onChange={(event) => set('unregistered', event.target.checked ? 'true' : '')} />}
            label={LABELS.unregistered}
          />
          <FormControlLabel
            control={
              <Switch checked={draft.pendingConfirmation === 'true'} onChange={(event) => set('pendingConfirmation', event.target.checked ? 'true' : '')} />
            }
            label={LABELS.pendingConfirmation}
          />
        </Stack>
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

export interface ActiveVisitFilterChipsProps {
  values: VisitFilterValues;
  options: VisitFormOptions | undefined;
  ownerName: string | null;
  /** Para el nombre del país del chip (sólo si se ofrece el filtro). */
  countriesEnabled: boolean;
  onRemove: (key: VisitFilterField) => void;
  onClear: () => void;
}

/** Chips de los filtros activos del listado de visitas, cada uno con su "quitar", y "Limpiar". */
export function ActiveVisitFilterChips({ values, options, ownerName, countriesEnabled, onRemove, onClear }: ActiveVisitFilterChipsProps) {
  const customer = useCustomerLookup(values.customerId);
  const projectName = useProjectFilterName(values.projectId);
  const countries = useCountryOptions(countriesEnabled && Boolean(values.countryId));
  const entries = (Object.entries(values) as [VisitFilterField, string | undefined][]).filter((entry): entry is [VisitFilterField, string] =>
    Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return null;
  }

  const display = (key: VisitFilterField, value: string): string | null => {
    switch (key) {
      case 'statusId':
        return options?.statuses.find((item) => item.id === value)?.label ?? 'Seleccionado';
      case 'ownerId':
        return ownerName ?? 'Seleccionado';
      case 'customerId':
        return customer.data?.legalName ?? 'Seleccionado';
      case 'projectId':
        return projectName ?? 'Seleccionado';
      case 'countryId':
        return countries.data?.find((item) => item.id === value)?.name ?? 'Seleccionado';
      case 'unregistered':
      case 'pendingConfirmation':
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
