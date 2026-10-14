import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import EditCalendarOutlinedIcon from '@mui/icons-material/EditCalendarOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { Alert, Button, Card, CardContent, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';

import { DetailList, DetailSection, EmptyState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { customerDetailPath } from '@/features/crm/customers';
import { projectDetailPath } from '@/features/crm/projects';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { useAuthStore } from '@/stores/auth.store';

import { AttachmentsPanel } from '../common/AttachmentsPanel';
import { COMMERCIAL_ERROR_MESSAGES, isNotFoundError, withReference } from '../common/commercial-activity.errors';
import { VISIT_PERMISSIONS } from '../common/commercial-activity.permissions';
import { formatCalendarDate, formatDateTime } from '../common/date-time';
import { participantLabel, participantValuesFrom, PARTICIPANT_KIND_LABELS } from '../common/participants';
import { StatusChip } from '../common/StatusChip';
import { useCommercialTimeZones } from '../common/use-commercial-time-zones';

import { ScheduleConflictAlert } from './components/ScheduleConflictAlert';
import { VisitCancelDialog } from './components/VisitCancelDialog';
import { VisitCompletionDialog } from './components/VisitCompletionDialog';
import { VisitConfirmationDialog } from './components/VisitConfirmationDialog';
import { VisitEventsTimeline } from './components/VisitEventsTimeline';
import { VisitPlanningDialog } from './components/VisitPlanningDialog';
import { VisitRescheduleDialog } from './components/VisitRescheduleDialog';
import { rescheduleLabel, VISIT_FIELD_TEXT } from './visit-format';
import type { VisitNoticeState } from './VisitFormPage';
import type { ScheduleConflict, VisitAction, VisitDetail } from './visits.api';
import { useVisit, useVisitFormOptions } from './visits.queries';
import { formatReminder } from './visits.schemas';

type VisitDialog = 'edit' | 'complete' | 'correct' | 'confirm' | 'reschedule' | 'cancel';

interface Notice {
  severity: 'success' | 'warning';
  notice: string;
}

function isNoticeState(state: unknown): state is VisitNoticeState {
  return typeof state === 'object' && state !== null && typeof (state as VisitNoticeState).notice === 'string';
}

function textOrDash(value: string | null | undefined): string {
  return value?.trim() ? value : '—';
}

function byWhen(user: { displayName: string } | null, at: string | null, timeZone: string | undefined): string {
  if (!at) {
    return '—';
  }
  return user ? `${user.displayName} · ${formatDateTime(at, timeZone)}` : formatDateTime(at, timeZone);
}

function participantsText(visit: VisitDetail, role: 'INVITED' | 'ATTENDED'): string {
  const participants = participantValuesFrom(visit.participants, role);
  return participants.length > 0
    ? participants.map((participant) => `${participantLabel(participant)} (${PARTICIPANT_KIND_LABELS[participant.kind].toLowerCase()})`).join(', ')
    : '—';
}

const SUCCESS_MESSAGES: Record<VisitDialog, (code: string) => string> = {
  edit: (code) => `Visita ${code} actualizada.`,
  complete: (code) => `Visita ${code} registrada como realizada.`,
  correct: (code) => `Realización de la visita ${code} corregida.`,
  confirm: (code) => `Visita ${code} confirmada.`,
  reschedule: (code) => `Visita ${code} reprogramada.`,
  cancel: (code) => `Visita ${code} cancelada.`,
};

/**
 * Detalle de visita (04 §E.8, F-25, F-27 a F-29). Ruta protegida con
 * `visitas.ver`. Secciones Planificación, Realización, Confirmación, Historial
 * (`visit_events`) y Adjuntos. Las acciones salen de `allowedActions`, que el
 * backend calcula con estado, permisos y propiedad: "Confirmar" sólo aparece
 * para el dueño con `visitas.cerrar` (DM-20). Ocultarlas es experiencia de
 * usuario; el backend vuelve a decidir y sus errores se muestran.
 */
export function VisitDetailPage() {
  const { visitId = '' } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const canChooseOwner = usePermission(VISIT_PERMISSIONS.administer);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const visit = useVisit(visitId);
  const hasActions = (visit.data?.allowedActions.length ?? 0) > 0;
  // Siempre: los diálogos y los límites de adjuntos (`attachments`) salen de aquí.
  const options = useVisitFormOptions();
  const { timeZone } = useCommercialTimeZones();
  const limits = options.data?.attachments;
  const initialState = isNoticeState(location.state) ? location.state : null;
  const [dialog, setDialog] = useState<VisitDialog | null>(null);
  const [notice, setNotice] = useState<Notice | null>(initialState ? { severity: initialState.severity, notice: initialState.notice } : null);
  const [savedConflicts, setSavedConflicts] = useState<ScheduleConflict[]>(initialState?.scheduleConflicts ?? []);

  const breadcrumbs = crmBreadcrumbs({ label: 'Actividad comercial' }, { label: 'Visitas', to: ROUTE_PATHS.activity.visits }, { label: 'Detalle' });

  if (visit.isPending) {
    return (
      <>
        <PageHeader title="Visita" breadcrumbs={breadcrumbs} />
        <Card>
          <Stack role="status" aria-label="Cargando la visita" spacing={1.5} sx={{ p: 3 }}>
            <Skeleton variant="text" sx={{ width: '40%' }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="text" />
            ))}
          </Stack>
        </Card>
      </>
    );
  }

  if (visit.isError) {
    return (
      <>
        <PageHeader title="Visita" breadcrumbs={breadcrumbs} />
        <Card>
          {isNotFoundError(visit.error) ? (
            <EmptyState
              icon={<SearchOffOutlinedIcon />}
              title="La visita no existe o no tienes acceso"
              description="Puede que no esté en tu alcance."
              action={<Button onClick={() => navigate(ROUTE_PATHS.activity.visits)}>Volver a visitas</Button>}
            />
          ) : (
            <EmptyState
              role="alert"
              title="No se pudo cargar la visita"
              description={withReference(describeApiError(visit.error, COMMERCIAL_ERROR_MESSAGES))}
              action={
                <Button variant="outlined" onClick={() => void visit.refetch()}>
                  Reintentar
                </Button>
              }
            />
          )}
        </Card>
      </>
    );
  }

  const data = visit.data;
  const can = (action: VisitAction) => data.allowedActions.includes(action);
  const done = (kind: VisitDialog) => (saved: VisitDetail, warning?: string | null) => {
    setNotice(warning ? { severity: 'warning', notice: `${SUCCESS_MESSAGES[kind](saved.code)} ${warning}` } : { severity: 'success', notice: SUCCESS_MESSAGES[kind](saved.code) });
    setSavedConflicts(saved.scheduleConflicts ?? []);
  };

  const actionButtons: { action: VisitAction; dialog: VisitDialog; label: string; icon: ReactNode; variant: 'contained' | 'outlined' }[] = [
    { action: 'COMPLETE', dialog: 'complete', label: 'Registrar realizada', icon: <TaskAltOutlinedIcon />, variant: 'contained' },
    { action: 'CONFIRM', dialog: 'confirm', label: 'Confirmar', icon: <FactCheckOutlinedIcon />, variant: 'contained' },
    { action: 'CORRECT_COMPLETION', dialog: 'correct', label: 'Corregir realización', icon: <EditOutlinedIcon />, variant: 'outlined' },
    { action: 'EDIT', dialog: 'edit', label: 'Editar planificación', icon: <EditCalendarOutlinedIcon />, variant: 'outlined' },
    { action: 'RESCHEDULE', dialog: 'reschedule', label: 'Reprogramar', icon: <EventRepeatOutlinedIcon />, variant: 'outlined' },
    { action: 'CANCEL', dialog: 'cancel', label: 'Cancelar', icon: <CancelOutlinedIcon />, variant: 'outlined' },
  ];
  const visibleActions = actionButtons.filter((item) => can(item.action));
  const actions =
    visibleActions.length > 0 ? (
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {visibleActions.map((item) => (
          <Button
            key={item.action}
            variant={item.variant}
            color={item.action === 'CANCEL' ? 'inherit' : 'primary'}
            startIcon={item.icon}
            onClick={() => setDialog(item.dialog)}
            disabled={!options.data}
            sx={item.action === 'CANCEL' ? { borderColor: 'divider' } : undefined}
          >
            {item.label}
          </Button>
        ))}
      </Stack>
    ) : undefined;

  const rescheduled = rescheduleLabel(data.rescheduleCount);
  const completion = data.completion;

  return (
    <>
      <PageHeader
        title="Visita"
        context={data.code}
        subtitle={`Responsable: ${data.owner.displayName}`}
        breadcrumbs={breadcrumbs}
        actions={actions}
        metrics={<StatusChip label={data.status.label} group={data.status.group} isRescheduled={data.status.isRescheduled} isUnregistered={data.isUnregistered} />}
      />

      <Stack spacing={2.5}>
        {notice ? (
          <Alert severity={notice.severity} role="status" onClose={() => setNotice(null)}>
            {notice.notice}
          </Alert>
        ) : null}
        <ScheduleConflictAlert conflicts={savedConflicts} saved ownVisits={data.owner.id === currentUserId} />
        {data.access === 'INHERITED' ? <Alert severity="info">La ves porque su proyecto es visible para ti. Es de solo lectura.</Alert> : null}
        {hasActions && options.isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void options.refetch()}>
                Reintentar
              </Button>
            }
          >
            {`No se pudieron cargar las opciones de la visita: las acciones no están disponibles. ${withReference(describeApiError(options.error))}`}
          </Alert>
        ) : null}

        <Card component="section" aria-label="Información de la visita">
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <DetailSection number={1} title="Planificación">
              <DetailList
                items={[
                  {
                    label: VISIT_FIELD_TEXT.customer,
                    value: (
                      <Link component={RouterLink} to={customerDetailPath(data.customer.id)}>
                        {`${data.customer.crmCode} · ${data.customer.legalName}`}
                      </Link>
                    ),
                  },
                  {
                    label: VISIT_FIELD_TEXT.project,
                    value: data.project ? (
                      <Link component={RouterLink} to={projectDetailPath(data.project.id)}>
                        {`${data.project.code} · ${data.project.name}${data.project.isDeleted ? ' (eliminado)' : ''}`}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  { label: VISIT_FIELD_TEXT.owner, value: data.owner.displayName },
                  {
                    label: VISIT_FIELD_TEXT.status,
                    value: <StatusChip label={data.status.label} group={data.status.group} isRescheduled={data.status.isRescheduled} isUnregistered={data.isUnregistered} />,
                  },
                  { label: 'Fecha y hora vigente', value: formatDateTime(data.scheduledStartAt, timeZone) },
                  {
                    label: VISIT_FIELD_TEXT.scheduledEndAt,
                    value: data.scheduledEndAt
                      ? formatDateTime(data.scheduledEndAt, timeZone)
                      : `${formatDateTime(data.effectiveEndAt, timeZone)} (duración por defecto)`,
                  },
                  ...(rescheduled ? [{ label: 'Fecha original', value: `${formatDateTime(data.originalScheduledAt, timeZone)} · ${rescheduled}` }] : []),
                  { label: VISIT_FIELD_TEXT.objective, value: data.objective, wide: true },
                  { label: VISIT_FIELD_TEXT.location, value: textOrDash(data.location) },
                  {
                    label: VISIT_FIELD_TEXT.reminder,
                    value: data.reminderAt
                      ? `${formatReminder(data.reminderMinutesBefore)} · ${formatDateTime(data.reminderAt, timeZone)}`
                      : formatReminder(data.reminderMinutesBefore),
                  },
                  { label: VISIT_FIELD_TEXT.participants, value: participantsText(data, 'INVITED'), wide: true },
                ]}
              />
              {data.reminderMinutesBefore !== null ? (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                  El recordatorio se muestra en la agenda; no se envían notificaciones.
                </Typography>
              ) : null}
            </DetailSection>

            <DetailSection number={2} title="Realización">
              {completion ? (
                <DetailList
                  items={[
                    { label: 'Fecha real', value: formatDateTime(completion.actualStartAt, timeZone) },
                    { label: 'Fin real', value: formatDateTime(completion.actualEndAt, timeZone) },
                    { label: VISIT_FIELD_TEXT.attendees, value: participantsText(data, 'ATTENDED'), wide: true },
                    { label: 'Temas tratados', value: textOrDash(completion.topics), wide: true },
                    { label: 'Acuerdos', value: textOrDash(completion.agreements), wide: true },
                    { label: VISIT_FIELD_TEXT.result, value: textOrDash(completion.result?.label) },
                    { label: 'Resumen del resultado', value: textOrDash(completion.resultSummary), wide: true },
                    { label: 'Comentarios', value: textOrDash(completion.comments), wide: true },
                    { label: 'Próxima acción', value: textOrDash(completion.nextAction) },
                    { label: 'Fecha de la próxima acción', value: formatCalendarDate(completion.nextActionDate) },
                    { label: 'Registrada por', value: byWhen(completion.recordedBy, completion.recordedAt, timeZone) },
                  ]}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {data.cancelledAt ? 'La visita se canceló sin realizarse.' : 'Aún no se ha registrado como realizada.'}
                </Typography>
              )}
            </DetailSection>

            <DetailSection number={3} title={data.cancelledAt ? 'Cancelación' : 'Confirmación'}>
              {data.cancelledAt ? (
                <DetailList items={[{ label: 'Cancelada el', value: formatDateTime(data.cancelledAt, timeZone) }]} />
              ) : data.confirmation ? (
                <DetailList
                  items={[
                    { label: 'Confirmada', value: byWhen(data.confirmation.confirmedBy, data.confirmation.confirmedAt, timeZone) },
                    { label: 'Resumen', value: textOrDash(data.confirmation.summary), wide: true },
                  ]}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {completion ? 'Pendiente de confirmar por el asesor dueño de la visita.' : 'Se confirma después de registrarla como realizada.'}
                </Typography>
              )}
            </DetailSection>

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

        <Card component="section" aria-label="Historial de la visita">
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <DetailSection number={4} title="Historial">
              <VisitEventsTimeline visitId={data.id} limits={limits} timeZone={timeZone} />
            </DetailSection>
          </CardContent>
        </Card>

        <AttachmentsPanel
          owner={{ type: 'visit', visitId: data.id }}
          canManage={can('EDIT') || can('CORRECT_COMPLETION')}
          limits={limits}
          uploadPendingFromCreation
        />
      </Stack>

      {options.data ? (
        <>
          <VisitPlanningDialog
            open={dialog === 'edit'}
            visit={data}
            options={options.data}
            canChooseOwner={canChooseOwner}
            currentUserId={currentUserId}
            onClose={() => setDialog(null)}
            onDone={done('edit')}
          />
          <VisitCompletionDialog
            open={dialog === 'complete' || dialog === 'correct'}
            mode={dialog === 'correct' ? 'correct' : 'record'}
            visit={data}
            options={options.data}
            onClose={() => setDialog(null)}
            onDone={done(dialog === 'correct' ? 'correct' : 'complete')}
          />
          <VisitConfirmationDialog
            open={dialog === 'confirm'}
            visit={data}
            limits={limits}
            timeZone={timeZone}
            onClose={() => setDialog(null)}
            onDone={done('confirm')}
          />
          <VisitRescheduleDialog
            open={dialog === 'reschedule'}
            visit={data}
            options={options.data}
            currentUserId={currentUserId}
            onClose={() => setDialog(null)}
            onDone={done('reschedule')}
          />
          <VisitCancelDialog open={dialog === 'cancel'} visit={data} options={options.data} onClose={() => setDialog(null)} onDone={done('cancel')} />
        </>
      ) : null}
    </>
  );
}
