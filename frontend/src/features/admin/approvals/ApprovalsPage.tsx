import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, Card, Chip, IconButton, MenuItem, TextField } from '@mui/material';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  adminBreadcrumbs,
  type DataTableColumn,
  DataTable,
  describeApiError,
  EmptyState,
  type TableSort,
  useTableQueryState,
} from '@/features/admin/common';

import { APPROVAL_STATUS_VIEW, formatDateTime } from './approval-status';
import { APPROVAL_STATUSES, type ApprovalSummary } from './approvals.api';
import { useApprovals } from './approvals.queries';
import { ApprovalDetailDrawer } from './components/ApprovalDetailDrawer';

const TITLE = 'Aprobaciones';
const FILTER_KEYS = ['status'] as const;
const SORTABLE = ['createdAt', 'code', 'title', 'status'] as const;
const DEFAULT_SORT: TableSort = { field: 'createdAt', direction: 'desc' };
const ALL_STATUSES = '';

const COLUMNS: DataTableColumn<ApprovalSummary>[] = [
  { id: 'code', header: 'Código', sortable: true, render: (approval) => approval.code },
  { id: 'title', header: 'Solicitud', sortable: true, primary: true, render: (approval) => approval.title },
  {
    id: 'status',
    header: 'Estado',
    sortable: true,
    render: (approval) => {
      const view = APPROVAL_STATUS_VIEW[approval.status];
      return <Chip size="small" color={view.color} label={view.label} />;
    },
  },
  { id: 'requestedBy', header: 'Solicitante', hideOnMobile: true, render: (approval) => approval.requestedBy.displayName },
  { id: 'createdAt', header: 'Creada', sortable: true, render: (approval) => formatDateTime(approval.createdAt) },
];

/**
 * Pantalla de administración «Aprobaciones» (PLAN-ADMIN D12): bandeja de solo
 * lectura. Ruta y permiso en `features/admin/admin-routes.ts`.
 */
export function ApprovalsPage() {
  const table = useTableQueryState<'status'>({ filterKeys: FILTER_KEYS, sortableFields: SORTABLE, defaultSort: DEFAULT_SORT });
  const approvals = useApprovals(table.apiQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isFiltered = Boolean(table.state.search || table.state.filters.status);
  const emptyFirstUse = !isFiltered && !approvals.isError && approvals.data?.pagination.totalItems === 0;

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle="Solicitudes de aprobación y su historial."
        breadcrumbs={adminBreadcrumbs(TITLE)}
      />

      <Box
        role="search"
        aria-label="Filtros de aprobaciones"
        sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}
      >
        <TextField
          label="Buscar"
          placeholder="Código o título"
          size="small"
          value={table.searchInput}
          onChange={(event) => table.setSearchInput(event.target.value)}
        />
        <TextField
          select
          label="Estado"
          size="small"
          value={table.state.filters.status ?? ALL_STATUSES}
          onChange={(event) => table.setFilter('status', event.target.value || undefined)}
        >
          <MenuItem value={ALL_STATUSES}>Todos</MenuItem>
          {APPROVAL_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {APPROVAL_STATUS_VIEW[status].label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {emptyFirstUse ? (
        <Card>
          <EmptyState
            icon={<FactCheckOutlinedIcon fontSize="large" />}
            title="Todavía no hay solicitudes de aprobación"
            description="Aparecerán aquí cuando un flujo de negocio las cree. Aprobar o rechazar desde esta bandeja llegará con ese primer flujo."
          />
        </Card>
      ) : (
        <DataTable
          label="Solicitudes de aprobación"
          columns={COLUMNS}
          rows={approvals.data?.data}
          getRowId={(approval) => approval.id}
          totalItems={approvals.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={approvals.isPending}
          isFetching={approvals.isFetching}
          errorMessage={approvals.isError ? describeApiError(approvals.error).message : null}
          onRetry={() => void approvals.refetch()}
          rowActions={(approval) => (
            <IconButton aria-label={`Ver detalle de ${approval.code}`} onClick={() => setSelectedId(approval.id)}>
              <VisibilityOutlinedIcon />
            </IconButton>
          )}
        />
      )}

      <ApprovalDetailDrawer approvalId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
