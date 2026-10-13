import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Alert, Box, Button, Divider, Link, Skeleton, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { DetailList, DetailSection, EmptyState, EntityDrawer } from '@/components/data';
import { formatFileSize } from '@/features/crm/common/attachment-format';
import { customerDetailPath } from '@/features/crm/customers';
import { describeApiError } from '@/lib/api-error-view';

import { projectDetailPath, type FollowUpRow, type FollowUpScope, type FollowUpTrace, type TraceAttachment } from '../../common/commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, isNotFoundError, withReference } from '../../common/commercial-activity.errors';
import { useFollowUpTrace } from '../../common/commercial-activity.queries';
import { interactionHistoryPath } from '../../common/commercial-paths';
import { formatDateTime } from '../../common/date-time';
import { InteractionTimelineList } from '../../common/InteractionTimeline';
import { NextActionDate } from '../../common/NextActionDate';
import { StatusChip } from '../../common/StatusChip';
import { traceScopeOf, type FollowUpGroup } from '../follow-up.api';
import { sourceDetailPath, sourceLinkText } from '../follow-up-format';
import { useDownloadTraceAttachment } from '../follow-up.queries';

export interface FollowUpTraceDrawerProps {
  /** Fila elegida; se conserva mientras el panel se cierra. */
  row: FollowUpRow | null;
  groupBy: FollowUpGroup;
  open: boolean;
  onClose: () => void;
}

/** Alcance inerte mientras no hay fila (la consulta queda deshabilitada). */
const NO_SCOPE: FollowUpScope = { customerId: '' };

const ATTACHMENT_OWNER_TEXT: Record<TraceAttachment['ownerType'], string> = {
  VISIT: 'Visita',
  VISIT_EVENT: 'Evento de visita',
  ACTIVITY: 'Actividad',
};

function TraceSummary({ row }: { row: FollowUpRow }) {
  const last = row.lastInteraction;
  return (
    <DetailList
      items={[
        {
          label: 'Cliente',
          value: (
            <Link component={RouterLink} to={customerDetailPath(row.customer.id)}>
              {`${row.customer.legalName} (${row.customer.crmCode})`}
            </Link>
          ),
          wide: true,
        },
        ...(row.project
          ? [
              {
                label: 'Proyecto',
                value: (
                  <Link component={RouterLink} to={projectDetailPath(row.project.id)}>
                    {`${row.project.name} (${row.project.code})`}
                  </Link>
                ),
                wide: true,
              },
            ]
          : []),
        {
          label: 'Última interacción',
          value: last ? (
            <>
              {`${formatDateTime(last.occurredAt)} · ${last.typeLabel} · `}
              <Link component={RouterLink} to={sourceDetailPath(last)}>
                {sourceLinkText(last.sourceType, last.sourceCode)}
              </Link>
            </>
          ) : (
            'Sin interacciones'
          ),
          wide: true,
        },
        {
          label: 'Próxima acción',
          value: row.nextAction ? (
            <>
              {row.nextAction}
              <NextActionDate date={row.nextActionDate} prefix=" · " />
              {row.nextActionSource ? (
                <>
                  {' · '}
                  <Link component={RouterLink} to={sourceDetailPath(row.nextActionSource)}>
                    {sourceLinkText(row.nextActionSource.sourceType, row.nextActionSource.sourceCode)}
                  </Link>
                </>
              ) : null}
            </>
          ) : (
            'Sin próxima acción'
          ),
          wide: true,
        },
        { label: 'Responsable', value: row.responsible?.displayName ?? '—' },
        { label: 'Adjuntos', value: String(row.attachmentCount) },
        {
          label: 'Notas',
          value: row.notes?.trim() ? (
            <Box component="span" sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {row.notes}
            </Box>
          ) : (
            '—'
          ),
          wide: true,
        },
      ]}
    />
  );
}

