import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Skeleton, Stack } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import { DialogFooter, EmptyState, EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { canEditField, disabledFieldHelp } from '../capabilities';
import { projectFormFieldFor, projectToFormValues, toUpdateProjectInput } from '../project-form-values';
import type { ProjectDetail, ProjectFormOptions } from '../projects.api';
import { PROJECT_ERROR_MESSAGES, projectFieldErrors, withReference } from '../projects.errors';
import { useProjectFormOptions, useUpdateProject } from '../projects.queries';
import { buildProjectFormSchema, requiredGeneralFields, type ProjectFormValues } from '../projects.schemas';

import { FormErrorAlert } from './FormErrorAlert';
import { ProjectFormFields } from './ProjectFormFields';

export interface EditProjectDialogProps {
  open: boolean;
  project: ProjectDetail;
  onClose: () => void;
  onSaved: (project: ProjectDetail) => void;
}

interface EditFormProps extends Omit<EditProjectDialogProps, 'open'> {
  options: ProjectFormOptions;
}

function EditFormBody({ project, options, onClose, onSaved }: EditFormProps) {
  const update = useUpdateProject(project.id);
  const { capabilities } = project;
  const initialValues = useMemo(() => projectToFormValues(project), [project]);
  const schema = useMemo(
    () => buildProjectFormSchema({ requiredFields: options.requiredFields, ownerDefaultsToActor: false, canChooseOwner: capabilities.canAdminister }),
    [options.requiredFields, capabilities.canAdminister],
  );
  const form = useForm<ProjectFormValues>({ resolver: zodResolver(schema), defaultValues: initialValues });
  const { setError, handleSubmit } = form;

  const error = update.isError ? update.error : null;
  useEffect(() => {
    for (const [apiField, message] of Object.entries(projectFieldErrors(error))) {
      const field = projectFormFieldFor(apiField);
      if (field) {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError]);

  const errorView = error ? describeApiError(error, PROJECT_ERROR_MESSAGES) : null;

  const onSubmit = (values: ProjectFormValues) => {
    const input = toUpdateProjectInput(initialValues, values, capabilities);
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }
    update.mutate(input, { onSuccess: onSaved });
  };

  return (
    <Box
      component="form"
      noValidate
      aria-label="Editar proyecto"
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
    >
      {errorView ? (
        <Box sx={{ mb: 2 }}>
          <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} />
        </Box>
      ) : null}
      <ProjectFormFields
        form={form}
        mode="edit"
        options={options}
        required={requiredGeneralFields(options.requiredFields)}
        canAdminister={capabilities.canAdminister}
        isEditable={(field) => canEditField(capabilities, field)}
        disabledHelp={(field) => disabledFieldHelp(capabilities, field)}
        currentCountry={project.country}
        isPending={update.isPending}
      />
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <DialogFooter onCancel={onClose} submitLabel={update.isPending ? 'Guardando…' : 'Guardar cambios'} pending={update.isPending} />
      </Stack>
    </Box>
  );
}

function EditForm({ project, onClose, onSaved }: Omit<EditProjectDialogProps, 'open'>) {
  const options = useProjectFormOptions();

  if (options.isPending) {
    return (
      <Stack role="status" aria-label="Cargando el formulario" spacing={2}>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
        ))}
      </Stack>
    );
  }
  if (options.isError) {
    return (
      <EmptyState
        role="alert"
        title="No se pudo cargar el formulario"
        description={withReference(describeApiError(options.error))}
        action={
          <Button variant="outlined" onClick={() => void options.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }
  return <EditFormBody project={project} options={options.data} onClose={onClose} onSaved={onSaved} />;
}

/**
 * Edición de los datos generales (03 §E.4 #1, F-11): `PATCH /projects/{id}`
 * con sólo lo que cambió. Asesor y código sólo con `capabilities.canAdminister`;
 * los campos no editables se deshabilitan con su explicación.
 */
export function EditProjectDialog({ open, project, onClose, onSaved }: EditProjectDialogProps) {
  return (
    <EntityDialog open={open} onClose={onClose} title="Editar proyecto" subtitle={`${project.code} · ${project.name}`} requiredNote>
      {open ? <EditForm key={project.updatedAt} project={project} onClose={onClose} onSaved={onSaved} /> : null}
    </EntityDialog>
  );
}
