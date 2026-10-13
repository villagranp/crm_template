import { Alert, Box, Button, Card, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { EmptyState, FormSection } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { useAuthStore } from '@/stores/auth.store';

import { stashPendingAttachments, commercialAttachmentsPath } from '../common/attachment-owner';
import { COMMERCIAL_ERROR_CODES, COMMERCIAL_ERROR_MESSAGES, withReference } from '../common/commercial-activity.errors';
import { ACTIVITY_PERMISSIONS } from '../common/commercial-activity.permissions';
import { useInvalidateCommercialActivity } from '../common/commercial-activity.queries';
import { FilesField } from '../common/FilesField';
import { uploadFilesInOrder } from '../common/upload-files';
import { useCommercialPreselection } from '../common/use-commercial-preselection';
import { formTimeZone } from '../common/use-commercial-time-zones';

import type { ActivityDetail } from './activities.api';
import { useActivityFormOptions, useCompleteActivity, useCreateActivity } from './activities.queries';
import {
  emptyActivityValues,
  toCompletionInput,
  toCreateActivityInput,
  toCreateWithoutCompletion,
  type ActivityFormValues,
} from './activities.schemas';
import { activityDetailPath } from './activity-format';
import { ActivityForm } from './components/ActivityForm';

const TITLE = 'Nueva actividad';

/** Aviso que el detalle muestra al llegar desde el alta. */
export interface ActivityNoticeState {
  notice: string;
  severity: 'success' | 'warning';
}

const CREATE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ...COMMERCIAL_ERROR_MESSAGES,
  [COMMERCIAL_ERROR_CODES.resourceNotFound]: 'El cliente no existe o no está en tu alcance.',
};

/**
 * Alta de actividad (04 §E.10, F-31 a F-33). Ruta protegida con
 * `actividades.crear`.
 *
 * Preselección por query string (`customerId`, `projectId`, `opportunityId`,
 * `typeId`): lo que no se puede resolver se informa y queda vacío. "Ya
 * realizada" (con `actividades.cerrar`) crea la actividad completada en un paso;
 * si además hay archivos, se crea abierta, se suben y después se completa (los
 * adjuntos sólo se admiten mientras está abierta, E.12). Sin "Ya realizada", los
 * archivos se suben en el detalle después del `201`.
 */