function TraceAttachments({ attachments }: { attachments: readonly TraceAttachment[] }) {
  const download = useDownloadTraceAttachment();

  if (attachments.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No hay adjuntos en sus visitas ni actividades.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {download.isError ? (
        <Alert severity="error" onClose={() => download.reset()}>
          {`No se pudo descargar el archivo. ${withReference(describeApiError(download.error, COMMERCIAL_ERROR_MESSAGES))}`}
        </Alert>
      ) : null}
      <Stack component="ul" aria-label="Adjuntos" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {attachments.map((attachment) => (
          <Stack
            component="li"
            key={attachment.id}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 0.5, sm: 1.5 }}
            alignItems={{ sm: 'center' }}
            justifyContent="space-between"
            sx={{ pb: 1.25, borderBottom: 1, borderColor: 'divider' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
                {attachment.fileName}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="p">
                {`${formatFileSize(attachment.sizeBytes)} · ${formatDateTime(attachment.createdAt)} · ${ATTACHMENT_OWNER_TEXT[attachment.ownerType]} `}
                <Link component={RouterLink} to={attachment.sourcePath}>
                  {attachment.sourceCode}
                </Link>
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              aria-label={`Descargar ${attachment.fileName}`}
              disabled={download.isPending && download.variables?.id === attachment.id}
              onClick={() => download.mutate(attachment)}
              sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              Descargar
            </Button>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function TraceContent({ trace, scope }: { trace: FollowUpTrace; scope: FollowUpScope }) {
  return (
    <Stack spacing={3} divider={<Divider flexItem />}>
      <DetailSection title="Resumen">
        <TraceSummary row={trace.row} />
      </DetailSection>

      <DetailSection title="Línea de tiempo">
        {trace.interactions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Aún no hay interacciones registradas.
          </Typography>
        ) : (
          <InteractionTimelineList items={trace.interactions} hideCustomer={Boolean(scope.customerId)} hideProject={Boolean(scope.projectId)} />
        )}
        <Link component={RouterLink} to={interactionHistoryPath(scope)} variant="body2" sx={{ display: 'inline-block', mt: 1.5 }}>
          Ver el historial completo
        </Link>
      </DetailSection>

      <DetailSection title="Próximas visitas y actividades">
        {trace.upcoming.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay visitas ni actividades abiertas por delante.
          </Typography>
        ) : (
          <Stack component="ul" aria-label="Próximas visitas y actividades" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {trace.upcoming.map((item) => (
              <Stack
                component="li"
                key={`${item.kind}-${item.id}`}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={{ xs: 0.5, sm: 1.5 }}
                alignItems={{ sm: 'center' }}
                justifyContent="space-between"
                sx={{ pb: 1.25, borderBottom: 1, borderColor: 'divider' }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    {`${formatDateTime(item.date)} · ${item.typeLabel}`}
                  </Typography>
                  <Link component={RouterLink} to={item.detailPath} variant="body2" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {`${item.code} · ${item.subject}`}
                  </Link>
                </Box>
                <StatusChip label={item.status.label} group={item.status.group} isRescheduled={item.isRescheduled} isUnregistered={item.isUnregistered} />
              </Stack>
            ))}
          </Stack>
        )}
      </DetailSection>

      <DetailSection title="Adjuntos">
        <TraceAttachments attachments={trace.attachments} />
      </DetailSection>
    </Stack>
  );
}

/**
 * Drawer de trazabilidad de una fila del seguimiento (04 §E.4, AC-04.13): con
 * `GET /follow-ups/trace` del cliente (vista por cliente) o del proyecto (vista
 * por proyecto) pinta el resumen, la línea de tiempo cronológica (las 50 más
 * recientes, con enlace al historial completo), las próximas visitas y
 * actividades y los adjuntos; cada elemento enlaza a su registro de origen.
 * Sin ninguna visita o actividad visible el backend responde `404`: se muestra
 * como vacío, no como error.
 */
export function FollowUpTraceDrawer({ row, groupBy, open, onClose }: FollowUpTraceDrawerProps) {
  const scope = row ? traceScopeOf(row, groupBy) : NO_SCOPE;
  const trace = useFollowUpTrace(scope, open && row !== null);

  let title = 'Trazabilidad';
  let subtitle: string | undefined;
  if (row) {
    if (scope.projectId && row.project) {
      title = row.project.name;
      subtitle = `Proyecto ${row.project.code} · ${row.customer.legalName}`;
    } else {
      title = row.customer.legalName;
      subtitle = `Cliente ${row.customer.crmCode}`;
    }
  }

  let body;
  if (!row) {
    body = null;
  } else if (trace.isPending) {
    body = (
      <Stack role="status" aria-label="Cargando la trazabilidad" spacing={1.5}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(8) }} />
        ))}
      </Stack>
    );
  } else if (trace.isError) {
    body = isNotFoundError(trace.error) ? (
      <EmptyState icon={<EventNoteOutlinedIcon />} title="Aún no hay interacciones registradas" description="Las visitas y actividades aparecerán aquí." />
    ) : (
      <EmptyState
        role="alert"
        icon={<ErrorOutlineIcon />}
        title="No se pudo cargar la trazabilidad"
        description={withReference(describeApiError(trace.error, COMMERCIAL_ERROR_MESSAGES))}
        action={
          <Button variant="outlined" onClick={() => void trace.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  } else {
    body = <TraceContent trace={trace.data} scope={scope} />;
  }

  return (
    <EntityDrawer open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {body}
    </EntityDrawer>
  );
}
