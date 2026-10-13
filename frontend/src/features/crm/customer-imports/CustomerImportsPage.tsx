import AddIcon from '@mui/icons-material/Add';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { useCan } from '@/hooks/use-permission';
import type { ListQuery } from '@/lib/query-keys';

import { ImportStatusChip } from './components/ImportStatusChip';
import { NewImportDialog } from './components/NewImportDialog';
import { TemplateDownloadButton } from './components/TemplateDownloadButton';
import { customerImportDetailPath } from './customer-import-paths';
import { IMPORT_SORT_FIELDS, IMPORT_STATUSES, type CustomerImportListItem, type ImportStatus } from './customer-imports.api';
import { describeImportError, withReference } from './customer-imports.errors';
import { calendarDateToIso, formatCount, formatDateTime, formatImportFormat, IMPORT_STATUS_LABELS, IMPORTS_DISABLED_NOTICE } from './customer-imports-format';
import { importPageActions } from './customer-imports.permissions';
import { useCustomerImports, useCustomerImportSettings } from './customer-imports.queries';

const TITLE = 'Carga masiva de clientes';
const DEFAULT_SORT = { field: 'createdAt', direction: 'desc' } as const;
const FILTER_KEYS = ['status', 'createdFrom', 'createdTo'] as const;
type ImportFilterKey = (typeof FILTER_KEYS)[number];

const COLUMNS: DataTableColumn<CustomerImportListItem>[] = [
  { id: 'code', header: 'Código', sortable: true, primary: true, render: (item) => item.code },
  {
    id: 'originalFileName',
    header: 'Archivo',
    render: (item) => (
      <Typography variant="body2" component="span" sx={{ overflowWrap: 'anywhere' }}>
        {item.originalFileName}
      </Typography>
    ),
  },
  { id: 'format', header: 'Formato', hideOnMobile: true, render: (item) => formatImportFormat(item.format) },
  { id: 'status', header: 'Estado', sortable: true, render: (item) => <ImportStatusChip status={item.status} /> },
  { id: 'totalRows', header: 'Total', align: 'right', render: (item) => formatCount(item.totalRows) },
  { id: 'validRows', header: 'Válidas', align: 'right', hideOnMobile: true, render: (item) => formatCount(item.validRows) },
  { id: 'invalidRows', header: 'Con errores', align: 'right', hideOnMobile: true, render: (item) => formatCount(item.invalidRows) },
  { id: 'importedRows', header: 'Importadas', align: 'right', render: (item) => formatCount(item.importedRows) },
  { id: 'startedBy', header: 'Iniciada por', hideOnMobile: true, render: (item) => item.startedBy.displayName },
  { id: 'createdAt', header: 'Fecha', sortable: true, render: (item) => formatDateTime(item.createdAt) },
];

function isImportStatus(value: string | undefined): value is ImportStatus {
  return IMPORT_STATUSES.includes(value as ImportStatus);
}

/**
 * Historial de cargas masivas de clientes (06 §E.1, F-42). Ruta protegida
 * con `importaciones.ver`; opción de menú `integraciones-clientes`.
 *
 * Estado, rango de fechas, búsqueda, orden y página viven en la URL. "Nueva
 * carga" y "Descargar plantilla" sólo con `importaciones.crear` (la subida
 * exige además `clientes.crear`); con la carga deshabilitada en el entorno el
 * historial sigue visible y las acciones de alta se deshabilitan (AC-06.25).
 */
