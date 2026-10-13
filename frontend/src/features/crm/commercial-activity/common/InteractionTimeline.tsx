import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { Box, Button, Chip, Link, Pagination, Skeleton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { EmptyState } from '@/components/data';
import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { describeApiError } from '@/lib/api-error-view';

import type { Interaction } from './commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from './commercial-activity.errors';
import { interactionHistoryPath } from './commercial-paths';
import { useInteractions } from './commercial-activity.queries';
import { dayKeyInTimeZone, formatCalendarDate, formatDate, formatTime } from './date-time';
import { useCommercialTimeZones } from './use-commercial-time-zones';

/** Interacciones por página en la vista compacta (fichas) y en la completa. */
export const COMPACT_TIMELINE_SIZE = 5;
const FULL_TIMELINE_SIZE = 20;

export interface InteractionTimelineListProps {
  items: readonly Interaction[];
  /** Oculta el cliente de cada entrada (la línea de tiempo ya es de un cliente). */
  hideCustomer?: boolean;
  /** Oculta el proyecto (la línea de tiempo ya es de un proyecto). */
  hideProject?: boolean;
  /** Zona de los días y las horas; por defecto, la del usuario (`useCommercialTimeZones`). */
  timeZone?: string;
}

/**
 * Línea de tiempo presentacional (04 §E.5): entradas agrupadas por día, de la
 * más reciente a la más antigua tal como llegan, con fecha, tipo, usuario,
 * cliente, proyecto, resumen, resultado, próxima acción y enlace al registro de
 * origen ("Ver visita VIS-…" / "Ver actividad ACT-…"). Los textos libres se
 * pintan como texto (H.4).
 */
export function InteractionTimelineList({ items, hideCustomer = false, hideProject = false, timeZone: explicitTimeZone }: InteractionTimelineListProps) {
  const zones = useCommercialTimeZones();
  const timeZone = explicitTimeZone ?? zones.timeZone;
  const groups: { key: string; label: string; items: Interaction[] }[] = [];
  for (const item of items) {
    const key = dayKeyInTimeZone(item.occurredAt, timeZone) ?? item.occurredAt;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: formatDate(item.occurredAt, timeZone), items: [item] });
    }
  }

  return (
    <Stack spacing={2}>
      {groups.map((group) => (
        <Box component="section" key={group.key} aria-label={group.label}>
          <Typography variant="overline" color="text.secondary" component="h3">
            {group.label}
          </Typography>
          <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {group.items.map((item) => (
              <Box
                component="li"
                key={`${item.sourceType}-${item.sourceId}`}
                sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5, pl: 0.5 }}
              >
                <Box aria-hidden sx={{ color: 'primary.main', pt: 0.25, display: 'flex', typography: 'h6', '& svg': { fontSize: 'inherit' } }}>
                  <MaterialSymbol name={item.sourceType === 'VISIT' ? 'location_on' : 'event_note'} />
                </Box>
                <Box sx={{ minWidth: 0, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="baseline">
                    <Typography variant="caption" color="text.secondary">
                      {formatTime(item.occurredAt, timeZone)}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium' }}>
                      {item.typeLabel}
                    </Typography>
                    {item.result ? <Chip size="small" variant="outlined" label={item.result.label} /> : null}
                  </Stack>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {item.subject}
                  </Typography>
                  {item.summary ? (
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
                      {item.summary}
                    </Typography>
                  ) : null}
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ overflowWrap: 'anywhere' }}>
                    {[
                      item.user.displayName,
                      hideCustomer ? null : item.customer.legalName,
                      hideProject || !item.project ? null : item.project.name,
                      item.nextAction ? `Próxima acción: ${item.nextAction}${item.nextActionDate ? ` (${formatCalendarDate(item.nextActionDate)})` : ''}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                  <Link component={RouterLink} to={item.sourcePath} variant="body2">
                    {item.sourceType === 'VISIT' ? `Ver visita ${item.sourceCode}` : `Ver actividad ${item.sourceCode}`}
                  </Link>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export interface InteractionTimelineProps {
  customerId?: string;
  projectId?: string;
  opportunityId?: string;
  /** Vista compacta (fichas): las últimas 5 y un enlace al historial completo. */
  compact?: boolean;
}

/**
 * Historial de interacciones de un cliente, proyecto u oportunidad (04 §E.5,
 * `GET /interactions`, RN-04.33): sólo visitas realizadas o confirmadas y
 * actividades completadas de tipos que cuentan como interacción, cada una una
 * vez. Lo reutilizan el historial, el drawer de seguimiento y las fichas.
 */
export function InteractionTimeline({ customerId, projectId, opportunityId, compact = false }: InteractionTimelineProps) {
  const [page, setPage] = useState(1);
  const pageSize = compact ? COMPACT_TIMELINE_SIZE : FULL_TIMELINE_SIZE;
  const interactions = useInteractions({ customerId, projectId, opportunityId, page: compact ? 1 : page, pageSize });

  if (interactions.isPending) {
    return (
      <Stack role="status" aria-label="Cargando el historial" spacing={1.5}>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(8) }} />
        ))}
      </Stack>
    );
  }

  if (interactions.isError) {
    return (
      <EmptyState
        role="alert"
        icon={<ErrorOutlineIcon />}
        title="No se pudo cargar el historial"
        description={withReference(describeApiError(interactions.error, COMMERCIAL_ERROR_MESSAGES))}
        action={
          <Button variant="outlined" onClick={() => void interactions.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  const { data, pagination } = interactions.data;
  if (data.length === 0) {
    return <EmptyState icon={<ForumOutlinedIcon />} title="Aún no hay interacciones registradas" />;
  }

  return (
    <Stack spacing={2}>
      <InteractionTimelineList items={data} hideCustomer={Boolean(customerId)} hideProject={Boolean(projectId)} />
      {compact ? (
        pagination.totalItems > data.length ? (
          <Link component={RouterLink} to={interactionHistoryPath({ customerId, projectId, opportunityId })} variant="body2">
            {`Ver el historial completo (${pagination.totalItems})`}
          </Link>
        ) : null
      ) : pagination.totalPages > 1 ? (
        <Pagination
          count={pagination.totalPages}
          page={page}
          onChange={(_, next) => setPage(next)}
          color="primary"
          shape="rounded"
          getItemAriaLabel={(type, itemPage, selected) =>
            type === 'page' ? (selected ? `Página ${itemPage}, actual` : `Ir a la página ${itemPage}`) : type === 'next' ? 'Página siguiente' : type === 'previous' ? 'Página anterior' : ''
          }
        />
      ) : null}
    </Stack>
  );
}
