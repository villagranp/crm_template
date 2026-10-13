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

import { stashPendingAttachments } from '../common/attachment-owner';
import { COMMERCIAL_ERROR_CODES, COMMERCIAL_ERROR_MESSAGES, withReference } from '../common/commercial-activity.errors';
import { VISIT_PERMISSIONS } from '../common/commercial-activity.permissions';
import { visitDetailPath } from '../common/commercial-paths';
import { FilesField } from '../common/FilesField';
import { useCommercialPreselection } from '../common/use-commercial-preselection';

import { VisitPlanningForm } from './components/VisitPlanningForm';
import type { ScheduleConflict } from './visits.api';
import { useCreateVisit, useVisitFormOptions } from './visits.queries';
import { emptyVisitPlanningValues, toCreateVisitInput, type VisitPlanningValues } from './visits.schemas';

const TITLE = 'Planificar visita';

/** Aviso que el detalle muestra al llegar desde el alta. */
export interface VisitNoticeState {
  notice: string;
  severity: 'success' | 'warning';
  /** Solapes que devolvió el alta (modo `AVISAR`): el detalle los muestra (E.7). */
  scheduleConflicts?: ScheduleConflict[];
}

const CREATE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ...COMMERCIAL_ERROR_MESSAGES,
  [COMMERCIAL_ERROR_CODES.resourceNotFound]: 'El cliente no existe o no está en tu alcance.',
};

/**
 * Planificar visita (04 §E.7, F-26). Ruta protegida con `visitas.crear`.
 *
 * Preselección por query string (`customerId`, `projectId`): lo que no se puede
 * resolver se informa y queda vacío (AC-04.49). Los archivos elegidos se suben
 * en el detalle tras el `201` (patrón D-02.15). Si el alta devuelve
 * `scheduleConflicts`, el detalle los muestra (el aviso previo no impide
 * guardar, RN-04.14).
 */
export function VisitFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canChooseOwner = usePermission(VISIT_PERMISSIONS.administer);
  const currentUser = useAuthStore((state) => state.user);
  const options = useVisitFormOptions();
  const preselectionIds = useMemo(
    () => ({ customerId: searchParams.get('customerId'), projectId: searchParams.get('projectId') }),
    [searchParams],
  );
  const preselection = useCommercialPreselection(preselectionIds);
  const creation = useCreateVisit();
  const [files, setFiles] = useState<File[]>([]);

  const breadcrumbs = crmBreadcrumbs({ label: 'Actividad comercial' }, { label: 'Visitas', to: ROUTE_PATHS.activity.visits }, { label: TITLE });
  const header = <PageHeader title={TITLE} breadcrumbs={breadcrumbs} />;

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

  const onSubmit = (values: VisitPlanningValues) => {
    creation.mutate(toCreateVisitInput(values, canChooseOwner), {
      onSuccess: (created) => {
        stashPendingAttachments({ type: 'visit', visitId: created.id }, files);
        const state: VisitNoticeState = {
          severity: 'success',
          notice: `Visita ${created.code} planificada.`,
          scheduleConflicts: created.scheduleConflicts,
        };
        navigate(visitDetailPath(created.id), { state });
      },
    });
  };

  const errorView = creation.isError ? describeApiError(creation.error, CREATE_ERROR_MESSAGES) : null;
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
          <VisitPlanningForm
            mode="create"
            options={options.data}
            initialValues={emptyVisitPlanningValues(preselection.value)}
            canChooseOwner={canChooseOwner}
            fixedOwnerName={currentUser?.displayName ?? ''}
            currentUserId={currentUser?.id ?? null}
            customerHelperText={
              preselectedCustomer ? 'Preseleccionado. Si lo cambias, se quitarán el proyecto y los contactos invitados.' : undefined
            }
            serverError={creation.error}
            formError={errorView ? <Alert severity="error">{withReference(errorView)}</Alert> : null}
            isPending={creation.isPending}
            submitLabel="Guardar visita"
            onCancel={() => navigate(ROUTE_PATHS.activity.visits)}
            onSubmit={onSubmit}
          >
            <Box sx={{ mt: 3 }}>
              <FormSection number={5} title="Adjuntos" columns={1}>
                <FilesField files={files} onChange={setFiles} disabled={creation.isPending} description="Se suben al guardar la visita." />
              </FormSection>
            </Box>
          </VisitPlanningForm>
        </CardContent>
      </Card>
    </>
  );
}
