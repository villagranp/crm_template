import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Checkbox, FormControlLabel, FormGroup, FormLabel, Stack, TextField, Typography } from '@mui/material';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog, FullRow } from '@/components/data';
import { CustomerPicker } from '@/features/crm/customers';
import { describeApiError } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

import { projectFormFieldFor, toDuplicateInput } from '../project-form-values';
import { PROJECT_FIELD_LABELS } from '../project-format';
import type { ProjectDetail } from '../projects.api';
import { PROJECT_ERROR_MESSAGES, projectFieldErrors } from '../projects.errors';
import { useDuplicateProject } from '../projects.queries';
import { duplicateFormSchema, PROJECT_LIMITS, type DuplicateFormValues } from '../projects.schemas';

import { FormErrorAlert } from './FormErrorAlert';
import { OwnerPicker } from './OwnerPicker';

export interface DuplicateProjectDialogProps {
  open: boolean;
  /** Proyecto de origen. */
  project: ProjectDetail;
  /** `proyectos.administrar`: elegir otro asesor y un código manual (RN-03.20, DM-17). */
  canAdminister: boolean;
  onClose: () => void;
  onDuplicated: (project: ProjectDetail) => void;
}

/** RN-03.23: lo que nunca se copia. */
const NOT_COPIED =
  'No se copian: código, oportunidades (con sus estimaciones y tipos de cambio), etapas, resultados, fase e historial de fase (el nuevo empieza en la fase inicial), forecast, visitas, actividades, adjuntos ni auditoría.';

const NOT_FOUND_MESSAGE = 'El proyecto de origen o el cliente elegido no existe o no está en tu alcance.';

function initialValues(project: ProjectDetail): DuplicateFormValues {
  return {
    name: '',
    customer: { id: project.customer.id, legalName: project.customer.legalName },
    estimatedStartDate: project.estimatedStartDate ?? '',
    estimatedEndDate: project.estimatedEndDate ?? '',
    estimatedDecisionDate: project.estimatedDecisionDate ?? '',
    owner: { id: project.owner.id, displayName: project.owner.displayName, countryId: null, primaryTeam: null },
    code: '',
    copyLocation: true,
    copyDescription: true,
    copyClassification: true,
    copyProducts: false,
  };
}

/** Diálogo "Duplicar proyecto" (03 §E.5, F-12). Al confirmar, navega a la ficha nueva. */
export function DuplicateProjectDialog({ open, project, canAdminister, onClose, onDuplicated }: DuplicateProjectDialogProps) {
  const duplication = useDuplicateProject(project.id);
  const form = useForm<DuplicateFormValues>({ resolver: zodResolver(duplicateFormSchema), defaultValues: initialValues(project) });
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = form;
  const suggestion = `Copia de ${project.name}`.slice(0, PROJECT_LIMITS.name);

  useEffect(() => {
    if (open) {
      reset(initialValues(project));
      duplication.reset();
    }
    // Sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const error = duplication.isError ? duplication.error : null;
  useEffect(() => {
    for (const [apiField, message] of Object.entries(projectFieldErrors(error))) {
      const field = projectFormFieldFor(apiField);
      if (field && field in initialValues(project)) {
        setError(field as keyof DuplicateFormValues, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError, project]);

  const errorView = error
    ? describeApiError(error, { ...PROJECT_ERROR_MESSAGES, ...(error instanceof ApiError && error.isNotFound ? { RESOURCE_NOT_FOUND: NOT_FOUND_MESSAGE } : {}) })
    : null;

  const checkbox = (name: 'copyLocation' | 'copyDescription' | 'copyClassification' | 'copyProducts', label: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormControlLabel
          control={<Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)} disabled={duplication.isPending} />}
          label={label}
        />
      )}
    />
  );

  return (
    <EntityDialog
      open={open}
      onClose={duplication.isPending ? undefined : onClose}
      title="Duplicar proyecto"
      subtitle={`Origen: ${project.code} · ${project.name}`}
      requiredNote
      onSubmit={() =>
        void handleSubmit((values) => duplication.mutate(toDuplicateInput(project, values, canAdminister), { onSuccess: onDuplicated }))()
      }
      actions={<DialogFooter onCancel={onClose} submitLabel={duplication.isPending ? 'Duplicando…' : 'Duplicar'} pending={duplication.isPending} />}
    >
      <Stack spacing={2}>
        {errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <FullRow>
            <TextField
              {...register('name')}
              label="Nombre del proyecto nuevo"
              required
              placeholder={suggestion}
              disabled={duplication.isPending}
              error={Boolean(errors.name)}
              helperText={errors.name?.message ?? `Sugerencia: ${suggestion}`}
              slotProps={{ htmlInput: { maxLength: PROJECT_LIMITS.name } }}
            />
            <Button size="small" variant="text" sx={{ mt: 0.5 }} onClick={() => setValue('name', suggestion, { shouldValidate: true })} disabled={duplication.isPending}>
              Usar la sugerencia
            </Button>
          </FullRow>
          <FullRow>
            <Controller
              control={control}
              name="customer"
              render={({ field }) => (
                <CustomerPicker
                  name="customer"
                  label={PROJECT_FIELD_LABELS.customerId}
                  value={field.value}
                  onChange={field.onChange}
                  required
                  disabled={duplication.isPending}
                  error={Boolean(errors.customer)}
                  helperText={errors.customer?.message ?? 'Por defecto, el del origen.'}
                />
              )}
            />
          </FullRow>
          {(['estimatedStartDate', 'estimatedEndDate', 'estimatedDecisionDate'] as const).map((field) => (
            <TextField
              key={field}
              {...register(field)}
              type="date"
              label={PROJECT_FIELD_LABELS[field]}
              disabled={duplication.isPending}
              error={Boolean(errors[field])}
              helperText={errors[field]?.message}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          ))}
          <Controller
            control={control}
            name="owner"
            render={({ field }) =>
              canAdminister ? (
                <OwnerPicker
                  name="owner"
                  label={PROJECT_FIELD_LABELS.ownerId}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={duplication.isPending}
                  error={Boolean(errors.owner)}
                  helperText={errors.owner?.message ?? 'Por defecto, el del origen.'}
                />
              ) : (
                <TextField label={PROJECT_FIELD_LABELS.ownerId} value="Tú" disabled helperText="El proyecto nuevo queda a tu nombre." />
              )
            }
          />
          {canAdminister ? (
            <TextField
              {...register('code')}
              label="Código manual"
              disabled={duplication.isPending}
              error={Boolean(errors.code)}
              helperText={errors.code?.message ?? 'Opcional. Si lo dejas vacío, se genera uno nuevo.'}
              slotProps={{ htmlInput: { maxLength: PROJECT_LIMITS.code } }}
            />
          ) : null}
        </Box>

        <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
          <FormLabel component="legend">Qué copiar</FormLabel>
          <FormGroup>
            {checkbox('copyLocation', 'Ubicación (país, ciudad, dirección)')}
            {checkbox('copyDescription', 'Descripción')}
            {checkbox('copyClassification', 'Clasificación (el tonelaje se recalcula con la regla vigente)')}
            {checkbox('copyProducts', 'Productos asociados (sin oportunidad, estado inicial)')}
          </FormGroup>
        </Box>

        <Alert severity="info">
          <Typography variant="body2">{NOT_COPIED}</Typography>
        </Alert>
      </Stack>
    </EntityDialog>
  );
}
