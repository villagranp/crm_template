import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { Alert, Button, Card, CardContent, Link, Skeleton, Stack } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog, DetailList, DetailSection, EmptyState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { customerDetailPath } from '@/features/crm/customers';
import { projectDetailPath } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/use-permission';

import { AttachmentsPanel } from '../common/AttachmentsPanel';
import { COMMERCIAL_ERROR_MESSAGES, isNotFoundError, withReference } from '../common/commercial-activity.errors';
import { ACTIVITY_PERMISSIONS } from '../common/commercial-activity.permissions';
import { formatCalendarDate, formatDateTime, formatMinutes } from '../common/date-time';
import { DueBadge } from '../common/DueBadge';
import { participantLabel, participantValuesFrom, PARTICIPANT_KIND_LABELS } from '../common/participants';
import { StatusChip } from '../common/StatusChip';
import { formTimeZone, useCommercialTimeZones } from '../common/use-commercial-time-zones';

import type { ActivityDetail, ActivitySpecificField } from './activities.api';
import { useActivity, useActivityFormOptions, useDeleteActivity, useUpdateActivity } from './activities.queries';
import { activityValuesFrom, allowedSpecificFields, toUpdateActivityInput, type ActivityFormValues } from './activities.schemas';
import type { ActivityNoticeState } from './ActivityFormPage';
import { ACTIVITY_FIELD_LABELS, ACTIVITY_FIELD_TEXT } from './activity-format';
import { ActivityCancelDialog } from './components/ActivityCancelDialog';
import { ActivityCompletionDialog } from './components/ActivityCompletionDialog';
import { ActivityForm } from './components/ActivityForm';
import { ActivityTypeLabel } from './components/ActivityTypeLabel';

function isNoticeState(state: unknown): state is ActivityNoticeState {
  return typeof state === 'object' && state !== null && typeof (state as ActivityNoticeState).notice === 'string';
}

function byWhen(user: { displayName: string } | null, at: string, timeZone: string | undefined): string {
  return user ? `${user.displayName} · ${formatDateTime(at, timeZone)}` : formatDateTime(at, timeZone);
}

function textOrDash(value: string | null | undefined): string {
  return value?.trim() ? value : '—';
}

/** Valor de un campo específico para la ficha. */
function specificValue(activity: ActivityDetail, field: ActivitySpecificField, timeZone: string | undefined) {
  switch (field) {
    case 'scheduledAt':
      return formatDateTime(activity.scheduledAt, timeZone);
    case 'durationMinutes':
      return formatMinutes(activity.durationMinutes);
    case 'participants': {
      const participants = participantValuesFrom(activity.participants);
      return participants.length > 0
        ? participants.map((participant) => `${participantLabel(participant)} (${PARTICIPANT_KIND_LABELS[participant.kind].toLowerCase()})`).join(', ')
        : '—';
    }
    case 'summary':
      return textOrDash(activity.summary);
    case 'resultId':
      return textOrDash(activity.result?.label);
    case 'resultNotes':
      return textOrDash(activity.resultNotes);
    case 'nextAction':
      return textOrDash(activity.nextAction);
    default:
      return formatCalendarDate(activity.nextActionDate);
  }
}

const WIDE_FIELDS: readonly ActivitySpecificField[] = ['participants', 'summary', 'resultNotes'];

/**
 * Detalle y edición de una actividad (04 §E.10, F-30, F-33). Ruta protegida con
 * `actividades.ver`. Las acciones (editar, completar, cancelar, eliminar) salen
 * de `allowedActions`, que el backend calcula con la misma política que aplica
 * (estado, permisos y propiedad); ocultarlas es experiencia de usuario.
 */
