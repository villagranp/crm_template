import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import RestoreIcon from '@mui/icons-material/Restore';
import { Alert, Box, Button, Chip, Collapse, FormControlLabel, IconButton, Paper, Switch, Tooltip, Typography } from '@mui/material';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { useCan } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';

import { CustomerStatusChip } from './components/CustomerStatusChip';
import { ActiveFilterChips, CustomerFilters, type CustomerFilterValues, type CustomerFormFilterKey } from './components/CustomerFilters';
import { formatDateTime, orDash } from './customer-format';
import { customerDetailPath } from './customer-paths';
import { CUSTOMER_FILTER_KEYS, CUSTOMER_SORT_FIELDS, type CustomerFilterKey, type CustomerListItem } from './customers.api';
import { CUSTOMER_ERROR_MESSAGES, withReference } from './customers.errors';
import { CUSTOMER_PERMISSIONS } from './customers.permissions';
import { useCustomerFormOptions, useCustomers, useRestoreCustomer } from './customers.queries';

const TITLE = 'Clientes';
const DEFAULT_SORT = { field: 'legalName', direction: 'asc' } as const;
const FORM_FILTER_KEYS: readonly CustomerFormFilterKey[] = CUSTOMER_FILTER_KEYS.filter(
  (key): key is CustomerFormFilterKey => key !== 'deleted',
);

const COLUMNS: DataTableColumn<CustomerListItem>[] = [
  { id: 'crmCode', header: 'Código CRM', sortable: true, primary: true, render: (customer) => customer.crmCode },
  {
    id: 'legalName',
    header: 'Razón social',
    sortable: true,
    render: (customer) => (
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
          {customer.legalName}
        </Typography>
        {customer.tradeName ? (
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {customer.tradeName}
          </Typography>
        ) : null}
      </Box>
    ),
  },
  { id: 'customerCode', header: 'Código de cliente', sortable: true, hideOnMobile: true, render: (customer) => orDash(customer.customerCode) },
  { id: 'country', header: 'País', sortable: true, render: (customer) => customer.country.name },
  { id: 'city', header: 'Ciudad', sortable: true, hideOnMobile: true, render: (customer) => orDash(customer.city) },
  {
    id: 'status',
    header: 'Estado',
    sortable: true,
    render: (customer) =>
      customer.isDeleted ? (
        <Chip size="small" variant="outlined" color="error" label="Eliminado" />
      ) : (
        <CustomerStatusChip label={customer.status.label} isActive={customer.status.isActive} />
      ),
  },
  { id: 'salesOwner', header: 'Responsable', sortable: true, hideOnMobile: true, render: (customer) => customer.salesOwner.displayName },
  { id: 'updatedAt', header: 'Actualizado', sortable: true, hideOnMobile: true, render: (customer) => formatDateTime(customer.updatedAt) },
];

/**
 * Búsqueda de clientes (02 §E.2, F-05). Ruta protegida con `clientes.ver`;
 * opción de menú `clientes-buscar`.
 *
 * Búsqueda, filtros, orden y página viven en la URL (se pueden compartir y
 * recargar). Sólo muestra lo que el backend considera visible para el usuario.
 */
