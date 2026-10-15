import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Alert,
  Box,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  type DataTableColumn,
  DataTable,
  describeApiError,
  ListCardTool,
  recordsSubtitle,
  RefreshTool,
  type ListQuery,
  type TableSort,
  useTableQueryState,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { AUDIT_FILTER_KEYS, type AuditFilterKey, type AuditLogEntry } from './audit.api';
import {
  type AuditFieldRow,
  describeActor,
  fieldLabel,
  formatDateTime,
  resourceTypeLabel,
  toFieldRows,
} from './audit-format';
import { AUDIT_PERMISSIONS } from './audit.permissions';
import { auditKeys, useAuditEvents, useAuditLogs, useExportAuditLogs } from './audit.queries';
import { AuditDetailDrawer } from './components/AuditDetailDrawer';
import { AuditFilters, type AuditFilterValues } from './components/AuditFilters';

const TITLE = 'Auditoría';
const DESCRIPTION = 'Registro de cambios y accesos del sistema.';
const SORTABLE = ['occurredAt', 'event'] as const;
const DEFAULT_SORT: TableSort = { field: 'occurredAt', direction: 'desc' };
const NO_EVENTS: readonly string[] = [];

type AuditView = 'events' | 'fields';

function EventName({ event }: { event: string }) {
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{
        fontFamily: 'monospace',
        fontWeight: 600,
        overflowWrap: { xs: 'anywhere', md: 'normal' },
        whiteSpace: { md: 'nowrap' },
      }}
    >
      {event}
    </Typography>
  );
}

function describeResource(entry: AuditLogEntry): string {
  if (!entry.resourceType) {
    return '—';
  }
  const label = resourceTypeLabel(entry.resourceType);
  return entry.resourceId ? `${label} · ${entry.resourceId}` : label;
}

const COLUMNS: DataTableColumn<AuditLogEntry>[] = [
  {
    id: 'occurredAt',
    header: 'Fecha',
    sortable: true,
    render: (entry) => (
      <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
        {formatDateTime(entry.occurredAt)}
      </Box>
    ),
  },
  {
    id: 'event',
    header: 'Evento',
    sortable: true,
    primary: true,
    render: (entry) => <EventName event={entry.event} />,
  },
  { id: 'actor', header: 'Actor', render: describeActor },
  {
    id: 'resource',
    header: 'Entidad',
    hideOnMobile: true,
    render: describeResource,
  },
];

/**
 * Vista por campo (07 E.6, AC-07.35): una fila por campo cambiado. La
 * paginación sigue siendo por evento; los datos comunes del evento sólo se
 * pintan en su primera fila, para que sus campos se lean agrupados.
 */
function onFirst(render: (row: AuditFieldRow) => ReactNode) {
  return (row: AuditFieldRow) => (row.isFirstOfEvent ? render(row) : null);
}

/** "Fase (phaseId)" si el campo tiene etiqueta; si no, el nombre tal cual. */
function describeField(field: string | null): string {
  if (!field) {
    return '—';
  }
  const label = fieldLabel(field);
  return label === field ? field : `${label} (${field})`;
}

const FIELD_COLUMNS: DataTableColumn<AuditFieldRow>[] = [
  {
    id: 'occurredAt',
    header: 'Fecha y hora',
    render: onFirst((row) => (
      <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
        {formatDateTime(row.entry.occurredAt)}
      </Box>
    )),
  },
  { id: 'actor', header: 'Usuario', render: onFirst((row) => describeActor(row.entry)) },
  {
    id: 'resourceType',
    header: 'Entidad',
    render: onFirst((row) => resourceTypeLabel(row.entry.resourceType)),
  },
  {
    id: 'resourceId',
    header: 'Registro',
    hideOnMobile: true,
    render: onFirst((row) => (
      <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
        {row.entry.resourceId ?? '—'}
      </Box>
    )),
  },
  { id: 'event', header: 'Acción', render: onFirst((row) => <EventName event={row.entry.event} />) },
  {
    id: 'field',
    header: 'Campo',
    primary: true,
    render: (row) => describeField(row.field),
  },
  {
    id: 'before',
    header: 'Valor anterior',
    render: (row) => (
      <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
        {row.before}
      </Box>
    ),
  },
  {
    id: 'after',
    header: 'Valor nuevo',
    render: (row) => (
      <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
        {row.after}
      </Box>
    ),
  },
];

const EXPORT_LABEL: Record<AuditView, string> = {
  events: 'Exportar CSV',
  fields: 'Exportar CSV por campo',
};

function exportErrorMessage(error: unknown): string {
  return describeApiError(error).message;
}

