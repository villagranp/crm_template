import { Autocomplete, MenuItem, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';
import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { CustomerPicker } from '@/features/crm/customers';

import type { ProjectRef } from './commercial-activity.api';
import { LOOKUP_PAGE_SIZE, useCustomerProjectsLookup, useOpenOpportunities } from './commercial-activity.queries';
import { applyLinkChange, projectLabel, type CommercialLinkChange, type CommercialLinkValue } from './commercial-link';

export interface CustomerProjectFieldsProps {
  value: CommercialLinkValue;
  /** Recibe el vínculo ya limpio (cambiar de cliente vacía proyecto y oportunidad) y qué cambió. */
  onChange: (value: CommercialLinkValue, change: CommercialLinkChange) => void;
  /** Muestra la oportunidad (actividades). Las visitas no la tienen. */
  withOpportunity?: boolean;
  /** El cliente no se puede cambiar (p. ej. edición de una visita): se muestra deshabilitado. */
  customerReadOnly?: boolean;
  /** Texto de ayuda bajo el cliente (p. ej. "Preseleccionado desde la ficha: si lo cambias, …"). */
  customerHelperText?: string;
  /** Errores por campo con los nombres del backend. */
  errors?: Partial<Record<'customerId' | 'projectId' | 'opportunityId', string>>;
  disabled?: boolean;
}

const PROJECT_LABEL = 'Proyecto';
const OPPORTUNITY_LABEL = 'Oportunidad';
const NO_OPPORTUNITY = '';

/**
 * Cliente → proyecto → oportunidad encadenados (04 §E.7, §E.10, RN-04.1). Pinta
 * un campo por fila de rejilla: va dentro de una `FormSection`.
 *
 * - Cliente: `CustomerPicker` del Módulo 2 (sólo clientes visibles y activos).
 * - Proyecto: filtrado por el cliente con `GET /projects?customerId=&search=`
 *   (contrato del Módulo 3). Sin la opción de menú de Proyectos (D-02.10) no se
 *   llama a su API y el campo queda deshabilitado con una explicación; si su API
 *   falla, se avisa y el campo queda vacío sin romper el formulario.
 * - Oportunidad: abiertas del proyecto (`GET /projects/{id}/opportunities?status=OPEN`).
 *
 * El backend vuelve a validar la coherencia (`422 PROJECT_CUSTOMER_MISMATCH`…).
 */
export function CustomerProjectFields({
  value,
  onChange,
  withOpportunity = false,
  customerReadOnly = false,
  customerHelperText,
  errors,
  disabled = false,
}: CustomerProjectFieldsProps) {
  const emit = (change: CommercialLinkChange, next: CommercialLinkValue) => onChange(applyLinkChange(value, change, next), change);

  return (
    <>
      <CustomerPicker
        name="customerId"
        label="Cliente"
        required
        value={value.customer}
        onChange={(customer) => emit('customer', { ...value, customer })}
        disabled={disabled || customerReadOnly}
        error={Boolean(errors?.customerId)}
        helperText={errors?.customerId ?? customerHelperText}
      />
      <ProjectField
        customerId={value.customer?.id ?? null}
        value={value.project}
        onChange={(project) => emit('project', { ...value, project })}
        disabled={disabled}
        error={errors?.projectId}
      />
      {withOpportunity ? (
        <OpportunityField
          projectId={value.project?.id ?? null}
          value={value.opportunity?.id ?? NO_OPPORTUNITY}
          currentCode={value.opportunity?.code ?? null}
          onChange={(opportunity) => emit('opportunity', { ...value, opportunity })}
          disabled={disabled}
          error={errors?.opportunityId}
        />
      ) : null}
    </>
  );
}

interface ProjectFieldProps {
  customerId: string | null;
  value: ProjectRef | null;
  onChange: (project: ProjectRef | null) => void;
  disabled: boolean;
  error?: string;
}

function ProjectField({ customerId, value, onChange, disabled, error }: ProjectFieldProps) {
  const availability = useModuleAvailability(CRM_MODULE_OPTION_KEYS.projects);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const selectedLabel = value ? projectLabel(value) : '';
  const effectiveSearch = search === selectedLabel ? '' : search;
  const query = useMemo(() => ({ search: effectiveSearch || undefined, page: 1, pageSize: LOOKUP_PAGE_SIZE }), [effectiveSearch]);
  const projects = useCustomerProjectsLookup(customerId, query, open && availability.isAvailable && !disabled);
  const options = useMemo<ProjectRef[]>(
    () => (projects.data?.data ?? []).map((project) => ({ id: project.id, code: project.code, name: project.name })),
    [projects.data],
  );

  if (!availability.isAvailable) {
    return (
      <TextField
        name="projectId"
        label={PROJECT_LABEL}
        value={value ? selectedLabel : ''}
        disabled
        error={Boolean(error)}
        helperText={
          error ??
          (availability.isLoading ? 'Comprobando si el módulo de Proyectos está disponible…' : 'Disponible cuando el módulo de Proyectos esté activo.')
        }
      />
    );
  }

  let helperText = error ?? (customerId ? 'Opcional.' : 'Elige primero el cliente.');
  if (!error && projects.isError) {
    helperText = 'No se pudieron cargar los proyectos. Puedes guardar sin proyecto.';
  }

  return (
    <Autocomplete<ProjectRef>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, project) => onChange(project)}
      inputValue={input}
      onInputChange={(_, text) => setInput(text)}
      options={options}
      filterOptions={(all) => all}
      getOptionLabel={projectLabel}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      loading={projects.isFetching}
      loadingText="Buscando…"
      noOptionsText={projects.isError ? 'No se pudieron cargar los proyectos.' : 'Ningún proyecto del cliente coincide'}
      disabled={disabled || !customerId}
      renderInput={(params) => (
        <TextField
          {...params}
          name="projectId"
          label={PROJECT_LABEL}
          error={Boolean(error) || projects.isError}
          helperText={helperText}
        />
      )}
    />
  );
}

interface OpportunityFieldProps {
  projectId: string | null;
  value: string;
  /** Código de la oportunidad elegida, por si ya no está entre las abiertas (edición). */
  currentCode: string | null;
  onChange: (opportunity: { id: string; code: string } | null) => void;
  disabled: boolean;
  error?: string;
}

function OpportunityField({ projectId, value, currentCode, onChange, disabled, error }: OpportunityFieldProps) {
  const opportunities = useOpenOpportunities(projectId, !disabled);
  const options = (opportunities.data?.data ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    label: item.name ? `${item.code} · ${item.name}` : item.code,
  }));
  if (value && currentCode && !options.some((option) => option.id === value)) {
    options.unshift({ id: value, code: currentCode, label: currentCode });
  }

  let helperText = error ?? (projectId ? 'Opcional: sólo oportunidades abiertas del proyecto.' : 'Elige primero el proyecto.');
  if (!error && opportunities.isError) {
    helperText = 'No se pudieron cargar las oportunidades. Puedes guardar sin oportunidad.';
  }

  return (
    <TextField
      select
      name="opportunityId"
      label={OPPORTUNITY_LABEL}
      value={value}
      onChange={(event) => {
        const option = options.find((item) => item.id === event.target.value);
        onChange(option ? { id: option.id, code: option.code } : null);
      }}
      disabled={disabled || !projectId}
      error={Boolean(error) || opportunities.isError}
      helperText={helperText}
    >
      <MenuItem value={NO_OPPORTUNITY}>Sin oportunidad</MenuItem>
      {options.map((option) => (
        <MenuItem key={option.id} value={option.id}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
