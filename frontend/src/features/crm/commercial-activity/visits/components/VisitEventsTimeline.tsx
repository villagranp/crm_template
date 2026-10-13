import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Box, Button, Collapse, Skeleton, Stack, Typography } from '@mui/material';
import { useId, useState } from 'react';

import { EmptyState } from '@/components/data';
import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { describeApiError } from '@/lib/api-error-view';

import { AttachmentsPanel } from '../../common/AttachmentsPanel';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../../common/commercial-activity.errors';
import { formatDateTime } from '../../common/date-time';
import { EVENT_ATTACHMENT_WINDOW_MS, VISIT_EVENT_ICONS, VISIT_EVENT_LABELS } from '../visit-format';
import type { VisitEvent } from '../visits.api';
import { useVisitEvents } from '../visits.queries';

export interface VisitEventsTimelineProps {
  visitId: string;
  /** Usuario de la sesión: sólo quien ejecutó un evento puede adjuntarle archivos (D-04.18). */
  currentUserId: string | null;
  /** Instante de referencia para la ventana de 15 minutos (por defecto, ahora). */
  now?: Date;
}

/** ¿Se ofrece "Subir" en el evento? Experiencia de usuario: el backend decide (`403`/`409`) y sus errores se muestran. */
function canAttachTo(event: VisitEvent, currentUserId: string | null, now: Date): boolean {
  if (event.performedBy.id !== currentUserId) {
    return false;
  }
  const occurred = new Date(event.occurredAt).getTime();
  return !Number.isNaN(occurred) && now.getTime() - occurred <= EVENT_ATTACHMENT_WINDOW_MS;
}

function describeChange(event: VisitEvent): string[] {
  const lines: string[] = [];
  if (event.fromStatus && event.fromStatus.id !== event.toStatus.id) {
    lines.push(`Estado: ${event.fromStatus.label} → ${event.toStatus.label}`);
  } else if (!event.fromStatus) {
    lines.push(`Estado: ${event.toStatus.label}`);
  }
  if (event.previousScheduledStartAt || event.newScheduledStartAt) {
    lines.push(`Fecha: ${formatDateTime(event.previousScheduledStartAt)} → ${formatDateTime(event.newScheduledStartAt)}`);
  }
  const reason = [event.reason?.label, event.reasonText?.trim()].filter(Boolean).join(' · ');
  if (reason) {
    lines.push(`Motivo: ${reason}`);
  }
  if (event.comment?.trim()) {
    lines.push(`Comentario: ${event.comment}`);
  }
  return lines;
}

function EventItem({ visitId, event, canAttach }: { visitId: string; event: VisitEvent; canAttach: boolean }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const showAttachments = event.attachmentCount > 0 || canAttach;
  const label = VISIT_EVENT_LABELS[event.eventType];

  return (
    <Box component="li" sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5 }}>
      <Box aria-hidden sx={{ color: 'primary.main', pt: 0.25, display: 'flex', typography: 'h6', '& svg': { fontSize: 'inherit' } }}>
        <MaterialSymbol name={VISIT_EVENT_ICONS[event.eventType]} />
      </Box>
      <Box sx={{ minWidth: 0, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium' }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p">
          {`${formatDateTime(event.occurredAt)} · ${event.performedBy.displayName}`}
        </Typography>
        {describeChange(event).map((line) => (
          <Typography key={line} variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
            {line}
          </Typography>
        ))}
        {showAttachments ? (
          <>
            <Button
              size="small"
              variant="text"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((value) => !value)}
              sx={{ mt: 0.5, px: 0 }}
            >
              {event.attachmentCount > 0 ? `Adjuntos del evento (${event.attachmentCount})` : 'Adjuntar archivos al evento'}
            </Button>
            <Collapse in={open} id={panelId} unmountOnExit>
              <Box sx={{ mt: 1 }}>
                <AttachmentsPanel
                  owner={{ type: 'visitEvent', visitId, eventId: event.id }}
                  canManage={canAttach}
                  title={`Adjuntos: ${label.toLowerCase()}`}
                />
              </Box>
            </Collapse>
          </>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * Historial de la visita (04 §E.8, `GET /visits/{id}/events`): un evento por
 * planificar, reprogramar, realizar, confirmar y cancelar, en orden
 * cronológico, con estado anterior → nuevo, fecha anterior → nueva, motivo,
 * comentario, usuario, fecha y adjuntos del evento. Quien ejecutó un evento
 * puede adjuntarle archivos durante 15 minutos (D-04.18); los adjuntos de un
 * evento no se eliminan.
 */
export function VisitEventsTimeline({ visitId, currentUserId, now = new Date() }: VisitEventsTimelineProps) {
  const events = useVisitEvents(visitId);

  if (events.isPending) {
    return (
      <Stack role="status" aria-label="Cargando el historial de la visita" spacing={1.5}>
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
        ))}
      </Stack>
    );
  }

  if (events.isError) {
    return (
      <EmptyState
        role="alert"
        icon={<ErrorOutlineIcon />}
        title="No se pudo cargar el historial de la visita"
        description={withReference(describeApiError(events.error, COMMERCIAL_ERROR_MESSAGES))}
        action={
          <Button variant="outlined" onClick={() => void events.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  if (events.data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        La visita aún no tiene eventos.
      </Typography>
    );
  }

  return (
    <Stack component="ol" aria-label="Eventos de la visita" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {events.data.map((event) => (
        <EventItem key={event.id} visitId={visitId} event={event} canAttach={canAttachTo(event, currentUserId, now)} />
      ))}
    </Stack>
  );
}