export function ActivityFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canChooseOwner = usePermission(ACTIVITY_PERMISSIONS.administer);
  const canClose = usePermission(ACTIVITY_PERMISSIONS.close);
  const currentUserName = useAuthStore((state) => state.user?.displayName ?? '');
  const options = useActivityFormOptions();
  const preselectionIds = useMemo(
    () => ({
      customerId: searchParams.get('customerId'),
      projectId: searchParams.get('projectId'),
      opportunityId: searchParams.get('opportunityId'),
    }),
    [searchParams],
  );
  const preselection = useCommercialPreselection(preselectionIds);
  const presetTypeId = searchParams.get('typeId');

  const creation = useCreateActivity();
  const invalidateModule = useInvalidateCommercialActivity();
  const completion = useCompleteActivity();
  const [files, setFiles] = useState<File[]>([]);
  const [stepping, setStepping] = useState(false);

  const breadcrumbs = crmBreadcrumbs(
    { label: 'Actividad comercial' },
    { label: 'Actividades', to: ROUTE_PATHS.activity.activities },
    { label: TITLE },
  );
  const header = <PageHeader title={TITLE} breadcrumbs={breadcrumbs} />;

  const goToDetail = (activity: ActivityDetail, state: ActivityNoticeState) => navigate(activityDetailPath(activity.id), { state });

  if (options.isPending || preselection.isResolving) {
    return (
      <>
        {header}
        <Card>
          <CardContent>
            <Stack role="status" aria-label="Cargando el formulario" spacing={2}>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      </>
    );
  }

  if (options.isError) {
    return (
      <>
        {header}
        <Card>
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
        </Card>
      </>
    );
  }

  const optionsData = options.data;
  const timeZone = formTimeZone(optionsData);
  const typeOf = (typeId: string) => optionsData.types.find((type) => type.id === typeId);

  /** "Ya realizada" con archivos: crear abierta → subir → completar. */
  const createUploadAndComplete = async (values: ActivityFormValues) => {
    setStepping(true);
    try {
      const created = await creation.mutateAsync(toCreateWithoutCompletion(values, typeOf(values.typeId), canChooseOwner, timeZone));
      const upload = await uploadFilesInOrder(commercialAttachmentsPath({ type: 'activity', activityId: created.id }), files, optionsData.attachments);
      if (upload.uploaded.length > 0) {
        // `attachmentCount` del detalle recién guardado en caché y de listas y agenda.
        void invalidateModule();
      }
      if (upload.failure) {
        goToDetail(created, {
          severity: 'warning',
          notice: `Actividad ${created.code} creada, pero «${upload.failure.file.name}» no se subió: ${upload.failure.message} No se completó: complétala desde aquí.`,
        });
        return;
      }
      try {
        const completed = await completion.mutateAsync({ activityId: created.id, input: toCompletionInput(values, timeZone) });
        goToDetail(completed, { severity: 'success', notice: `Actividad ${completed.code} registrada como realizada.` });
      } catch (error) {
        goToDetail(created, {
          severity: 'warning',
          notice: `Actividad ${created.code} creada con sus archivos, pero no se pudo completar. ${withReference(describeApiError(error, COMMERCIAL_ERROR_MESSAGES))}`,
        });
      }
    } catch {
      // El error del alta lo muestra el formulario (`creation.error`).
    } finally {
      setStepping(false);
    }
  };

  const onSubmit = (values: ActivityFormValues) => {
    if (values.alreadyDone && files.length > 0) {
      void createUploadAndComplete(values);
      return;
    }
    creation.mutate(toCreateActivityInput(values, typeOf(values.typeId), canChooseOwner, timeZone), {
      onSuccess: (created) => {
        stashPendingAttachments({ type: 'activity', activityId: created.id }, files);
        goToDetail(created, {
          severity: 'success',
          notice: values.alreadyDone ? `Actividad ${created.code} registrada como realizada.` : `Actividad ${created.code} creada.`,
        });
      },
    });
  };

  const errorView = creation.isError ? describeApiError(creation.error, CREATE_ERROR_MESSAGES) : null;
  const isPending = creation.isPending || completion.isPending || stepping;
  const preselectedCustomer = preselection.value.customer !== null;

  return (
    <>
      {header}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {preselection.problems.length > 0 ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
                {preselection.problems.map((problem) => (
                  <Typography key={problem} component="li" variant="body2">
                    {problem}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          ) : null}
          <ActivityForm
            mode="create"
            options={optionsData}
            initialValues={emptyActivityValues(optionsData, { typeId: presetTypeId, link: preselection.value })}
            canChooseOwner={canChooseOwner}
            fixedOwnerName={currentUserName}
            canCompleteOnCreate={canClose}
            customerHelperText={
              preselectedCustomer ? 'Preseleccionado. Si lo cambias, se quitarán el proyecto, la oportunidad y los contactos elegidos.' : undefined
            }
            serverError={creation.error}
            formError={errorView ? <Alert severity="error">{withReference(errorView)}</Alert> : null}
            isPending={isPending}
            submitLabel="Crear actividad"
            onCancel={() => navigate(ROUTE_PATHS.activity.activities)}
            onSubmit={onSubmit}
          >
            <Box sx={{ mt: 3 }}>
              <FormSection title="Adjuntos" columns={1}>
                <FilesField
                  files={files}
                  onChange={setFiles}
                  limits={optionsData.attachments}
                  disabled={isPending}
                  description="Se suben al guardar la actividad (con «Ya realizada», antes de completarla)."
                />
              </FormSection>
            </Box>
          </ActivityForm>
        </CardContent>
      </Card>
    </>
  );
}
