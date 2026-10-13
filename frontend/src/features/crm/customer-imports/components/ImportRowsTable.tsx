import { Box, Link, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { DataTable, FilterChips, ListToolbar, type DataTableColumn, type UseTableQueryStateResult } from '@/components/data';
import { customerDetailPath } from '@/features/crm/customers';
import type { ListQuery } from '@/lib/query-keys';

import type { CustomerImportRow, ImportColumn } from '../customer-imports.api';
import { describeImportError, withReference } from '../customer-imports.errors';
import { orDash, PURGED_VALUES_TEXT, ROW_VIEW_LABELS, ROW_VIEWS, rowViewQuery } from '../customer-imports-format';
import { useCustomerImportRows } from '../customer-imports.queries';
import { ImportRowIssues } from './ImportRowIssues';
import { ImportRowStatusChip } from './ImportStatusChip';

/** Filtro de la vista de filas en la URL (`rows.view`). */
export type RowFilterKey = 'view';

export interface ImportRowsTableProps {
  importId: string;
  /** Estado de la tabla en la URL con `paramPrefix: 'rows.'`. */
  table: UseTableQueryStateResult<RowFilterKey>;
  columns: readonly ImportColumn[] | undefined;
  /** `clientes.ver`: enlazar el cliente creado o existente a su ficha. */
  canViewCustomers: boolean;
}

const FILTER_OPTIONS = [{ value: '', label: ROW_VIEW_LABELS[''] }, ...ROW_VIEWS.map((view) => ({ value: view, label: ROW_VIEW_LABELS[view] }))];

function CustomerLink({ id, crmCode, canView }: { id: string; crmCode: string; canView: boolean }) {
  return canView ? (
    <Link component={RouterLink} to={customerDetailPath(id)}>
      {crmCode}
    </Link>
  ) : (
    <>{crmCode}</>
  );
}

function headerOf(columns: readonly ImportColumn[] | undefined, key: string, fallback: string): string {
  return columns?.find((column) => column.key === key)?.header ?? fallback;
}

function buildColumns(columns: readonly ImportColumn[] | undefined, canViewCustomers: boolean): DataTableColumn<CustomerImportRow>[] {
  return [
    { id: 'fileRowNumber', header: 'Fila del archivo', primary: true, render: (row) => row.fileRowNumber },
    {
      id: 'legalName',
      header: headerOf(columns, 'legalName', 'Razón social'),
      render: (row) =>
        row.values ? (
          orDash(row.values.legalName)
        ) : (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {PURGED_VALUES_TEXT}
          </Typography>
        ),
    },
    { id: 'customerCode', header: headerOf(columns, 'customerCode', 'Código de cliente'), hideOnMobile: true, render: (row) => orDash(row.values?.customerCode) },
    { id: 'taxId', header: headerOf(columns, 'taxId', 'NIT'), hideOnMobile: true, render: (row) => orDash(row.values?.taxId) },
    { id: 'country', header: headerOf(columns, 'country', 'País'), hideOnMobile: true, render: (row) => orDash(row.values?.country) },
    { id: 'status', header: 'Estado', render: (row) => <ImportRowStatusChip status={row.status} /> },
    {
      id: 'issues',
      header: 'Incidencias',
      render: (row) => <ImportRowIssues issues={row.issues} columns={columns} rowLabel={`fila ${row.fileRowNumber}`} />,
    },
    {
      id: 'customer',
      header: 'Cliente',
      render: (row) => {
        if (row.customer) {
          return <CustomerLink id={row.customer.id} crmCode={row.customer.crmCode} canView={canViewCustomers} />;
        }
        if (row.duplicateOfCustomer) {
          return (
            <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
              {'Existente: '}
              <CustomerLink id={row.duplicateOfCustomer.id} crmCode={row.duplicateOfCustomer.crmCode} canView={canViewCustomers} />
              {` · ${row.duplicateOfCustomer.legalName}`}
            </Box>
          );
        }
        return row.duplicateOfRowNumber !== null ? `Repite la fila ${row.duplicateOfRowNumber + 1}` : '—';
      },
    },
  ];
}

/**
 * Filas de la carga (06 §E.4, AC-06.13): tabla paginada en el servidor, con
 * la "Fila del archivo" igual a la de Excel y el filtro por estado en la URL.
 * Las filas purgadas muestran el aviso de retención en lugar de sus valores.
 */
export function ImportRowsTable({ importId, table, columns, canViewCustomers }: ImportRowsTableProps) {
  const view = table.state.filters.view;
  const query: ListQuery = { page: table.state.page, pageSize: table.state.pageSize, ...rowViewQuery(view) };
  const rows = useCustomerImportRows(importId, query);
  const activeView = FILTER_OPTIONS.some((option) => option.value === view) ? (view ?? '') : '';

  return (
    <Paper component="section" aria-label="Filas de la carga" sx={{ overflow: 'hidden', boxShadow: 1 }}>
      <ListToolbar
        filters={
          <FilterChips
            label="Filtrar filas por estado"
            options={FILTER_OPTIONS}
            value={activeView}
            onChange={(value) => table.setFilter('view', value || undefined)}
          />
        }
      />
      <DataTable
        label="Filas de la carga"
        columns={buildColumns(columns, canViewCustomers)}
        rows={rows.data?.data}
        getRowId={(row) => String(row.rowNumber)}
        totalItems={rows.data?.pagination.totalItems ?? 0}
        page={table.state.page}
        pageSize={table.state.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        isLoading={rows.isPending}
        isFetching={rows.isFetching}
        errorMessage={rows.isError ? withReference(describeImportError(rows.error)) : null}
        onRetry={() => void rows.refetch()}
        emptyTitle={activeView ? 'Ninguna fila con este estado' : 'La carga no tiene filas'}
        emptyDescription={activeView ? 'Elija otro filtro para ver el resto de filas.' : 'El archivo no llegó a tener filas de datos.'}
      />
    </Paper>
  );
}
