import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, Chip, IconButton } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  type DataTableColumn,
  DataTable,
  describeApiError,
  EmptyState,
  FilterChips,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  RowIdentity,
  type TableSort,
  useFilterCounts,
  useTableQueryState,
} from '@/features/admin/common';

import { APPROVAL_STATUS_VIEW, formatDateTime } from './approval-status';
import { APPROVAL_STATUSES, listApprovals, type ApprovalSummary } from './approvals.api';
import { approvalKeys, useApprovals } from './approvals.queries';
import { ApprovalDetailDrawer } from './components/ApprovalDetailDrawer';

const TITLE = 'Aprobaciones';
const DESCRIPTION = 'Solicitudes de aprobación y su historial.';
const FILTER_KEYS = ['status'] as const;
const SORTABLE = ['createdAt', 'code', 'title', 'status'] as const;
const DEFAULT_SORT: TableSort = { field: 'createdAt', direction: 'desc' };
/** Chips de estado: "Todas" (`''`) y cada estado. */
const STATUS_CHIP_VALUES: readonly string[] = ['', ...APPROVAL_STATUSES];

const COLUMNS: DataTableColumn<ApprovalSummary>[] = [
  {
    id: 'code',
    header: 'Código',
    sortable: true,
    render: (approval) => (
      <Box component="span" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
        {approval.code}
      </Box>
    ),
  },
  {
    id: 'title',
    header: 'Solicitud',
    sortable: true,
    primary: true,
    render: (approval) => approval.title,
  },
  {
    id: 'requestedBy',
    header: 'Solicitante',
    hideOnMobile: true,
    render: (approval) => <RowIdentity name={approval.requestedBy.displayName} />,
  },
  {
    id: 'createdAt',
    header: 'Creada',
    sortable: true,
    render: (approval) => formatDateTime(approval.createdAt),
  },
  {
    id: 'status',
    header: 'Estado',
    sortable: true,
    render: (approval) => {
      const view = APPROVAL_STATUS_VIEW[approval.status];
      return <Chip size="small" color={view.color} label={view.label} />;
    },
  },
];

function statusLabel(value: string): string {
  return value in APPROVAL_STATUS_VIEW
    ? APPROVAL_STATUS_VIEW[value as keyof typeof APPROVAL_STATUS_VIEW].label
    : 'Todas';
}

/**
 * Pantalla de administración «Aprobaciones» (PLAN-ADMIN D12): bandeja de solo
 * lectura. Ruta y permiso en `features/admin/admin-routes.ts`.
 */
export function ApprovalsPage() {
  const table = useTableQueryState<'status'>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const approvals = useApprovals(table.apiQuery);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const statusCounts = useFilterCounts({
    baseQuery: table.apiQuery,
    filterKey: 'status',
    values: STATUS_CHIP_VALUES,
    queryKey: approvalKeys.list,
    queryFn: listApprovals,
  });

  const isFiltered = Boolean(table.state.search || table.state.filters.status);
  const emptyFirstUse =
    !isFiltered && !approvals.isError && approvals.data?.pagination.totalItems === 0;

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />

      <AdminListCard
        icon={<FactCheckOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(approvals.data?.pagination.totalItems, DESCRIPTION)}
        tools={
          <RefreshTool
            busy={approvals.isFetching}
            onRefresh={() => void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() })}
          />
        }
        toolbar={
          emptyFirstUse ? undefined : (
            <ListToolbar
              filters={
                <FilterChips
                  label="Filtrar por estado"
                  value={table.state.filters.status ?? ''}
                  onChange={(value) => table.setFilter('status', value || undefined)}
                  options={STATUS_CHIP_VALUES.map((status) => ({
                    value: status,
                    label: statusLabel(status),
                    count: statusCounts[status],
                  }))}
                />
              }
              search={{
                value: table.searchInput,
                onChange: table.setSearchInput,
                label: 'Buscar por código o título',
                placeholder: 'Código o título…',
              }}
            />
          )
        }
      >
        {emptyFirstUse ? (
          <EmptyState
            icon={<FactCheckOutlinedIcon />}
            title="Todavía no hay solicitudes de aprobación"
            description="Aparecerán aquí cuando un flujo de negocio las cree. Aprobar o rechazar desde esta bandeja llegará con ese primer flujo."
          />
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
              <IconButton
                aria-label={`Ver detalle de ${approval.code}`}
                onClick={() => setSelectedId(approval.id)}
              >
                <VisibilityOutlinedIcon />
              </IconButton>
            )}
          />
        )}
      </AdminListCard>

      <ApprovalDetailDrawer approvalId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
