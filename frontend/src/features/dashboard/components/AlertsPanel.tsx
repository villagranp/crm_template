import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Link,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import { DataTable, type DataTableColumn } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';
import { fontSizes } from '@/theme/tokens';

import {
  ALERT_DISABLED_REASON_LABELS,
  ALERT_TYPE_LABELS,
  customerLabel,
  formatDateTime,
  formatRelative,
  priorityTone,
  projectLabel,
} from '../dashboard-format';
import { useAlerts, useAlertsSummary } from '../dashboard.queries';
import {
  ALERT_SORT_FIELDS,
  ALERT_TYPES,
  type AlertSortField,
  type AlertsQuery,
  type AlertSummaryItem,
  type AlertType,
  type DashboardAlert,
  type Priority,
} from '../dashboard.types';
import { customerHref, sourceHref, useLinkContext, type LinkContext } from '../source-routes';
import { DashboardPanel } from './DashboardPanel';

/** Parámetros de la URL de la bandeja (01 §E.5). */
const ALERT_PARAMS = {
  type: 'alertType',
  priority: 'alertPriority',
  mine: 'mine',
  page: 'alertPage',
  pageSize: 'alertPageSize',
  sort: 'alertSort',
} as const;

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_SORT: AlertSortField = 'priority';
const SORT_LABELS: Record<AlertSortField, string> = {
  priority: 'Prioridad',
  referenceDate: 'Fecha de referencia',
};

function parsePositiveInt(raw: string | null, fallback: number): number {
  return raw !== null && /^\d+$/.test(raw) && Number(raw) >= 1 ? Number(raw) : fallback;
}

/** Estado de la bandeja leído de la URL; los valores inválidos se ignoran. */
function useAlertsUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawType = searchParams.get(ALERT_PARAMS.type);
  const type = ALERT_TYPES.find((candidate) => candidate === rawType);
  const rawPriority = searchParams.get(ALERT_PARAMS.priority);
  const priority = rawPriority && /^[A-Z0-9_]+$/.test(rawPriority) ? rawPriority : undefined;
  const mine = searchParams.get(ALERT_PARAMS.mine) === 'true';
  const rawSort = searchParams.get(ALERT_PARAMS.sort);
  const sortBy = ALERT_SORT_FIELDS.find((candidate) => candidate === rawSort) ?? DEFAULT_SORT;
  const page = parsePositiveInt(searchParams.get(ALERT_PARAMS.page), 1);
  const parsedPageSize = parsePositiveInt(
    searchParams.get(ALERT_PARAMS.pageSize),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsedPageSize)
    ? parsedPageSize
    : DEFAULT_PAGE_SIZE;

  const update = (
    changes: Partial<Record<keyof typeof ALERT_PARAMS, string | null>>,
    resetPage = true,
  ) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          const param = ALERT_PARAMS[key as keyof typeof ALERT_PARAMS];
          if (value === null || value === '') {
            next.delete(param);
          } else {
            next.set(param, value);
          }
        }
        if (resetPage) {
          next.delete(ALERT_PARAMS.page);
        }
        return next;
      },
      { replace: true },
    );
  };

  const query: AlertsQuery = {
    page,
    pageSize,
    ...(type ? { type } : {}),
    ...(priority ? { priority } : {}),
    ...(mine ? { mine: true } : {}),
    ...(sortBy !== DEFAULT_SORT ? { sortBy } : {}),
  };

  return { type, priority, mine, sortBy, page, pageSize, query, update };
}

/** Chip de prioridad: color semántico por peso + texto (el color nunca va solo). */
export function PriorityChip({ priority }: { priority: Priority }) {
  return <Chip size="small" color={priorityTone(priority.weight)} label={priority.label} />;
}

function SummaryChip({
  item,
  active,
  onToggle,
}: {
  item: AlertSummaryItem;
  active: boolean;
  onToggle: (type: AlertType) => void;
}) {
  const label = ALERT_TYPE_LABELS[item.type];
  if (!item.enabled) {
    const reason = item.disabledReason
      ? ALERT_DISABLED_REASON_LABELS[item.disabledReason]
      : 'Desactivada.';
    return (
      <Tooltip title={reason}>
        <Chip
          size="small"
          variant="outlined"
          label={`${label}: Desactivada`}
          aria-label={`${label}: Desactivada. ${reason}`}
          tabIndex={0}
        />
      </Tooltip>
    );
  }
  const priorityText = item.priority ? ` · ${item.priority.label}` : '';
  return (
    <Chip
      size="small"
      color={priorityTone(item.priority?.weight)}
      variant={active ? 'filled' : 'outlined'}
      label={`${label}: ${item.count}${priorityText}`}
      aria-pressed={active}
      onClick={() => onToggle(item.type)}
    />
  );
}

function relatedRecord(alert: DashboardAlert, links: LinkContext) {
  const customerLink = alert.customer ? customerHref(alert.customer.id, links) : null;
  return (
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
      <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 600 }}>
        {alert.source.code}
      </Typography>
      {alert.project ? (
        <Typography component="span" sx={{ fontSize: fontSizes.caption, color: 'text.secondary' }}>
          {projectLabel(alert.project)}
        </Typography>
      ) : null}
      {alert.customer ? (
        customerLink ? (
          <Link component={RouterLink} to={customerLink} sx={{ fontSize: fontSizes.caption }}>
            {customerLabel(alert.customer)}
          </Link>
        ) : (
          <Typography
            component="span"
            sx={{ fontSize: fontSizes.caption, color: 'text.secondary' }}
          >
            {customerLabel(alert.customer)}
          </Typography>
        )
      ) : null}
    </Stack>
  );
}