export function ActivityDetailPage() {
  const { activityId = '' } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const canChooseOwner = usePermission(ACTIVITY_PERMISSIONS.administer);
  const currentUserName = useAuthStore((state) => state.user?.displayName ?? '');
  const activity = useActivity(activityId);
  const [editing, setEditing] = useState(false);
  // Siempre: el formulario de edición y los límites de adjuntos (`attachments`) salen de aquí.
  const options = useActivityFormOptions();
  const { timeZone } = useCommercialTimeZones();
  const update = useUpdateActivity(activityId);
  const removal = useDeleteActivity(activityId);
  const [dialog, setDialog] = useState<'complete' | 'cancel' | 'delete' | null>(null);
  const [notice, setNotice] = useState<ActivityNoticeState | null>(isNoticeState(location.state) ? location.state : null);

  const breadcrumbs = crmBreadcrumbs(
    { label: 'Actividad comercial' },
    { label: 'Actividades', to: ROUTE_PATHS.activity.activities },
    { label: 'Detalle' },
  );

  if (activity.isPending) {
    return (
      <>
        <PageHeader title="Actividad" breadcrumbs={breadcrumbs} />
        <Card>
          <Stack role="status" aria-label="Cargando la actividad" spacing={1.5} sx={{ p: 3 }}>
            <Skeleton variant="text" sx={{ width: '40%' }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="text" />
            ))}
          </Stack>
        </Card>
      </>
    );
  }

  if (activity.isError) {
    return (
      <>
        <PageHeader title="Actividad" breadcrumbs={breadcrumbs} />
        <Card>
          {isNotFoundError(activity.error) ? (
            <EmptyState
              icon={<SearchOffOutlinedIcon />}
              title="La actividad no existe o no tienes acceso"
              description="Puede que la hayan eliminado o que no esté en tu alcance."
              action={<Button onClick={() => navigate(ROUTE_PATHS.activity.activities)}>Volver a actividades</Button>}
            />
          ) : (
            <EmptyState
              role="alert"
              title="No se pudo cargar la actividad"
              description={withReference(describeApiError(activity.error, COMMERCIAL_ERROR_MESSAGES))}
              action={
                <Button variant="outlined" onClick={() => void activity.refetch()}>
                  Reintentar
                </Button>
              }
            />
          )}
        </Card>
      </>
    );
  }

  const data = activity.data;
  const can = (action: ActivityDetail['allowedActions'][number]) => data.allowedActions.includes(action);
  const allowed = allowedSpecificFields(data.type);
  const deleteError = removal.isError ? withReference(describeApiError(removal.error, COMMERCIAL_ERROR_MESSAGES)) : null;
  const updateError = update.isError ? describeApiError(update.error, COMMERCIAL_ERROR_MESSAGES) : null;
  const dialogTarget = { id: data.id, code: data.code, subject: data.subject };

  const actions = editing ? undefined : (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {can('COMPLETE') ? (
        <Button startIcon={<TaskAltOutlinedIcon />} onClick={() => setDialog('complete')}>
          Completar
        </Button>
      ) : null}
      {can('EDIT') ? (
        <Button
          variant="outlined"
          startIcon={<EditOutlinedIcon />}
          onClick={() => {
            update.reset();
            setEditing(true);
          }}
        >
          Editar
        </Button>
      ) : null}
      {can('CANCEL') ? (
        <Button variant="outlined" color="inherit" startIcon={<CancelOutlinedIcon />} onClick={() => setDialog('cancel')} sx={{ borderColor: 'divider' }}>
          Cancelar
        </Button>
      ) : null}
      {can('DELETE') ? (
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => {
            removal.reset();
            setDialog('delete');
          }}
        >
          Eliminar
        </Button>
      ) : null}
    </Stack>
  );

  const onSave = (values: ActivityFormValues) => {
    const type = options.data?.types.find((item) => item.id === values.typeId) ?? (values.typeId === data.type.id ? data.type : undefined);
    update.mutate(toUpdateActivityInput(values, data, type, formTimeZone(options.data)), {
      onSuccess: (saved) => {
        setEditing(false);
        setNotice({ severity: 'success', notice: `Actividad ${saved.code} actualizada.` });
      },
    });
  };

  return (
    <>
      <PageHeader
        title={data.subject}
        context={data.code}
        subtitle={`Responsable: ${data.owner.displayName}`}
        breadcrumbs={breadcrumbs}
        actions={actions}
        metrics={<StatusChip label={data.status.label} group={data.status.group} />}
      />

      <Stack spacing={2.5}>
        {notice ? (
          <Alert severity={notice.severity} role="status" onClose={() => setNotice(null)}>
            {notice.notice}
          </Alert>
        ) : null}
        {data.access === 'INHERITED' ? (
          <Alert severity="info">La ves porque su proyecto es visible para ti. Es de solo lectura.</Alert>
        ) : null}

        {editing ? (
          <Card component="section" aria-label="Editar actividad">
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              {options.isPending ? (
                <Stack role="status" aria-label="Cargando el formulario" spacing={2}>
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
                  ))}
                </Stack>
              ) : options.isError ? (
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
              ) : (
                <ActivityForm
                  mode="edit"
                  options={options.data}
                  initialValues={activityValuesFrom(data, formTimeZone(options.data))}
                  current={{ type: data.type, priority: data.priority, status: data.status, result: data.result }}
                  canChooseOwner={canChooseOwner}
                  fixedOwnerName={data.owner.displayName || currentUserName}
                  serverError={update.error}
                  formError={updateError ? <Alert severity="error">{withReference(updateError)}</Alert> : null}
                  isPending={update.isPending}
                  submitLabel="Guardar cambios"
                  onCancel={() => setEditing(false)}
                  onSubmit={onSave}
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card component="section" aria-label="Información de la actividad">
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <DetailSection number={1} title="Datos generales">
                <DetailList
                  items={[
                    { label: ACTIVITY_FIELD_TEXT.type, value: <ActivityTypeLabel type={data.type} /> },
                    { label: ACTIVITY_FIELD_TEXT.status, value: <StatusChip label={data.status.label} group={data.status.group} /> },
                    {
                      label: ACTIVITY_FIELD_TEXT.customer,
                      value: (
                        <Link component={RouterLink} to={customerDetailPath(data.customer.id)}>
                          {`${data.customer.crmCode} · ${data.customer.legalName}`}
                        </Link>
                      ),
                    },
                    {
                      label: ACTIVITY_FIELD_TEXT.project,
                      value: data.project ? (
                        <Link component={RouterLink} to={projectDetailPath(data.project.id)}>
                          {`${data.project.code} · ${data.project.name}${data.project.isDeleted ? ' (eliminado)' : ''}`}
                        </Link>
                      ) : (
                        '—'
                      ),
                    },
                    {
                      label: ACTIVITY_FIELD_TEXT.opportunity,
                      value: data.opportunity ? `${data.opportunity.code}${data.opportunity.isDeleted ? ' (eliminada)' : ''}` : '—',
                    },
                    { label: ACTIVITY_FIELD_TEXT.owner, value: data.owner.displayName },
                    { label: ACTIVITY_FIELD_TEXT.priority, value: data.priority.label },
                    { label: ACTIVITY_FIELD_TEXT.dueAt, value: <DueBadge dueAt={data.dueAt} bucket={data.dueBucket} /> },
                    { label: 'Descripción', value: textOrDash(data.description), wide: true },
                  ]}
                />
              </DetailSection>

              {allowed.length > 0 ? (
                <DetailSection number={2} title={`Detalles de ${data.type.label.toLowerCase()}`}>
                  <DetailList
                    items={allowed.map((field) => ({
                      label: ACTIVITY_FIELD_LABELS[field],
                      value: specificValue(data, field, timeZone),
                      wide: WIDE_FIELDS.includes(field),
                    }))}
                  />
                </DetailSection>
              ) : null}

              {data.completion || data.cancelledAt ? (
                <DetailSection number={allowed.length > 0 ? 3 : 2} title={data.completion ? 'Finalización' : 'Cancelación'}>
                  <DetailList
                    items={
                      data.completion
                        ? [
                            { label: 'Fecha de finalización', value: formatDateTime(data.completion.completedAt, timeZone) },
                            { label: 'Completada por', value: textOrDash(data.completion.completedBy?.displayName) },
                            { label: 'Resultado', value: textOrDash(data.result?.label) },
                            { label: 'Notas del resultado', value: textOrDash(data.resultNotes) },
                            { label: 'Comentario', value: textOrDash(data.completion.comment), wide: true },
                          ]
                        : [{ label: 'Cancelada el', value: formatDateTime(data.cancelledAt, timeZone) }]
                    }
                  />
                </DetailSection>
              ) : null}

              <DetailSection title="Registro">
                <DetailList
                  items={[
                    { label: 'Creada', value: byWhen(data.createdBy, data.createdAt, timeZone) },
                    { label: 'Última modificación', value: byWhen(data.updatedBy, data.updatedAt, timeZone) },
                  ]}
                />
              </DetailSection>
            </CardContent>
          </Card>
        )}

        <AttachmentsPanel
          owner={{ type: 'activity', activityId: data.id }}
          canManage={can('EDIT')}
          limits={options.data?.attachments}
          uploadPendingFromCreation
        />
      </Stack>

      <ActivityCompletionDialog
        open={dialog === 'complete'}
        activity={dialogTarget}
        onClose={() => setDialog(null)}
        onCompleted={(saved) => setNotice({ severity: 'success', notice: `Actividad ${saved.code} completada.` })}
      />
      <ActivityCancelDialog
        open={dialog === 'cancel'}
        activity={dialogTarget}
        onClose={() => setDialog(null)}
        onCancelled={(saved) => setNotice({ severity: 'success', notice: `Actividad ${saved.code} cancelada.` })}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        destructive
        title="Eliminar actividad"
        description={`«${data.code} · ${data.subject}» desaparecerá de listados, bandeja, agenda e historial. La eliminación es lógica y queda auditada.`}
        confirmLabel="Eliminar"
        isPending={removal.isPending}
        errorMessage={deleteError}
        onConfirm={() => removal.mutate(undefined, { onSuccess: () => navigate(ROUTE_PATHS.activity.activities) })}
        onClose={() => {
          setDialog(null);
          removal.reset();
        }}
      />
    </>
  );
}
