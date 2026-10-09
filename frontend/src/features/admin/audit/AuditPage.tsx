import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, IconButton, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

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
import { describeActor, formatDateTime } from './audit-format';
import { AUDIT_PERMISSIONS } from './audit.permissions';
import { auditKeys, useAuditEvents, useAuditLogs, useExportAuditLogs } from './audit.queries';
import { AuditDetailDrawer } from './components/AuditDetailDrawer';
import { AuditFilters, type AuditFilterValues } from './components/AuditFilters';

const TITLE = 'Auditoría';
const DESCRIPTION = 'Registro de cambios y accesos del sistema.';
const SORTABLE = ['occurredAt', 'event'] as const;
const DEFAULT_SORT: TableSort = { field: 'occurredAt', direction: 'desc' };
const NO_EVENTS: readonly string[] = [];

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
    render: (entry) => (
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
        {entry.event}
      </Typography>
    ),
  },
  { id: 'actor', header: 'Actor', render: describeActor },
  {
    id: 'resource',
    header: 'Recurso',
    hideOnMobile: true,
    render: (entry) =>
      entry.resourceType
        ? `${entry.resourceType}${entry.resourceId ? ` · ${entry.resourceId}` : ''}`
        : '—',
  },
];

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
            {can(AUDIT_PERMISSIONS.export) ? (
              <ListCardTool
                label="Exportar CSV"
                icon={<FileDownloadOutlinedIcon />}
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate(exportFilters)}
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
          errorMessage={logs.isError ? describeApiError(logs.error).message : null}
          onRetry={() => void logs.refetch()}
          emptyTitle={
            hasFilters ? 'No hay registros con estos filtros' : 'Todavía no hay registros'
          }
          emptyDescription={
            hasFilters ? 'Prueba con otro rango de fechas o quita algún filtro.' : undefined
          }
          rowActions={(entry) => (
            <IconButton
              aria-label={`Ver detalle de ${entry.event}`}
              onClick={() => setSelected(entry)}
            >
              <VisibilityOutlinedIcon />
            </IconButton>
          )}
        />
      </AdminListCard>

      <AuditDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
