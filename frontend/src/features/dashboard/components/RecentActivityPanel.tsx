import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { Alert, Box, Button, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { FilterChips } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';
import { fontSizes, layout, softTintsFor } from '@/theme/tokens';

import {
  customerLabel,
  EVENT_TYPE_LABELS,
  formatDateTime,
  formatRelative,
  projectLabel,
} from '../dashboard-format';
import type { DashboardAccess } from '../dashboard.permissions';
import { useRecentActivity } from '../dashboard.queries';
import type { RecentActivityEventType, RecentActivityItem } from '../dashboard.types';
import { customerHref, sourceHref, useLinkContext, type LinkContext } from '../source-routes';
import { DashboardPanel } from './DashboardPanel';

export const RECENT_ACTIVITY_PAGE_SIZE = 20;

type ActivityCategory = 'activities' | 'interactions' | 'opportunities' | 'projects';

interface CategoryDefinition {
  label: string;
  types: readonly RecentActivityEventType[];
  icon: ReactNode;
  /** El usuario puede ver alguna fuente de esta categoría (D.5). */
  isAllowed: (access: DashboardAccess) => boolean;
}

/** Filtro por tipo de evento (01 §E.4): sólo se ofrecen las categorías permitidas. */
const ACTIVITY_CATEGORIES: Record<ActivityCategory, CategoryDefinition> = {
  activities: {
    label: 'Actividades',
    types: ['ACTIVIDAD_REGISTRADA', 'ACTIVIDAD_COMPLETADA'],
    icon: <AssignmentOutlinedIcon fontSize="small" />,
    isAllowed: (access) => access.activities,
  },
  interactions: {
    label: 'Interacciones',
    types: ['INTERACCION'],
    icon: <ForumOutlinedIcon fontSize="small" />,
    isAllowed: (access) => access.activities || access.visits,
  },
  opportunities: {
    label: 'Oportunidades',
    types: [
      'OPORTUNIDAD_ETAPA',
      'OPORTUNIDAD_CERRADA',
      'OPORTUNIDAD_RESULTADO',
      'OPORTUNIDAD_CREADA',
      'OPORTUNIDAD_ACTUALIZADA',
    ],
    icon: <HandshakeOutlinedIcon fontSize="small" />,
    isAllowed: (access) => access.opportunities,
  },
  projects: {
    label: 'Proyectos',
    types: ['PROYECTO_CREADO', 'PROYECTO_FASE'],
    icon: <ApartmentOutlinedIcon fontSize="small" />,
    isAllowed: (access) => access.projects,
  },
};

const CATEGORY_KEYS = Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[];

function categoryOf(eventType: RecentActivityEventType): CategoryDefinition {
  return (
    CATEGORY_KEYS.map((key) => ACTIVITY_CATEGORIES[key]).find((category) =>
      category.types.includes(eventType),
    ) ?? ACTIVITY_CATEGORIES.activities
  );
}

function EventItem({
  item,
  links,
  now,
}: {
  item: RecentActivityItem;
  links: LinkContext;
  now: Date;
}) {
  const href = sourceHref(item.source, links);
  const customerLink = item.customer ? customerHref(item.customer.id, links) : null;

  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        gap: 1.5,
        py: 1.25,
        borderTop: 1,
        borderColor: 'divider',
        '&:first-of-type': { borderTop: 0 },
      }}
    >
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          width: layout.avatarSizeSm,
          height: layout.avatarSizeSm,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          color: 'primary.main',
          bgcolor: softTintsFor(theme.palette.mode).brand,
        })}
      >
        {categoryOf(item.eventType).icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          justifyContent="space-between"
          alignItems="baseline"
          flexWrap="wrap"
          useFlexGap
        >
          <Typography component="span" sx={{ fontWeight: 600, fontSize: fontSizes.small }}>
            {EVENT_TYPE_LABELS[item.eventType]}
            {' · '}
            {href ? (
              <Link component={RouterLink} to={href}>
                {item.source.code}
              </Link>
            ) : (
              item.source.code
            )}
          </Typography>
          <Typography
            component="span"
            sx={{ fontSize: fontSizes.caption, color: 'text.secondary' }}
          >
            <time dateTime={item.occurredAt} title={formatDateTime(item.occurredAt)}>
              {formatRelative(item.occurredAt, now)}
            </time>
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: fontSizes.small, overflowWrap: 'anywhere' }}>
          {item.summary}
        </Typography>
        <Typography
          sx={{ fontSize: fontSizes.caption, color: 'text.secondary', overflowWrap: 'anywhere' }}
        >
          {item.responsible.displayName}
          {item.customer ? (
            <>
              {' · '}
              {customerLink ? (
                <Link component={RouterLink} to={customerLink}>
                  {customerLabel(item.customer)}
                </Link>
              ) : (
                customerLabel(item.customer)
              )}
            </>
          ) : null}
          {item.project ? ` · ${projectLabel(item.project)}` : ''}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Actividad reciente (01 §E.4, F-03): línea de tiempo de los últimos 30 días,
 * lo más reciente primero (orden del backend, RN-01.20), con filtro por tipo
 * (sólo las categorías permitidas) y "Cargar más" con paginación de servidor.
 * Sólo se monta con al menos un permiso de fuente de D.5.
 */
