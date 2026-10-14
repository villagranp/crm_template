import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import { useState, type FormEvent } from 'react';

import { CustomerPicker, type CustomerPickerValue } from '@/features/crm/customers';
import { OpportunityPicker, type OpportunityPickerValue } from '@/features/crm/opportunities';
import { usePermission } from '@/hooks/use-permission';

import type { ActivityFormOptions } from '../../activities/activities.api';
import type { UserRef } from '../../common/commercial-activity.api';
import { COMMERCIAL_RELATED_PERMISSIONS } from '../../common/commercial-activity.permissions';
import { formatCalendarDate } from '../../common/date-time';
import { OwnerPicker } from '../../common/OwnerPicker';
import { ProjectFilterField, type ProjectFilterValue } from '../../common/ProjectFilterField';
import { useResyncOnChange } from '../../common/use-resync-on-change';
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

/** Oportunidad elegida; desde la URL sólo se conoce el id (el selector muestra "Seleccionada"). */
type OpportunityChoice = OpportunityPickerValue | { id: string; code: string } | null;

function opportunityChoice(opportunityId: string | undefined): OpportunityChoice {
  return opportunityId ? { id: opportunityId, code: 'Seleccionada' } : null;
}

export interface InteractionFiltersProps {
  /** Filtros aplicados (los de la URL); las fechas, `YYYY-MM-DD`. */
  values: InteractionFilterValues;
  /** Tipos de actividad y resultados (`/activities/form-options`); sin ellos sólo se ofrece "Visita". */
  options: ActivityFormOptions | undefined;
  onApply: (values: Partial<Record<InteractionFormFilter, string | undefined>>) => void;
}

/**
 * Filtros del historial (04 §E.5): rango de fechas, cliente, proyecto y
 * oportunidad del proyecto (selectores de 03, si su módulo está en el menú y,
 * la oportunidad, con `oportunidades.ver`), usuario, tipo (Visita o tipo de
 * actividad) y resultado. Se aplican juntos y viven en la URL.
 */
export function InteractionFilters({ values, options, onApply }: InteractionFiltersProps) {
  const canViewOpportunities = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewOpportunities);
  const [draft, setDraft] = useState<InteractionFilterValues>(values);
  const [user, setUser] = useState<UserRef | { id: string } | null>(values.userId ? { id: values.userId } : null);
  const [customer, setCustomer] = useState<CustomerPickerValue | { id: string } | null>(values.customerId ? { id: values.customerId } : null);
  const [project, setProject] = useState<ProjectFilterValue>(values.projectId ? { id: values.projectId } : null);
  const [opportunity, setOpportunity] = useState<OpportunityChoice>(opportunityChoice(values.opportunityId));

  // La URL manda (atrás/adelante, "Limpiar", un chip quitado), pero sólo si
  // cambian los filtros: un nuevo render con los mismos no borra el borrador.
  useResyncOnChange(values, (applied) => {
    setDraft(applied);
    setUser(applied.userId ? { id: applied.userId } : null);
    setCustomer(applied.customerId ? { id: applied.customerId } : null);
    setProject(applied.projectId ? { id: applied.projectId } : null);
    setOpportunity(opportunityChoice(applied.opportunityId));
  });
  // La oportunidad es del proyecto: cambiar de proyecto la quita.
  const changeProject = (next: ProjectFilterValue) => {
    if (next?.id !== project?.id) setOpportunity(null);
    setProject(next);
  };

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
      projectId: project?.id,
      opportunityId: project ? opportunity?.id : undefined,
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
        <Box sx={{ gridColumn: { sm: 'span 2' }, '&:empty': { display: 'none' } }}>
          <ProjectFilterField label={LABELS.projectId} value={project} onChange={changeProject} customerId={customer?.id} />
        </Box>
        {project && canViewOpportunities ? (
          <OpportunityPicker label={LABELS.opportunityId} projectId={project.id} value={opportunity} onChange={setOpportunity} />
        ) : null}
        <OwnerPicker label={LABELS.userId} value={user} fallbackName="Usuario seleccionado" onChange={setUser} />
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
