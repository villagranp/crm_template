import { TextField } from '@mui/material';

import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { CustomerPicker } from '@/features/crm/customers';
import { OpportunityPicker } from '@/features/crm/opportunities';
import { ProjectPicker, projectLabel } from '@/features/crm/projects';

import type { OpportunityRef, ProjectRef } from './commercial-activity.api';
import { applyLinkChange, type CommercialLinkChange, type CommercialLinkValue } from './commercial-link';

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

/**
 * Cliente → proyecto → oportunidad encadenados (04 §E.7, §E.10, RN-04.1). Pinta
 * un campo por fila de rejilla: va dentro de una `FormSection`.
 *
 * - Cliente: `CustomerPicker` del Módulo 2 (sólo clientes visibles y activos).
 * - Proyecto: `ProjectPicker` del Módulo 3, filtrado por el cliente
 *   (`GET /projects?customerId=&search=`). Sin la opción de menú de Proyectos
 *   (D-02.10) no se llama a su API y el campo queda deshabilitado con una
 *   explicación; si su API falla, el selector lo avisa y se puede guardar sin proyecto.
 * - Oportunidad: `OpportunityPicker` del Módulo 3 con las abiertas del proyecto
 *   (`GET /projects/{id}/opportunities?status=OPEN`).
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
          value={value.opportunity}
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

  if (!availability.isAvailable) {
    return (
      <TextField
        name="projectId"
        label={PROJECT_LABEL}
        value={value ? projectLabel(value) : ''}
        disabled
        error={Boolean(error)}
        helperText={
          error ??
          (availability.isLoading ? 'Comprobando si el módulo de Proyectos está disponible…' : 'Disponible cuando el módulo de Proyectos esté activo.')
        }
      />
    );
  }

  return (
    <ProjectPicker
      name="projectId"
      label={PROJECT_LABEL}
      value={value}
      onChange={(project) => onChange(project ? { id: project.id, code: project.code, name: project.name } : null)}
      customerId={customerId ?? undefined}
      disabled={disabled || !customerId}
      error={Boolean(error)}
      helperText={error ?? (customerId ? 'Opcional.' : 'Elige primero el cliente.')}
    />
  );
}

interface OpportunityFieldProps {
  projectId: string | null;
  value: OpportunityRef | null;
  onChange: (opportunity: OpportunityRef | null) => void;
  disabled: boolean;
  error?: string;
}

function OpportunityField({ projectId, value, onChange, disabled, error }: OpportunityFieldProps) {
  if (!projectId) {
    return <TextField name="opportunityId" label={OPPORTUNITY_LABEL} value="" disabled error={Boolean(error)} helperText={error ?? 'Elige primero el proyecto.'} />;
  }

  return (
    <OpportunityPicker
      name="opportunityId"
      label={OPPORTUNITY_LABEL}
      projectId={projectId}
      status="OPEN"
      value={value}
      onChange={(opportunity) => onChange(opportunity ? { id: opportunity.id, code: opportunity.code } : null)}
      disabled={disabled}
      error={Boolean(error)}
      helperText={error ?? 'Opcional: sólo oportunidades abiertas del proyecto.'}
    />
  );
}