export function RecentActivityPanel({ access }: { access: DashboardAccess }) {
  const links = useLinkContext();
  const [category, setCategory] = useState<ActivityCategory | ''>('');
  const allowed = CATEGORY_KEYS.filter((key) => ACTIVITY_CATEGORIES[key].isAllowed(access));
  const selected = category && allowed.includes(category) ? category : '';
  const query = {
    pageSize: RECENT_ACTIVITY_PAGE_SIZE,
    ...(selected ? { types: ACTIVITY_CATEGORIES[selected].types.join(',') } : {}),
  };
  const activity = useRecentActivity(query, true);
  const now = new Date();

  let content;
  if (activity.isPending) {
    content = (
      <Stack spacing={1} role="status" aria-label="Cargando">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} variant="text" />
        ))}
      </Stack>
    );
  } else if (activity.isError) {
    const view = describeApiError(activity.error);
    content = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void activity.refetch()}>
            Reintentar
          </Button>
        }
      >
        {view.message}
        {view.correlationId ? ` Referencia: ${view.correlationId}` : ''}
      </Alert>
    );
  } else {
    const items = activity.data.pages.flatMap((page) => page.data);
    content =
      items.length === 0 ? (
        <Typography role="status" color="text.secondary" sx={{ py: 1 }}>
          No hay actividad en los últimos 30 días.
        </Typography>
      ) : (
        <>
          <Box
            component="ul"
            aria-label="Actividad reciente"
            sx={{ listStyle: 'none', m: 0, p: 0 }}
          >
            {items.map((item) => (
              <EventItem key={item.id} item={item} links={links} now={now} />
            ))}
          </Box>
          {activity.hasNextPage ? (
            <Button
              onClick={() => void activity.fetchNextPage()}
              disabled={activity.isFetchingNextPage}
              sx={{ mt: 1 }}
            >
              {activity.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          ) : null}
        </>
      );
  }

  return (
    <DashboardPanel
      id="home-recent-activity"
      title="Actividad reciente"
      icon={<HistoryOutlinedIcon />}
    >
      <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.5 }}>
        {allowed.length > 1 ? (
          <Box className="scroll-x" sx={{ display: 'flex', gap: 1, pb: 1.5 }}>
            <FilterChips
              label="Filtrar por tipo de evento"
              value={selected}
              onChange={(value) => setCategory(value as ActivityCategory | '')}
              options={[
                { value: '', label: 'Todos' },
                ...allowed.map((key) => ({ value: key, label: ACTIVITY_CATEGORIES[key].label })),
              ]}
            />
          </Box>
        ) : null}
        {content}
      </Box>
    </DashboardPanel>
  );
}