export function CustomersPage() {
  const navigate = useNavigate();
  const can = useCan();
  const filtersPanelId = useId();
  const canCreate = can(CUSTOMER_PERMISSIONS.create);
  const canSeeDeleted = can(CUSTOMER_PERMISSIONS.delete);

  const table = useTableQueryState<CustomerFilterKey>({
    filterKeys: CUSTOMER_FILTER_KEYS,
    sortableFields: CUSTOMER_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { filters, search } = table.state;
  const showDeleted = filters.deleted === 'true' && canSeeDeleted;
  // Sin el permiso, un `deleted=true` manipulado en la URL no se envía (daría 403).
  const apiQuery = canSeeDeleted || !filters.deleted ? table.apiQuery : { ...table.apiQuery, deleted: undefined };

  const customers = useCustomers(apiQuery);
  const options = useCustomerFormOptions();
  const restore = useRestoreCustomer();

  const formFilters: CustomerFilterValues = Object.fromEntries(
    FORM_FILTER_KEYS.flatMap((key) => (filters[key] ? [[key, filters[key]]] : [])),
  );
  const activeFilterCount = Object.keys(formFilters).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);
  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const salesOwnerName =
    (filters.salesOwnerId && customers.data?.data.find((row) => row.salesOwner.id === filters.salesOwnerId)?.salesOwner.displayName) ||
    null;

  const goToCreate = () => navigate(ROUTE_PATHS.crm.customerNew);
  const clearFilters = () => table.setFilters(Object.fromEntries(FORM_FILTER_KEYS.map((key) => [key, undefined])) as CustomerFilterValues);
  /** Quita búsqueda y filtros; conserva la vista de eliminados. */
  const clearAll = () => {
    table.setSearchInput('');
    clearFilters();
  };

  let emptyTitle = 'Todavía no hay clientes visibles para ti';
  let emptyDescription = 'Aquí verás los clientes que tienes asignados o que puedes consultar.';
  let emptyAction = canCreate ? <Button onClick={goToCreate}>Nuevo cliente</Button> : undefined;
  if (hasFilters) {
    emptyTitle = 'Ningún cliente coincide';
    emptyDescription = 'Prueba con otra búsqueda o quita algún filtro.';
    emptyAction = (
      <Button variant="outlined" onClick={clearAll}>
        Limpiar filtros
      </Button>
    );
  } else if (showDeleted) {
    emptyTitle = 'No hay clientes eliminados';
    emptyDescription = 'Los clientes eliminados de tu alcance aparecerán aquí.';
    emptyAction = undefined;
  }

  const restoreError = restore.isError ? describeApiError(restore.error, CUSTOMER_ERROR_MESSAGES) : null;

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={crmBreadcrumbs({ label: TITLE })} />

      {restoreError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => restore.reset()}>
          {`No se pudo restaurar el cliente. ${withReference(restoreError)}`}
        </Alert>
      ) : null}
      {restore.isSuccess ? (
        <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => restore.reset()}>
          {`Cliente ${restore.data.crmCode} restaurado.`}
        </Alert>
      ) : null}

      <Paper component="section" aria-label="Búsqueda de clientes" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<FilterListIcon />}
                aria-expanded={filtersOpen}
                aria-controls={filtersPanelId}
                onClick={() => setFiltersOpen((open) => !open)}
                sx={{ flex: '0 0 auto', borderColor: 'divider' }}
              >
                {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : 'Filtros'}
              </Button>
              {canSeeDeleted ? (
                <FormControlLabel
                  sx={{ flex: '0 0 auto', ml: 0.5 }}
                  control={
                    <Switch
                      checked={showDeleted}
                      onChange={(event) => table.setFilter('deleted', event.target.checked ? 'true' : undefined)}
                    />
                  }
                  label="Ver eliminados"
                />
              ) : null}
            </>
          }
          search={{
            value: table.searchInput,
            onChange: table.setSearchInput,
            label: 'Buscar por código, razón social, nombre comercial o NIT',
            placeholder: 'Buscar clientes…',
          }}
          primaryAction={canCreate ? { label: 'Nuevo cliente', onClick: goToCreate } : undefined}
        >
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <CustomerFilters
              values={formFilters}
              countries={options.data?.countries}
              statuses={options.data?.statuses}
              salesOwnerName={salesOwnerName}
              onApply={(values) => table.setFilters(values)}
            />
          </Collapse>
          <ActiveFilterChips
            values={formFilters}
            countries={options.data?.countries}
            statuses={options.data?.statuses}
            salesOwnerName={salesOwnerName}
            onRemove={(key) => table.setFilter(key, undefined)}
            onClear={clearFilters}
          />
        </ListToolbar>

        <DataTable
          label={showDeleted ? 'Clientes eliminados' : 'Clientes'}
          columns={COLUMNS}
          rows={customers.data?.data}
          getRowId={(customer) => customer.id}
          totalItems={customers.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={customers.isPending}
          isFetching={customers.isFetching}
          errorMessage={customers.isError ? withReference(describeApiError(customers.error, CUSTOMER_ERROR_MESSAGES)) : null}
          onRetry={() => void customers.refetch()}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyIcon={hasFilters ? undefined : <BusinessOutlinedIcon />}
          emptyAction={emptyAction}
          onRowClick={(customer) => navigate(customerDetailPath(customer.id))}
          getRowLabel={(customer) => `Abrir la ficha de ${customer.legalName} (${customer.crmCode})`}
          rowActions={
            showDeleted
              ? (customer) =>
                  customer.isDeleted ? (
                    <Tooltip title="Restaurar">
                      <span>
                        <IconButton
                          aria-label={`Restaurar ${customer.legalName}`}
                          disabled={restore.isPending}
                          onClick={() => restore.mutate(customer.id)}
                        >
                          <RestoreIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : null
              : undefined
          }
        />
      </Paper>
    </>
  );
}