export function CustomerImportsPage() {
  const navigate = useNavigate();
  const actions = importPageActions(useCan());
  const settings = useCustomerImportSettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const table = useTableQueryState<ImportFilterKey>({
    filterKeys: FILTER_KEYS,
    sortableFields: IMPORT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { filters, search } = table.state;
  const statusFilter = isImportStatus(filters.status) ? filters.status : undefined;
  const createdFrom = calendarDateToIso(filters.createdFrom, 'start');
  const createdTo = calendarDateToIso(filters.createdTo, 'end');
  const invertedRange = Boolean(createdFrom && createdTo && createdFrom > createdTo);
  const apiQuery: ListQuery = {
    ...table.apiQuery,
    status: statusFilter,
    createdFrom: invertedRange ? undefined : (createdFrom ?? undefined),
    createdTo: invertedRange ? undefined : (createdTo ?? undefined),
  };
  const imports = useCustomerImports(apiQuery);

  const enabled = settings.data?.enabled === true;
  const hasFilters = Boolean(search || statusFilter || filters.createdFrom || filters.createdTo);
  const openDialog = () => setDialogOpen(true);

  const newImportButton = actions.canUpload ? (
    <Button startIcon={<AddIcon />} onClick={openDialog} disabled={!enabled}>
      Nueva carga
    </Button>
  ) : null;

  let emptyTitle = 'Aún no hay cargas';
  let emptyDescription = 'Aquí verá las cargas masivas de clientes y su resultado.';
  let emptyAction = actions.canUpload && enabled ? <Button onClick={openDialog}>Nueva carga</Button> : undefined;
  if (hasFilters) {
    emptyTitle = 'Ninguna carga coincide';
    emptyDescription = 'Pruebe con otra búsqueda o quite algún filtro.';
    emptyAction = (
      <Button variant="outlined" onClick={table.clearFilters}>
        Limpiar filtros
      </Button>
    );
  }

  return (
    <>
      <PageHeader
        title={TITLE}
        breadcrumbs={crmBreadcrumbs({ label: TITLE })}
        actions={
          actions.canUpload || actions.canDownloadTemplate ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {actions.canDownloadTemplate && settings.data ? (
                <TemplateDownloadButton
                  formats={settings.data.formats}
                  templateVersion={settings.data.templateVersion}
                  onError={setTemplateError}
                  disabled={!enabled}
                />
              ) : null}
              {newImportButton}
            </Stack>
          ) : undefined
        }
      />

      {settings.data && !enabled ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {`${IMPORTS_DISABLED_NOTICE}. Puede consultar el historial, pero no subir ni confirmar cargas.`}
        </Alert>
      ) : null}
      {settings.isError ? (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void settings.refetch()}>
              Reintentar
            </Button>
          }
        >
          {`No se pudo comprobar la configuración de la carga masiva. ${withReference(describeImportError(settings.error))}`}
        </Alert>
      ) : null}
      {templateError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setTemplateError(null)}>
          {templateError}
        </Alert>
      ) : null}

      <Paper component="section" aria-label="Historial de cargas" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <>
              <TextField
                select
                size="small"
                label="Estado"
                value={statusFilter ?? ''}
                onChange={(event) => table.setFilter('status', event.target.value || undefined)}
                sx={{ flex: '0 0 auto', minWidth: (theme) => theme.spacing(24) }}
              >
                <MenuItem value="">Todos</MenuItem>
                {IMPORT_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    {IMPORT_STATUS_LABELS[status]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                type="date"
                size="small"
                label="Desde"
                value={filters.createdFrom ?? ''}
                onChange={(event) => table.setFilter('createdFrom', event.target.value || undefined)}
                error={invertedRange}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: '0 0 auto' }}
              />
              <TextField
                type="date"
                size="small"
                label="Hasta"
                value={filters.createdTo ?? ''}
                onChange={(event) => table.setFilter('createdTo', event.target.value || undefined)}
                error={invertedRange}
                helperText={invertedRange ? '"Desde" es posterior a "Hasta"' : undefined}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: '0 0 auto' }}
              />
            </>
          }
          search={{
            value: table.searchInput,
            onChange: table.setSearchInput,
            label: 'Buscar por código o nombre de archivo',
            placeholder: 'Buscar cargas…',
          }}
        />

        <DataTable
          label="Cargas de clientes"
          columns={COLUMNS}
          rows={imports.data?.data}
          getRowId={(item) => item.id}
          totalItems={imports.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={imports.isPending}
          isFetching={imports.isFetching}
          errorMessage={imports.isError ? withReference(describeImportError(imports.error)) : null}
          onRetry={() => void imports.refetch()}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyIcon={hasFilters ? undefined : <UploadFileOutlinedIcon />}
          emptyAction={emptyAction}
          onRowClick={(item) => navigate(customerImportDetailPath(item.id))}
          getRowLabel={(item) => `Abrir la carga ${item.code} (${item.originalFileName})`}
        />
      </Paper>

      {settings.data && actions.canUpload ? (
        <NewImportDialog
          open={dialogOpen}
          settings={settings.data}
          canDownloadTemplate={actions.canDownloadTemplate}
          onClose={() => setDialogOpen(false)}
          onCreated={(created) => {
            setDialogOpen(false);
            navigate(customerImportDetailPath(created.id));
          }}
        />
      ) : null}
    </>
  );
}
