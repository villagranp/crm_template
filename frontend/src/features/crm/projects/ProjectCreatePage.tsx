import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Card, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { EmptyState, RequiredNote } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { ApiError } from '@/services/api/api-error';
import { useAuthStore } from '@/stores/auth.store';

import { FormErrorAlert } from './components/FormErrorAlert';
import { ProjectFilesField } from './components/ProjectFilesField';
import { ProjectFormFields } from './components/ProjectFormFields';
import { stashPendingUploads } from './pending-uploads';
import { emptyProjectValues, projectFormFieldFor, toCreateProjectInput } from './project-form-values';
import { projectDetailPath } from './project-paths';
import type { ProjectFormOptions } from './projects.api';
import { PROJECT_ERROR_MESSAGES, projectFieldErrors, withReference } from './projects.errors';
import { PROJECT_PERMISSIONS } from './projects.permissions';
import { useCreateProject, useProjectFormOptions } from './projects.queries';
import { buildProjectFormSchema, requiredGeneralFields, type ProjectFormValues } from './projects.schemas';

const TITLE = 'Nuevo proyecto';
/** En el alta, un `404` sólo puede venir del cliente (`CustomerReferenceGuard`, RN-03.2). */
const CUSTOMER_NOT_FOUND_MESSAGE = 'El cliente no existe o no está en tu alcance.';

/** Estado de navegación que la ficha muestra como aviso al llegar. */
export interface ProjectCreatedState {
  createdMessage: string;
}

interface CreateFormProps {
  options: ProjectFormOptions;
  canAdminister: boolean;
  initialCustomerId: string | null;
}

function CreateProjectForm({ options, canAdminister, initialCustomerId }: CreateFormProps) {
  const navigate = useNavigate();
  const currentUserName = useAuthStore((state) => state.user?.displayName ?? '');
  const creation = useCreateProject();
  const [files, setFiles] = useState<File[]>([]);
  const required = useMemo(() => requiredGeneralFields(options.requiredFields), [options.requiredFields]);
  const schema = useMemo(
    () => buildProjectFormSchema({ requiredFields: options.requiredFields, ownerDefaultsToActor: true, canChooseOwner: canAdminister }),
    [options.requiredFields, canAdminister],
  );
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...emptyProjectValues(options.countries.map((country) => country.id)),
      customer: initialCustomerId ? { id: initialCustomerId } : null,
    },
  });
  const { setError } = form;

  const error = creation.isError ? creation.error : null;
  useEffect(() => {
    if (!error) {
      return;
    }
    if (error instanceof ApiError && error.isNotFound) {
      setError('customer', { type: 'server', message: CUSTOMER_NOT_FOUND_MESSAGE }, { shouldFocus: true });
      return;
    }
    for (const [apiField, message] of Object.entries(projectFieldErrors(error))) {
      const field = projectFormFieldFor(apiField);
      if (field) {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError]);

  const errorView = error ? describeApiError(error, { ...PROJECT_ERROR_MESSAGES, RESOURCE_NOT_FOUND: CUSTOMER_NOT_FOUND_MESSAGE }) : null;

  const onSubmit = (values: ProjectFormValues) => {
    creation.mutate(toCreateProjectInput(values, canAdminister), {
      onSuccess: (project) => {
        stashPendingUploads(project.id, files);
        const state: ProjectCreatedState = { createdMessage: `Proyecto ${project.code} creado.` };
        // Con archivos en cola se abre la sección Adjuntos, que los sube y muestra su progreso.
        const target = files.length > 0 ? `${projectDetailPath(project.id)}?seccion=adjuntos` : projectDetailPath(project.id);
        navigate(target, { state });
      },
    });
  };

  return (
    <Box
      component="form"
      noValidate
      aria-label={TITLE}
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
      }}
    >
      <RequiredNote />
      {errorView ? (
        <Box sx={{ mb: 2 }}>
          <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} />
        </Box>
      ) : null}

      <ProjectFormFields
        form={form}
        mode="create"
        options={options}
        required={required}
        canAdminister={canAdminister}
        fixedOwnerName={currentUserName}
        isPending={creation.isPending}
      />

      <ProjectFilesField files={files} onChange={setFiles} limits={options.attachments} disabled={creation.isPending} />

      <Stack
        direction={{ xs: 'column-reverse', sm: 'row' }}
        spacing={1}
        justifyContent="flex-end"
        sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}
      >
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => navigate(ROUTE_PATHS.crm.projects.search)}
          disabled={creation.isPending}
          sx={{ borderColor: 'divider' }}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={creation.isPending}>
          {creation.isPending ? 'Guardando…' : 'Crear proyecto'}
        </Button>
      </Stack>
      {creation.isPending ? (
        <Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'right' }}>
          Guardando el proyecto…
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Alta de proyecto (03 §E.3, F-10). Ruta protegida con `proyectos.crear`.
 *
 * Obligatorios de `form-options.requiredFields`; errores del servidor bajo su
 * campo (`details[].field`). Los adjuntos se suben en la ficha tras el `201`
 * (dos pasos): si uno falla, el proyecto queda creado y la sección Adjuntos lo
 * indica. `?customerId=` preselecciona el cliente (p. ej. desde su ficha).
 */
export function ProjectCreatePage() {
  const [searchParams] = useSearchParams();
  const canAdminister = usePermission(PROJECT_PERMISSIONS.administer);
  const options = useProjectFormOptions();

  const header = (
    <PageHeader
      title={TITLE}
      breadcrumbs={crmBreadcrumbs({ label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search }, { label: TITLE })}
    />
  );

  let body;
  if (options.isPending) {
    body = (
      <Stack role="status" aria-label="Cargando el formulario" spacing={2}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
        ))}
      </Stack>
    );
  } else if (options.isError) {
    body = (
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
  } else {
    body = <CreateProjectForm options={options.data} canAdminister={canAdminister} initialCustomerId={searchParams.get('customerId')} />;
  }

  return (
    <>
      {header}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>{body}</CardContent>
      </Card>
    </>
  );
}
