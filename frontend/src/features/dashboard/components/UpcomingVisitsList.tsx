import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { Alert, Box, Button, Chip, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { describeApiError } from '@/lib/api-error-view';
import { fontSizes } from '@/theme/tokens';

import {
  customerLabel,
  formatDateTime,
  formatVisitDateTime,
  projectLabel,
} from '../dashboard-format';
import { useUpcomingVisits, useVisitIndicators } from '../dashboard.queries';
import type { UpcomingVisit } from '../dashboard.types';
import { customerHref, useLinkContext, visitHref, type LinkContext } from '../source-routes';
import { DashboardPanel } from './DashboardPanel';

/** Visitas visibles de entrada y tope al pulsar "Ver más" (01 §E.4, RN-01.24). */
export const UPCOMING_VISITS_COLLAPSED = 5;
export const UPCOMING_VISITS_EXPANDED = 50;

function VisitItem({ visit, links }: { visit: UpcomingVisit; links: LinkContext }) {
  const href = visitHref(visit.id, links);
  const customerLink = customerHref(visit.customer.id, links);

  return (
    <Box
      component="li"
      sx={{ py: 1.25, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography component="span" sx={{ fontWeight: 600, fontSize: fontSizes.nav }}>
          <time dateTime={visit.scheduledStartAt} title={formatDateTime(visit.scheduledStartAt)}>
            {formatVisitDateTime(visit.scheduledStartAt)}
          </time>
        </Typography>
        {href ? (
          <Link component={RouterLink} to={href} sx={{ fontSize: fontSizes.small }}>
            {visit.code}
          </Link>
        ) : (
          <Typography component="span" sx={{ fontSize: fontSizes.small, color: 'text.secondary' }}>
            {visit.code}
          </Typography>
        )}
        <Chip size="small" label={visit.status.label} />
        {visit.reminderDue ? <Chip size="small" color="warning" label="Recordatorio" /> : null}
      </Stack>
      <Typography sx={{ fontSize: fontSizes.small, mt: 0.5, overflowWrap: 'anywhere' }}>
        {customerLink ? (
          <Link component={RouterLink} to={customerLink}>
            {customerLabel(visit.customer)}
          </Link>
        ) : (
          customerLabel(visit.customer)
        )}
        {visit.project ? ` · ${projectLabel(visit.project)}` : ''}
      </Typography>
      <Typography
        sx={{ fontSize: fontSizes.caption, color: 'text.secondary', overflowWrap: 'anywhere' }}
      >
        {visit.owner.displayName}
        {visit.objective ? ` · ${visit.objective}` : ''}
      </Typography>
    </Box>
  );
}

/**
 * Próximas visitas (01 §E.4): pendientes de los próximos N días, la más
 * cercana primero (orden del backend), con chip "Recordatorio" cuando
 * `reminderDue` (RN-01.25; no se envía ninguna notificación). Sólo se monta
 * con `visitas.ver`.
 */
export function UpcomingVisitsList() {
  const [expanded, setExpanded] = useState(false);
  const links = useLinkContext();
  const visits = useUpcomingVisits(
    expanded ? UPCOMING_VISITS_EXPANDED : UPCOMING_VISITS_COLLAPSED,
    true,
  );
  const indicators = useVisitIndicators(true);
  const days = indicators.data?.upcoming.days;

  let content;
  if (visits.isPending) {
    content = (
      <Stack spacing={1} role="status" aria-label="Cargando">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} variant="text" />
        ))}
      </Stack>
    );
  } else if (visits.isError) {
    const view = describeApiError(visits.error);
    content = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void visits.refetch()}>
            Reintentar
          </Button>
        }
      >
        {view.message}
        {view.correlationId ? ` Referencia: ${view.correlationId}` : ''}
      </Alert>
    );
  } else if (visits.data.data.length === 0) {
    content = (
      <Typography role="status" color="text.secondary" sx={{ py: 1 }}>
        {days !== undefined
          ? `No tienes visitas en los próximos ${days} días.`
          : 'No tienes visitas próximas.'}
      </Typography>
    );
  } else {
    const hasMore = !expanded && visits.data.pagination.totalItems > visits.data.data.length;
    content = (
      <>
        <Box component="ul" aria-label="Próximas visitas" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {visits.data.data.map((visit) => (
            <VisitItem key={visit.id} visit={visit} links={links} />
          ))}
        </Box>
        {hasMore ? (
          <Button onClick={() => setExpanded(true)} disabled={visits.isFetching} sx={{ mt: 1 }}>
            Ver más
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <DashboardPanel
      id="home-upcoming-visits"
      title="Próximas visitas"
      icon={<EventAvailableOutlinedIcon />}
    >
      <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.5 }}>{content}</Box>
    </DashboardPanel>
  );
}
