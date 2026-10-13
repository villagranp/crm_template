import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import { Box, Button, Card, Divider, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useId, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { DetailList, DetailSection, EmptyState } from '@/components/data';
import { useCan } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';

import type { FollowUpScope, FollowUpTrace } from '../common/commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, isNotFoundError, withReference } from '../common/commercial-activity.errors';
import { ACTIVITY_PERMISSIONS, VISIT_PERMISSIONS } from '../common/commercial-activity.permissions';
import { useFollowUpTrace } from '../common/commercial-activity.queries';
import { interactionHistoryPath } from '../common/commercial-paths';
import { formatDateTime } from '../common/date-time';
import { COMPACT_TIMELINE_SIZE, InteractionTimelineList } from '../common/InteractionTimeline';
import { NextActionDate } from '../common/NextActionDate';
import { StatusChip } from '../common/StatusChip';
import { useCommercialTimeZones } from '../common/use-commercial-time-zones';

export type CommercialActivitySectionProps = FollowUpScope;

/** Próximas visitas y actividades que se listan en la ficha. */
const UPCOMING_SIZE = 5;
const TITLE = 'Actividad comercial';

function SectionCard({ titleId, children }: { titleId: string; children: ReactNode }) {
  return (
    <Card component="section" aria-labelledby={titleId}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography id={titleId} variant="h6" component="h2">
          {TITLE}
        </Typography>
      </Box>
      {children}
    </Card>
  );
}

function TraceContent({ trace, scope }: { trace: FollowUpTrace; scope: FollowUpScope }) {
  const { timeZone } = useCommercialTimeZones();
  const { row } = trace;
  const recent = trace.interactions.slice(0, COMPACT_TIMELINE_SIZE);
  const upcoming = trace.upcoming.slice(0, UPCOMING_SIZE);

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 2.5 } }} divider={<Divider flexItem />}>
      <DetailSection title="Seguimiento">
        <DetailList
          items={[
            {
              label: 'Última interacción',
              value: row.lastInteraction ? `${formatDateTime(row.lastInteraction.occurredAt, timeZone)} · ${row.lastInteraction.typeLabel} (${row.lastInteraction.sourceCode})` : 'Sin interacciones',
            },
            { label: 'Responsable', value: row.responsible?.displayName ?? '—' },
            {
              label: 'Próxima acción',
              value: row.nextAction ? (
                <>
                  {row.nextAction}
                  <NextActionDate date={row.nextActionDate} prefix=" · " />
                </>
              ) : (
                'Sin próxima acción'
              ),
              wide: true,
            },
            { label: 'Notas', value: row.notes?.trim() ? row.notes : '—', wide: true },
            { label: 'Adjuntos', value: String(row.attachmentCount) },
          ]}
        />
      </DetailSection>

      <DetailSection title="Próximas visitas y actividades">
        {upcoming.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay visitas ni actividades abiertas por delante.
          </Typography>
        ) : (
          <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {upcoming.map((item) => (
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
                    {`${formatDateTime(item.date, timeZone)} · ${item.typeLabel}`}
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

      <DetailSection title="Historial reciente">
        {recent.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Aún no hay interacciones registradas.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <InteractionTimelineList items={recent} hideCustomer={Boolean(scope.customerId)} hideProject={Boolean(scope.projectId)} />
            <Link component={RouterLink} to={interactionHistoryPath(scope)} variant="body2">
              Ver el historial completo
            </Link>
          </Stack>
        )}
      </DetailSection>
    </Stack>
  );
}

/**
 * Actividad comercial de un cliente o proyecto (04 §E.11, ALCANCE §5.2):
 * resumen de seguimiento (RN-04.34), próximas visitas y actividades e historial
 * reciente, todo de `GET /follow-ups/trace` (una sola llamada). Se oculta sin
 * `actividades.ver` ni `visitas.ver`. Sin ninguna visita o actividad visible el
 * backend responde `404`: se muestra como estado vacío, no como error.
 */
export function CommercialActivitySection(scope: CommercialActivitySectionProps) {
  const titleId = useId();
  const can = useCan();
  const visible = can(ACTIVITY_PERMISSIONS.view) || can(VISIT_PERMISSIONS.view);
  const trace = useFollowUpTrace(scope, visible);

  if (!visible) {
    return null;
  }

  if (trace.isPending) {
    return (
      <SectionCard titleId={titleId}>
        <Stack role="status" aria-label="Cargando la actividad comercial" spacing={1} sx={{ p: 2 }}>
          <Skeleton variant="text" />
          <Skeleton variant="text" />
          <Skeleton variant="text" sx={{ width: '60%' }} />
        </Stack>
      </SectionCard>
    );
  }

  if (trace.isError) {
    return (
      <SectionCard titleId={titleId}>
        {isNotFoundError(trace.error) ? (
          <EmptyState icon={<EventNoteOutlinedIcon />} title="Aún no hay actividad comercial registrada" description="Las visitas y actividades aparecerán aquí." />
        ) : (
          <EmptyState
            role="alert"
            icon={<ErrorOutlineIcon />}
            title="No se pudo cargar la actividad comercial"
            description={withReference(describeApiError(trace.error, COMMERCIAL_ERROR_MESSAGES))}
            action={
              <Button variant="outlined" onClick={() => void trace.refetch()}>
                Reintentar
              </Button>
            }
          />
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard titleId={titleId}>
      <TraceContent trace={trace.data} scope={scope} />
    </SectionCard>
  );
}