/**
 * Alertas y pendientes (01 §E.5, F-04): resumen por tipo con chips (color de
 * la prioridad; "Desactivada" con su motivo), lista paginada en el servidor
 * con filtros de tipo, prioridad y "Asignadas a mí" en la URL, y botón
 * "Abrir" a la ficha de origen cuando su ruta está registrada.
 *
 * Sólo se monta con al menos un permiso de fuente de alertas (D-01.1); el
 * backend filtra cada tipo por su permiso y por ámbito (RN-01.31).
 */
export function AlertsPanel() {
  const links = useLinkContext();
  const state = useAlertsUrlState();
  const summary = useAlertsSummary(true);
  const alerts = useAlerts(state.query, true);
  const now = new Date();

  const priorities = useMemo(() => {
    const byCode = new Map<string, Priority>();
    for (const item of summary.data?.items ?? []) {
      if (item.priority) {
        byCode.set(item.priority.code, item.priority);
      }
    }
    return [...byCode.values()].sort((left, right) => right.weight - left.weight);
  }, [summary.data]);

  const columns: DataTableColumn<DashboardAlert>[] = [
    {
      id: 'priority',
      header: 'Prioridad',
      render: (alert) => <PriorityChip priority={alert.priority} />,
    },
    {
      id: 'description',
      header: 'Descripción',
      primary: true,
      render: (alert) => alert.description,
    },
    { id: 'type', header: 'Tipo', render: (alert) => ALERT_TYPE_LABELS[alert.type] },
    { id: 'responsible', header: 'Responsable', render: (alert) => alert.responsible.displayName },
    {
      id: 'referenceDate',
      header: 'Fecha de referencia',
      render: (alert) => (
        <time dateTime={alert.referenceDate} title={formatDateTime(alert.referenceDate)}>
          {formatRelative(alert.referenceDate, now)}
        </time>
      ),
    },
    {
      id: 'related',
      header: 'Registro relacionado',
      render: (alert) => relatedRecord(alert, links),
    },
  ];

  const errorView = alerts.isError ? describeApiError(alerts.error) : null;
  const errorMessage = errorView
    ? `${errorView.message}${errorView.correlationId ? ` Referencia: ${errorView.correlationId}` : ''}`
    : null;

  const toggleType = (type: AlertType) => state.update({ type: state.type === type ? null : type });

  return (
    <DashboardPanel
      id="home-alerts"
      title="Alertas y pendientes"
      icon={<NotificationsActiveOutlinedIcon />}
      actions={
        <TextField
          select
          size="small"
          label="Ordenar por"
          value={state.sortBy}
          onChange={(event) =>
            state.update({ sort: event.target.value === DEFAULT_SORT ? null : event.target.value })
          }
          sx={{ minWidth: (theme) => theme.spacing(22) }}
        >
          {ALERT_SORT_FIELDS.map((field) => (
            <MenuItem key={field} value={field}>
              {SORT_LABELS[field]}
            </MenuItem>
          ))}
        </TextField>
      }
    >
      <Stack spacing={1.5} sx={{ px: { xs: 2, md: 2.5 }, py: 1.5 }}>
        {summary.isPending ? (
          <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(3) }} />
        ) : summary.isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void summary.refetch()}>
                Reintentar
              </Button>
            }
          >
            {describeApiError(summary.error).message}
          </Alert>
        ) : summary.data.items.length > 0 ? (
          <Box
            role="group"
            aria-label="Resumen por tipo"
            sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
          >
            {summary.data.items.map((item) => (
              <SummaryChip
                key={item.type}
                item={item}
                active={state.type === item.type}
                onToggle={toggleType}
              />
            ))}
          </Box>
        ) : null}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          useFlexGap
          flexWrap="wrap"
          alignItems={{ sm: 'center' }}
        >
          <TextField
            select
            size="small"
            label="Tipo"
            value={state.type ?? ''}
            onChange={(event) => state.update({ type: event.target.value || null })}
            sx={{ minWidth: (theme) => theme.spacing(26) }}
          >
            <MenuItem value="">Todos</MenuItem>
            {(summary.data?.items ?? [])
              .filter((item) => item.enabled)
              .map((item) => (
                <MenuItem key={item.type} value={item.type}>
                  {ALERT_TYPE_LABELS[item.type]}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Prioridad"
            value={state.priority ?? ''}
            onChange={(event) => state.update({ priority: event.target.value || null })}
            sx={{ minWidth: (theme) => theme.spacing(18) }}
          >
            <MenuItem value="">Todas</MenuItem>
            {priorities.map((priority) => (
              <MenuItem key={priority.code} value={priority.code}>
                {priority.label}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={state.mine}
                onChange={(event) => state.update({ mine: event.target.checked ? 'true' : null })}
              />
            }
            label="Asignadas a mí"
          />
        </Stack>
      </Stack>

      <DataTable<DashboardAlert>
        label="Alertas"
        columns={columns}
        rows={alerts.data?.data}
        getRowId={(alert) => alert.id}
        totalItems={alerts.data?.pagination.totalItems ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageChange={(page) => state.update({ page: page > 1 ? String(page) : null }, false)}
        onPageSizeChange={(pageSize) =>
          state.update({ pageSize: pageSize === DEFAULT_PAGE_SIZE ? null : String(pageSize) })
        }
        isLoading={alerts.isPending}
        isFetching={alerts.isFetching}
        errorMessage={errorMessage}
        onRetry={() => void alerts.refetch()}
        emptyTitle="No tienes alertas pendientes."
        cardsBelow="sm"
        rowActions={(alert) => {
          const href = sourceHref(alert.source, links);
          return href ? (
            <Button
              component={RouterLink}
              to={href}
              size="small"
              variant="outlined"
              aria-label={`Abrir ${alert.source.code}`}
            >
              Abrir
            </Button>
          ) : null;
        }}
      />
    </DashboardPanel>
  );
}