/** Pantalla de administración «Auditoría». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function AuditPage() {
  const can = useCan();
  const table = useTableQueryState<AuditFilterKey>({
    filterKeys: AUDIT_FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const logs = useAuditLogs(table.apiQuery);
  const events = useAuditEvents();
  const exportMutation = useExportAuditLogs();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [view, setView] = useState<AuditView>('events');

  const { filters, search } = table.state;

  /** Filtros activos para la exportación: sin paginación ni orden (la API no los acepta). */
  const exportFilters = useMemo<ListQuery>(() => {
    const query: ListQuery = { ...filters };
    if (search) {
      query.search = search;
    }
    return query;
  }, [filters, search]);

  /** Aplica todos los filtros del formulario en una sola navegación. */
  const applyFilters = (next: AuditFilterValues) => {
    table.setFilters(Object.fromEntries(AUDIT_FILTER_KEYS.map((key) => [key, next[key]])));
  };

  const hasFilters = Object.keys(exportFilters).length > 0;
  const fieldRows = useMemo(
    () => (logs.data ? toFieldRows(logs.data.data, filters.field) : undefined),
    [logs.data, filters.field],
  );
  const emptyTitle = hasFilters ? 'No hay registros con estos filtros' : 'Todavía no hay registros';
  const emptyDescription = hasFilters ? 'Prueba con otro rango de fechas o quita algún filtro.' : undefined;
  const errorMessage = logs.isError ? describeApiError(logs.error).message : null;

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />

      {exportMutation.isError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => exportMutation.reset()}>
          {exportErrorMessage(exportMutation.error)}
        </Alert>
      ) : null}

      <AdminListCard
        icon={<HistoryOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(logs.data?.pagination.totalItems, DESCRIPTION)}
        tools={
          <>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={view}
              onChange={(_, next: AuditView | null) => next && setView(next)}
              aria-label="Vista"
              sx={{ mr: 0.5 }}
            >
              <ToggleButton value="events">Vista por evento</ToggleButton>
              <ToggleButton value="fields">Vista por campo</ToggleButton>
            </ToggleButtonGroup>
            {can(AUDIT_PERMISSIONS.export) ? (
              <ListCardTool
                label={EXPORT_LABEL[view]}
                icon={<FileDownloadOutlinedIcon />}
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate({ filters: exportFilters, layout: view })}
              />
            ) : null}
            <RefreshTool
              busy={logs.isFetching}
              onRefresh={() => void queryClient.invalidateQueries({ queryKey: auditKeys.all })}
            />
          </>
        }
        toolbar={
          <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2, borderBottom: 1, borderColor: 'divider' }}>
            <AuditFilters
              value={filters}
              searchInput={table.searchInput}
              onSearchInputChange={table.setSearchInput}
              eventOptions={events.data ?? NO_EVENTS}
              onApply={applyFilters}
              onClear={table.clearFilters}
            />
          </Box>
        }
      >
        {view === 'events' ? (
          <DataTable
            label="Registros de auditoría"
            columns={COLUMNS}
            rows={logs.data?.data}
            getRowId={(entry) => entry.id}
            totalItems={logs.data?.pagination.totalItems ?? 0}
            page={table.state.page}
            pageSize={table.state.pageSize}
            onPageChange={table.setPage}
            onPageSizeChange={table.setPageSize}
            sort={table.state.sort}
            onSortChange={table.setSort}
            isLoading={logs.isPending}
            isFetching={logs.isFetching}
            errorMessage={errorMessage}
            onRetry={() => void logs.refetch()}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            rowActions={(entry) => (
              <IconButton
                aria-label={`Ver detalle de ${entry.event}`}
                onClick={() => setSelected(entry)}
              >
                <VisibilityOutlinedIcon />
              </IconButton>
            )}
          />
        ) : (
          <DataTable
            label="Cambios por campo"
            columns={FIELD_COLUMNS}
            rows={fieldRows}
            getRowId={(row) => row.key}
            // La paginación es por evento: el total es el de eventos.
            totalItems={logs.data?.pagination.totalItems ?? 0}
            page={table.state.page}
            pageSize={table.state.pageSize}
            onPageChange={table.setPage}
            onPageSizeChange={table.setPageSize}
            isLoading={logs.isPending}
            isFetching={logs.isFetching}
            errorMessage={errorMessage}
            onRetry={() => void logs.refetch()}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            rowActions={(row) =>
              row.isFirstOfEvent ? (
                <IconButton
                  aria-label={`Ver detalle de ${row.entry.event}`}
                  onClick={() => setSelected(row.entry)}
                >
                  <VisibilityOutlinedIcon />
                </IconButton>
              ) : null
            }
          />
        )}
      </AdminListCard>

      <AuditDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
